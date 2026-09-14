import { NextResponse, NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { getUserFromSession } from '@/lib/auth'
import { canAccessOrganization, getCurrentUser } from '@/lib/authorization'
import { writeAuditLog } from '@/lib/audit'
import { ACTIVE_TRIP_STATUSES, crewWhere, isServiceType, studentUsesBus } from '@/lib/transport'
import { pushNotification } from '@/lib/notification-delivery'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
    try {
        const user = await getUserFromSession()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        const actor = await getCurrentUser()
        if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        if (user.role === 'DRIVER') {
            // Driver gets their trips
            const trips = await prisma.trip.findMany({
                where: crewWhere(user.id),
                include: { route: { include: { stops: { orderBy: { order: 'asc' } } } } },
                orderBy: { date: 'desc' },
                take: 10
            })
            return NextResponse.json({ trips })
        } else if (user.role === 'PARENT') {
            // Parent gets active trips for their kids
            const students = await prisma.student.findMany({ where: { parentId: user.id, isActive: true }, select: { routeId: true, busId: true } })
            const assignments = students.filter(student => student.routeId && student.busId).map(student => ({ routeId: student.routeId as string, ...(student.busId ? { busId: student.busId } : {}) }))
            const trips = await prisma.trip.findMany({
                where: { OR: assignments, status: { in: ACTIVE_TRIP_STATUSES } },
                include: { route: true, driver: { select: { name: true, phone: true } } }
            })
            return NextResponse.json({ trips })
        } else if (['ADMIN', 'SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
            // Admin gets all active/recent trips
            const trips = await prisma.trip.findMany({
                where: actor.role === 'SUPER_ADMIN' ? {} : { route: { organizationId: actor.organizationId || '__none__' } },
                include: { route: true, driver: { select: { name: true } }, bus: { select: { plateNumber: true } } },
                orderBy: { date: 'desc' },
                take: 50
            })
            return NextResponse.json({ trips })
        }
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    } catch (error) {
        console.error('Trips GET Error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    try {
        const user = await getUserFromSession()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const data = await request.json()
        if (user.role === 'PARENT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        if (!['DRIVER', 'ADMIN', 'SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

        const serviceType = isServiceType(data.serviceType) ? data.serviceType : 'MORNING'
        const assignedCrewBus = user.role === 'DRIVER' ? await prisma.bus.findFirst({ where: { ...crewWhere(user.id), status: 'ACTIVE', ...(data.busId ? { id: data.busId } : {}) } }) : null
        if (user.role === 'DRIVER' && !assignedCrewBus) return NextResponse.json({ error: 'An assigned active bus and crew assignment are required' }, { status: 400 })
        if (assignedCrewBus) { data.busId = assignedCrewBus.id; data.routeId = assignedCrewBus.routeId }
        const driverId = assignedCrewBus?.driverId || (assignedCrewBus?.maintainerId === user.id ? user.id : data.driverId)
        if (!driverId || !data.routeId) {
            return NextResponse.json({ error: 'Missing driverId or routeId' }, { status: 400 })
        }
        const actor = await getCurrentUser()
        const [driver, route, bus] = await Promise.all([
            prisma.user.findUnique({ where: { id: driverId }, select: { role: true, organizationId: true, isActive: true, employmentStatus: true } }),
            prisma.route.findUnique({ where: { id: data.routeId }, select: { organizationId: true, isActive: true, _count: { select: { stops:true } } } }),
            data.busId ? prisma.bus.findUnique({ where: { id: data.busId }, select: { organizationId: true, driverId: true, maintainerId: true, routeId: true, status: true } }) : Promise.resolve(null),
        ])
        if (!actor || !driver || driver.role !== 'DRIVER' || !driver.isActive || driver.employmentStatus === 'OFFBOARDED' || !route?.isActive || !canAccessOrganization(actor, route.organizationId) || driver.organizationId !== route.organizationId) {
            return NextResponse.json({ error: 'Invalid cross-organization trip assignment' }, { status: 400 })
        }
        if (data.busId && !bus) {
            return NextResponse.json({ error: 'Invalid bus assignment' }, { status: 400 })
        }
        if (bus && ((bus.driverId && bus.driverId !== driverId) || bus.status !== 'ACTIVE' || bus.organizationId !== route.organizationId || bus.routeId !== data.routeId || (user.role === 'DRIVER' && bus.driverId !== user.id && bus.maintainerId !== user.id))) {
            return NextResponse.json({ error: 'Invalid bus assignment' }, { status: 400 })
        }
        if (user.role === 'DRIVER') {
            const assignedBus = await prisma.bus.findFirst({ where: { ...crewWhere(user.id), routeId: data.routeId, status: 'ACTIVE', ...(data.busId ? { id: data.busId } : {}) }, select: { id: true } })
            if (!assignedBus) return NextResponse.json({ error: 'You can start only your assigned active bus and route' }, { status: 403 })
            data.busId = assignedBus.id
        }
        if (route._count.stops === 0) return NextResponse.json({ error: 'Add at least one stop before starting this route' }, { status: 400 })

        if (!data.busId) return NextResponse.json({ error: 'Select a bus' }, { status: 400 })
        const assignedStudents = await prisma.student.findMany({
            where: { busId: data.busId, isActive: true },
            select: { id: true, organizationId: true, routeId: true, parentId: true, pickupStopId: true, dropoffStopId: true, isSelfPickup: true, selfPickupSession: true, pickupStop: { select: { routeId: true } }, dropoffStop: { select: { routeId: true } }, parent: { select: { organizationId: true } } },
        })
        const serviceStudents = assignedStudents.filter(student => studentUsesBus(student, serviceType))
        if (!serviceStudents.length) return NextResponse.json({ error: `No students use bus transport for the ${serviceType.toLowerCase().replace('_', ' ')} service` }, { status: 409 })
        const incomplete = serviceStudents.filter(student => !student.parentId || !student.pickupStopId || !student.dropoffStopId || !student.routeId).length
        if (incomplete) return NextResponse.json({ error: 'Complete parent, route and stop assignments for every bus student before starting' }, { status: 409 })
        const invalidAssignment = serviceStudents.find(student => student.routeId !== data.routeId || student.organizationId !== route.organizationId || student.pickupStop?.routeId !== data.routeId || student.dropoffStop?.routeId !== data.routeId || student.parent?.organizationId !== route.organizationId)
        if(invalidAssignment) return NextResponse.json({error:'Correct bus, route, stop and parent school assignments before starting'},{status:409})
        const trip = await prisma.$transaction(async tx => {
            await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${driverId} FOR UPDATE`
            await tx.$queryRaw`SELECT id FROM "Bus" WHERE id = ${data.busId} FOR UPDATE`
            const existingTrip = await tx.trip.findFirst({
                where: { status: { in: ACTIVE_TRIP_STATUSES }, OR: [{ driverId }, { busId: data.busId }] },
                select: { id: true },
            })
            if (existingTrip) return null
            return tx.trip.create({ data: { routeId: data.routeId, driverId, maintainerId: bus?.maintainerId, busId: data.busId, serviceType, status: 'DRIVER_STARTED_ROUTE' } })
        })
        if (!trip) return NextResponse.json({ error: 'Driver or bus already has an active trip' }, { status: 409 })

        const parentIds = (await prisma.student.findMany({
            where: { id: { in: serviceStudents.map(student => student.id) }, parentId: { not: null } },
            select: { parentId: true },
        })).map(student => student.parentId).filter((id): id is string => Boolean(id))
        // Trip start must remain successful even when an optional delivery
        // provider is temporarily unavailable. Persist/push alerts best-effort.
        try {
            const notifications = parentIds.length ? await prisma.$transaction(
                [...new Set(parentIds)].map(parentId => prisma.notification.create({
                    data: { userId: parentId, title: 'Bus started', body: 'Your child’s assigned bus has started the trip.', type: 'INFO', dedupeKey: `trip-start:${trip.id}:${parentId}` },
                }))
            ) : []
            await Promise.allSettled(notifications.map(pushNotification))
        } catch (notificationError) {
            console.error('Trip started but parent notification delivery failed:', notificationError)
        }
        try {
            await writeAuditLog({ actorId: user.id, organizationId: route.organizationId, action: 'START', entityType: 'TRIP', entityId: trip.id, details: { driverId, routeId: data.routeId, busId: data.busId || null, serviceType } })
        } catch (auditError) {
            console.error('Trip started but audit logging failed:', auditError)
        }

        return NextResponse.json({ trip })
    } catch (error) {
        console.error('Trips POST Error:', error)
        const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
        if (code === 'P2021' || code === 'P2022' || code === '42703' || code === '42P01') return NextResponse.json({ error: 'Database update is pending. Run npx prisma migrate deploy and try again.' }, { status: 503 })
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
