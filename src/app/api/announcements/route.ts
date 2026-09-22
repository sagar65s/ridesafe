import { NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import {pushNotification} from '@/lib/notification-delivery'
import { getUserFromSession } from '@/lib/auth'
import { resolveUserOrganizationId } from '@/lib/authorization'
import { writeAuditLog } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN', 'SCHOOL_ADMIN']

// List past announcements
export async function GET() {
  try {
    const user = await getUserFromSession()
    if (!user || !ADMIN_ROLES.includes(user.role))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const organizationId = await resolveUserOrganizationId(user.id)
    const announcements = await prisma.announcement.findMany({
      where: { deletedAt: null, ...(user.role === 'SUPER_ADMIN' ? {} : { organizationId: organizationId || '__none__' }) },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json({ announcements })
  } catch (e) {
    console.error(e)
    const msg = 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// Broadcast announcement as notifications, and keep a record of the broadcast itself
export async function POST(req: Request) {
  try {
    const user = await getUserFromSession()
    if (!user || !ADMIN_ROLES.includes(user.role))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { title, body, targetRole, type } = await req.json()
    if (typeof title !== 'string' || typeof body !== 'string' || title.length > 160 || body.length > 2000 || !title.trim() || !body.trim()) return NextResponse.json({ error: 'Title and body required' }, { status: 400 })
    const validRoles = ['ALL', 'ADMIN', 'SCHOOL_ADMIN', 'DRIVER', 'PARENT']
    const validTypes = ['INFO', 'WARNING', 'EMERGENCY']
    if (targetRole && !validRoles.includes(targetRole)) return NextResponse.json({ error: 'Invalid target role' }, { status: 400 })
    if (type && !validTypes.includes(type)) return NextResponse.json({ error: 'Invalid notification type' }, { status: 400 })
    const organizationId = await resolveUserOrganizationId(user.id)
    if (user.role !== 'SUPER_ADMIN' && !organizationId) return NextResponse.json({ error: 'Organization assignment required' }, { status: 403 })

    // Find target users
    const where: Prisma.UserWhereInput = { isActive: true }
    if (targetRole && targetRole !== 'ALL') where.role = targetRole
    if (user.role !== 'SUPER_ADMIN') where.AND = [{ OR: [
      { organizationId: organizationId! },
      { role: 'PARENT', parentStudents: { some: { organizationId: organizationId! } } },
    ] }]

    const users = await prisma.user.findMany({ where, select: { id: true } })
    const recipients = users.filter(recipient => recipient.id !== user.id)
    const result = await prisma.$transaction(async tx => {
      const announcement = await tx.announcement.create({ data: {
        title: title.trim(), body: body.trim(), targetRole: targetRole || 'ALL', type: type || 'INFO',
        sentCount: recipients.length, createdBy: user.id, organizationId: user.role === 'SUPER_ADMIN' ? null : organizationId,
      } })
      if (recipients.length) await tx.notification.createMany({ data: recipients.map(recipient => ({
        userId: recipient.id, dedupeKey: `announcement:${announcement.id}:${recipient.id}`,
        title: title.trim(), body: body.trim(), type: type || 'INFO',
      })) })
      return { announcement, notifications: recipients.length ? await tx.notification.findMany({ where: { dedupeKey: { startsWith: `announcement:${announcement.id}:` } } }) : [] }
    })
    await Promise.allSettled(result.notifications.map(pushNotification))
    await writeAuditLog({ actorId: user.id, organizationId: result.announcement.organizationId, action: 'BROADCAST', entityType: 'ANNOUNCEMENT', entityId: result.announcement.id, details: { targetRole: targetRole || 'ALL', sentCount: recipients.length } })
    return NextResponse.json({ sent: recipients.length, targetRole: targetRole || 'ALL', announcement: result.announcement })
  } catch (e) {
    console.error(e)
    const msg = 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const user = await getUserFromSession()
  if (!user || !ADMIN_ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { id } = await req.json().catch(() => ({}))
  if (typeof id !== 'string') return NextResponse.json({ error: 'Announcement ID required' }, { status: 400 })
  const organizationId = await resolveUserOrganizationId(user.id)
  const item = await prisma.announcement.findFirst({ where: { id, deletedAt: null, ...(user.role === 'SUPER_ADMIN' ? {} : { organizationId: organizationId || '__none__' }) } })
  if (!item || (user.role === 'ADMIN' && item.createdBy !== user.id)) return NextResponse.json({ error: 'Not found or not permitted' }, { status: 404 })
  await prisma.announcement.update({ where: { id }, data: { deletedAt: new Date() } })
  return NextResponse.json({ success: true })
}
