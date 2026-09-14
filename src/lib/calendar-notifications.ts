import prisma from '@/lib/prisma'
import { pushNotification } from '@/lib/notification-delivery'
import { randomUUID } from 'node:crypto'

export function schoolCalendarWindow(now = new Date()) {
  const day = new Date(now.getTime() + 8 * 3600000).toISOString().slice(0, 10)
  const start = new Date(`${day}T00:00:00.000Z`)
  return { day, start, end: new Date(start.getTime() + 2 * 86400000) }
}
export function calendarReminderCopy(locale: string | null, title: string, date: string, tomorrow: boolean) {
  if (locale === 'ms') return { title: tomorrow ? 'Peringatan kalendar esok' : 'Kalendar sekolah hari ini', body: `${title} — ${date}. Sila semak kalendar sekolah untuk jadual pengangkutan.` }
  if (locale === 'zh') return { title: tomorrow ? '明日校历提醒' : '今日校历提醒', body: `${title} — ${date}。请查看学校日历，确认交通安排。` }
  return { title: tomorrow ? 'School calendar reminder for tomorrow' : "Today's school calendar", body: `${title} — ${date}. Check the school calendar for transport arrangements.` }
}
// Called by the independent worker and by parent notification polling.
// Unique keys prevent duplicate alerts across workers/tabs/server instances.
export async function sendCalendarReminders(parentId?: string) {
  const { day, start, end } = schoolCalendarWindow()
  const parent = parentId ? await prisma.user.findFirst({ where: { id: parentId, role: 'PARENT', isActive: true }, select: { organizationId: true } }) : null
  if (parentId && !parent?.organizationId) return 0
  const events = await prisma.academicEvent.findMany({
    where: { isPublic: true, organizationId: parentId ? parent!.organizationId : { not: null }, type: { in: ['HOLIDAY', 'SPECIAL_HOLIDAY', 'FESTIVAL', 'EVENT'] }, startDate: { lt: end }, OR: [{ startDate: { gte: start } }, { endDate: { gte: start } }] },
    orderBy: { startDate: 'asc' },
  })
  let sent = 0
  for (const event of events) {
    let cursor: string | undefined
    do {
      const parents = await prisma.user.findMany({ where: { role: 'PARENT', isActive: true, organization: { isActive: true }, ...(event.organizationId ? { organizationId: event.organizationId } : {}), ...(parentId ? { id: parentId } : {}) }, select: { id: true, locale: true }, orderBy: { id: 'asc' }, take: 100, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) })
      if (!parents.length) break
      const tomorrow = event.startDate >= new Date(start.getTime() + 86400000)
      const date = event.startDate.toISOString().slice(0,10)
      const rows = parents.map(user => ({ id: randomUUID(), userId: user.id, type: 'CALENDAR_REMINDER', dedupeKey: `calendar:${event.id}:${user.id}:${day}`, ...calendarReminderCopy(user.locale, event.title, date, tomorrow), metadata: JSON.stringify({ eventId: event.id, eventTitle: event.title, date, tomorrow }) }))
      await prisma.notification.createMany({ data: rows, skipDuplicates: true })
      const inserted = await prisma.notification.findMany({ where: { id: { in: rows.map(r => r.id) } } })
      for (let i = 0; i < inserted.length; i += 10) await Promise.allSettled(inserted.slice(i, i + 10).map(pushNotification))
      sent += inserted.length
      cursor = parents.length === 100 ? parents[parents.length - 1].id : undefined
    } while (cursor)
  }
  return sent
}

export async function notifyCalendarPublished(organizationId: string | null, referenceId: string) {
  if (!organizationId) return
  let cursor: string | undefined
  do {
    const parents = await prisma.user.findMany({ where: { role: 'PARENT', isActive: true, organization: { isActive: true }, ...(organizationId ? { organizationId } : {}) }, select: { id: true, locale: true }, orderBy: { id: 'asc' }, take: 100, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) })
    if (!parents.length) break
    const rows = parents.map(parent => ({ id: randomUUID(), userId: parent.id, type: 'CALENDAR_UPDATED', dedupeKey: `calendar-published:${referenceId}:${parent.id}`, title: parent.locale === 'ms' ? 'Kalendar sekolah dikemas kini' : parent.locale === 'zh' ? '学校日历已更新' : 'School calendar updated', body: parent.locale === 'ms' ? 'Buka Kalendar Akademik untuk melihat cuti, perayaan dan acara.' : parent.locale === 'zh' ? '打开学校日历，查看假期、节日和活动。' : 'Open Academic Calendar to view holidays, festivals and school events.' }))
    await prisma.notification.createMany({ data: rows, skipDuplicates: true })
    const inserted = await prisma.notification.findMany({ where: { id: { in: rows.map(row => row.id) } } })
    for (let i = 0; i < inserted.length; i += 10) await Promise.allSettled(inserted.slice(i, i + 10).map(pushNotification))
    cursor = parents.length === 100 ? parents[parents.length - 1].id : undefined
  } while (cursor)
}
