import { NextResponse, NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { getUserFromSession } from '@/lib/auth'
import { canAccessOrganization, getCurrentUser } from '@/lib/authorization'

export const dynamic = 'force-dynamic'

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
        const dateParam = searchParams.get('date') || new Date().toISOString().slice(0, 10)
        const routeId = searchParams.get('routeId') || undefined

        const dayStart = new Date(`${dateParam}T00:00:00.000Z`)
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
                where: { routeId: { in: routeIds }, isActive: true },
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

            const roster = (rosterByRoute.get(t.routeId) || []).filter(s => !s.busId || s.busId === t.busId).map(s => {
                const a = latestByStudent.get(s.id)
                return {
                    studentId: s.id, name: s.name, grade: s.grade,
                    status: a?.action || 'NOT_MARKED',
                    attendanceId: a?.id || null,
                    timestamp: a?.timestamp || null,
                }
            })

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
    try {
        const user = await getUserFromSession()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        // Drivers log attendance during a trip; admins can correct/backfill records
        if (user.role !== 'DRIVER' && !ADMIN_ROLES.includes(user.role)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const data = await request.json()
        if (!data.tripId || !data.studentId || !data.action) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
        }
        if (!['PICKED_UP', 'DROPPED_OFF', 'ABSENT'].includes(data.action)) return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
        const [actor, tripRecord, student] = await Promise.all([
            getCurrentUser(),
            prisma.trip.findUnique({ where: { id: data.tripId }, include: { route: { select: { organizationId: true } } } }),
            prisma.student.findUnique({ where: { id: data.studentId } }),
        ])
        if (!actor || !tripRecord || !student || !student.isActive || student.routeId !== tripRecord.routeId || (student.busId && student.busId !== tripRecord.busId)) return NextResponse.json({ error: 'Invalid trip or student assignment' }, { status: 400 })
        if (data.stopId) {
            const stop = await prisma.stop.findFirst({ where: { id: data.stopId, routeId: tripRecord.routeId }, select: { id: true } })
            if (!stop) return NextResponse.json({ error: 'Invalid stop for this trip' }, { status: 400 })
        }
        if (user.role === 'DRIVER' && tripRecord.driverId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        if (user.role !== 'DRIVER' && !canAccessOrganization(actor, tripRecord.route.organizationId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

        if (user.role === 'DRIVER' && ['TRIP_COMPLETED', 'CANCELLED'].includes(tripRecord.status)) return NextResponse.json({ error: 'This trip is closed' }, { status: 409 })
        if (student.isSelfPickup) return NextResponse.json({ error: 'This student uses self pickup' }, { status: 409 })

        const attendanceHistory = await prisma.attendance.findMany({
            where: { tripId: data.tripId, studentId: data.studentId },
            orderBy: { timestamp: 'asc' },
            select: { id: true, action: true, timestamp: true },
        })
        const latestAttendance = attendanceHistory[attendanceHistory.length - 1]
        if (latestAttendance?.action === data.action) return NextResponse.json({ attendance: latestAttendance, idempotent: true })
        if (latestAttendance?.action === 'DROPPED_OFF' || (latestAttendance?.action === 'PICKED_UP' && data.action === 'ABSENT')) return NextResponse.json({ error: 'Invalid attendance transition; use an admin correction' }, { status: 409 })
        if (latestAttendance?.action === 'ABSENT') return NextResponse.json({ error: 'An absent student cannot be boarded on the same trip without an admin correction' }, { status: 409 })
        if (data.action === 'DROPPED_OFF' && !attendanceHistory.some(attendance => attendance.action === 'PICKED_UP')) return NextResponse.json({ error: 'Mark the student boarded before drop-off' }, { status: 409 })

        const dbUser = await prisma.user.findUnique({ where: { id: user.id } })

        const attendance = await prisma.attendance.create({
            data: {
                tripId: data.tripId,
                studentId: data.studentId,
                stopId: data.stopId, // Optional
                action: data.action,
                latitude: dbUser?.lastLatitude ?? null,
                longitude: dbUser?.lastLongitude ?? null
            }
        })

        // Auto-create a notification for the parent
        if (student?.parentId) {
            const verb = data.action === 'PICKED_UP' ? 'picked up' : (data.action === 'DROPPED_OFF' ? 'dropped off' : 'marked absent')
            await prisma.notification.create({
                data: {
                    userId: student.parentId,
                    title: `Student Update`,
                    body: `${student.name} was ${verb}.`,
                    type: 'INFO'
                }
            })
        }

        // ── Bus Capacity / Overcrowding Alert ────────────────────────────
        if (data.action === 'PICKED_UP') {
            if (tripRecord.busId) {
                const bus = await prisma.bus.findUnique({ where: { id: tripRecord.busId }, select: { capacity: true, plateNumber: true } })
                if (bus) {
                    const attendanceEvents = await prisma.attendance.findMany({
                        where: { tripId: data.tripId },
                        orderBy: { timestamp: 'asc' },
                        select: { studentId: true, action: true },
                    })
                    const latestAction = new Map<string, string>()
                    for (const event of attendanceEvents) latestAction.set(event.studentId, event.action)
                    const currentOnBoard = [...latestAction.values()].filter(action => action === 'PICKED_UP').length
                    const ratio = currentOnBoard / bus.capacity

                    if (ratio >= 1) {
                        // OVER CAPACITY
                        const admins = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'SCHOOL_ADMIN'] }, organizationId: tripRecord.route.organizationId }, select: { id: true } })
                        await prisma.notification.createMany({
                            data: admins.map(a => ({
                                userId: a.id,
                                title: '🚨 Overcrowding Alert',
                                body: `Bus ${bus.plateNumber} has ${currentOnBoard}/${bus.capacity} passengers — OVER CAPACITY!`,
                                type: 'EMERGENCY',
                            }))
                        }).catch(() => {})
                    } else if (ratio >= 0.9) {
                        // 90% warning
                        const admins = await prisma.user.findMany({ where: { role: { in: ['ADMIN', 'SCHOOL_ADMIN'] }, organizationId: tripRecord.route.organizationId }, select: { id: true } })
                        await prisma.notification.createMany({
                            data: admins.map(a => ({
                                userId: a.id,
                                title: '⚠️ Bus Nearly Full',
                                body: `Bus ${bus.plateNumber} is at ${currentOnBoard}/${bus.capacity} capacity (${Math.round(ratio * 100)}%).`,
                                type: 'WARNING',
                            }))
                        }).catch(() => {})
                    }
                }
            }
        }

        return NextResponse.json({ attendance })
    } catch (error) {
        console.error('Attendance POST Error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
