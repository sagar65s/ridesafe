import { NextResponse, NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { getUserFromSession } from '@/lib/auth'
import { canAccessOrganization, getCurrentUser } from '@/lib/authorization'
import { nextAttendanceAction, distanceKm } from '@/lib/transport'
import { pushNotification, transportMessage } from '@/lib/notification-delivery'

export const dynamic = 'force-dynamic'

class AttendanceError extends Error {}
const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN', 'SCHOOL_ADMIN']

export async function GET(request: NextRequest) {
    try {
        const user = await getUserFromSession()
        if (!user || !ADMIN_ROLES.includes(user.role)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
        const actor = await getCurrentUser()
        if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { searchParams } = new URL(request.url)
        const dateParam = searchParams.get('date') || new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Kuala_Lumpur'})
        const routeId = searchParams.get('routeId') || undefined

        const dayStart = new Date(`${dateParam}T00:00:00.000+08:00`)
        const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
        if (isNaN(dayStart.getTime())) {
            return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
        }

        const trips = await prisma.trip.findMany({
            where: {
                date: { gte: dayStart, lt: dayEnd },
                ...(routeId ? { routeId } : {}),
                ...(actor.role === 'SUPER_ADMIN' ? {} : { route: { organizationId: actor.organizationId || '__none__' } }),
            },
            orderBy: { date: 'asc' },
            include: {
                route: { select: { id: true, name: true } },
                driver: { select: { id: true, name: true } },
                bus: { select: { plateNumber: true } },
                attendances: {
                    orderBy: { timestamp: 'asc' },
                    include: { student: { select: { id: true, name: true, grade: true } } }
                }
            }
        })

        const routeIds = [...new Set(trips.map(t => t.routeId))]
        const rosterByRoute = new Map<string, { id: string; name: string; grade: string; busId: string | null }[]>()
        if (routeIds.length > 0) {
            const students = await prisma.student.findMany({
                where: { routeId: { in: routeIds }, isActive: true, isSelfPickup: false },
                select: { id: true, name: true, grade: true, routeId: true, busId: true }
            })
            for (const s of students) {
                if (!s.routeId) continue
                if (!rosterByRoute.has(s.routeId)) rosterByRoute.set(s.routeId, [])
                rosterByRoute.get(s.routeId)!.push({ id: s.id, name: s.name, grade: s.grade, busId: s.busId })
            }
        }

        const result = trips.map(t => {
            // Latest attendance record per student (in case of duplicate taps)
            const latestByStudent = new Map<string, typeof t.attendances[number]>()
            for (const a of t.attendances) latestByStudent.set(a.studentId, a)

            const roster = (rosterByRoute.get(t.routeId) || []).filter(s => s.busId === t.busId).map(s => {
                const a = latestByStudent.get(s.id)
                return {
                    studentId: s.id, name: s.name, grade: s.grade,
                    status: a?.action || 'NOT_MARKED',
                    attendanceId: a?.id || null,
                    timestamp: a?.timestamp || null,
                }
            })

            for (const [studentId,a] of latestByStudent) {
              if (!roster.some(s=>s.studentId===studentId)) roster.push({studentId,name:a.student.name,grade:a.student.grade,status:a.action,attendanceId:a.id,timestamp:a.timestamp})
            }

            return {
                tripId: t.id, date: t.date, status: t.status,
                routeId: t.route.id, routeName: t.route.name,
                driverName: t.driver.name, busPlate: t.bus?.plateNumber || null,
                roster,
            }
        })

        return NextResponse.json({ trips: result, date: dateParam })
    } catch (error) {
        console.error('Attendance GET Error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
  const actor = await getCurrentUser()
  if (!actor || !['DRIVER', 'SUPER_ADMIN', 'SCHOOL_ADMIN'].includes(actor.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const data = await request.json().catch(() => ({}))
  if (typeof data.tripId !== 'string' || typeof data.studentId !== 'string' || !['PICKED_UP', 'DROPPED_OFF', 'ABSENT'].includes(data.action)) return NextResponse.json({ error: 'Invalid attendance details' }, { status: 400 })
  try {
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Trip" WHERE id = ${data.tripId} FOR UPDATE`
      const trip = await tx.trip.findUnique({ where: { id: data.tripId }, include: { route: true } })
      const student = await tx.student.findUnique({ where: { id: data.studentId }, include: { pickupStop: true, dropoffStop: true, parent: { select: { id: true, locale: true } } } })
      if (!trip || !student || !student.isActive || student.isSelfPickup || student.routeId !== trip.routeId || student.busId !== trip.busId || student.organizationId !== trip.route.organizationId) throw new AttendanceError('Invalid trip or student assignment')
      if (!canAccessOrganization(actor, trip.route.organizationId) || actor.role === 'DRIVER' && actor.id !== trip.driverId && actor.id !== trip.maintainerId) return { forbidden: true }
      if (!['DRIVER_STARTED_ROUTE', 'BUS_EN_ROUTE'].includes(trip.status)) throw new AttendanceError('This trip is closed')
      const history = await tx.attendance.findMany({ where: { tripId: trip.id, studentId: student.id }, orderBy: { timestamp: 'asc' } })
      const previous = history.find(item => item.action === data.action)
      if (previous) return { attendance: previous, idempotent: true }
      const expected = nextAttendanceAction(history.map(item => item.action))
      if (!expected || data.action === 'ABSENT' && expected !== 'PICKED_UP' || data.action !== 'ABSENT' && data.action !== expected) throw new AttendanceError('Invalid attendance transition')
      const stop = data.action === 'DROPPED_OFF' ? student.dropoffStop : student.pickupStop
      if (data.action !== 'ABSENT' && (!stop || data.stopId !== stop.id)) throw new AttendanceError('Use the assigned student stop')
      const staff = await tx.user.findUnique({ where: { id: actor.id }, select: { name: true } })
      // Staff must explicitly confirm the stop. A supplied fresh GPS position is checked too.
      const latitude = typeof data.latitude === 'number' ? data.latitude : null
      const longitude = typeof data.longitude === 'number' ? data.longitude : null
      if (data.action !== 'ABSENT' && data.confirmStop !== true) throw new AttendanceError('Confirm that the bus is at the assigned stop')
      if (latitude !== null && longitude !== null && stop && data.action !== 'ABSENT') {
        if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || distanceKm({ latitude, longitude }, stop) > 0.3) throw new AttendanceError('GPS is more than 300 metres from the assigned stop')
      }
      const attendance = await tx.attendance.create({ data: { tripId: trip.id, studentId: student.id, stopId: data.action === 'ABSENT' ? null : stop!.id, action: data.action, latitude, longitude, recordedById: actor.id, dedupeKey: `${trip.id}:${student.id}:${data.action}` } })
      await tx.student.update({ where: { id: student.id }, data: { status: data.action === 'PICKED_UP' ? 'CHECKED_OUT' : data.action === 'DROPPED_OFF' ? 'DROPPED_OFF' : 'PENDING' } })
      const notification = student.parent ? await tx.notification.create({ data: { userId: student.parent.id, ...transportMessage(student.parent.locale, data.action, student.name, stop?.name || '', staff?.name || ''), type: data.action, metadata: JSON.stringify({ studentName: student.name, stopName: stop?.name || '', actorName: staff?.name || '', studentId: student.id, tripId: trip.id, stopId: stop?.id, timestamp: attendance.timestamp }), dedupeKey: `attendance:${attendance.id}` } }) : null
      return { attendance, notification }
    })
    if ('forbidden' in result) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (result.notification) await pushNotification(result.notification)
    return NextResponse.json({ attendance: result.attendance, idempotent: result.idempotent || false })
  } catch (error) { if (error instanceof AttendanceError) return NextResponse.json({ error: error.message }, { status: 409 }); console.error('Attendance error',error);return NextResponse.json({error:'Unable to record attendance'},{status:500}) }
}
