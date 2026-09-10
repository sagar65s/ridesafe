import { NextResponse, NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { getUserFromSession } from '@/lib/auth'
import { canAccessOrganization, getCurrentUser } from '@/lib/authorization'
import { writeAuditLog } from '@/lib/audit'
import { crewWhere } from '@/lib/transport'

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
                where: { OR: assignments, status: { notIn: ['TRIP_COMPLETED', 'CANCELLED'] } },
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

        const assignedCrewBus = user.role === 'DRIVER' ? await prisma.bus.findFirst({ where: { ...crewWhere(user.id), status: 'ACTIVE', ...(data.busId ? { id: data.busId } : {}) } }) : null
        if (user.role === 'DRIVER' && !assignedCrewBus?.driverId) return NextResponse.json({ error: 'An assigned bus and driver are required' }, { status: 400 })
        if (assignedCrewBus) { data.busId = assignedCrewBus.id; data.routeId = assignedCrewBus.routeId }
        const driverId = assignedCrewBus?.driverId || data.driverId
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
        if (bus && (bus.driverId !== driverId || bus.status !== 'ACTIVE' || bus.organizationId !== route.organizationId || bus.routeId !== data.routeId || (user.role === 'DRIVER' && bus.driverId !== user.id && bus.maintainerId !== user.id))) {
            return NextResponse.json({ error: 'Invalid bus assignment' }, { status: 400 })
        }
        if (user.role === 'DRIVER') {
            const assignedBus = await prisma.bus.findFirst({ where: { ...crewWhere(user.id), routeId: data.routeId, status: 'ACTIVE', ...(data.busId ? { id: data.busId } : {}) }, select: { id: true } })
            if (!assignedBus) return NextResponse.json({ error: 'You can start only your assigned active bus and route' }, { status: 403 })
            data.busId = assignedBus.id
        }
        if (route._count.stops === 0) return NextResponse.json({ error: 'Add at least one stop before starting this route' }, { status: 400 })

        if (!data.busId) return NextResponse.json({ error: 'Select a bus' }, { status: 400 })
        const incomplete = await prisma.student.count({ where: { busId: data.busId, isActive: true, isSelfPickup: false, OR: [{ parentId: null }, { pickupStopId: null }, { dropoffStopId: null }, { routeId: null }] } })
        if (incomplete) return NextResponse.json({ error: 'Complete parent, route and stop assignments for every bus student before starting' }, { status: 409 })
        const invalidAssignment = await prisma.student.findFirst({where:{busId:data.busId,isActive:true,isSelfPickup:false,OR:[{routeId:{not:data.routeId}},{organizationId:{not:route.organizationId}},{pickupStop:{routeId:{not:data.routeId}}},{dropoffStop:{routeId:{not:data.routeId}}},{parent:{organizationId:{not:route.organizationId}}}]},select:{id:true}})
        if(invalidAssignment) return NextResponse.json({error:'Correct bus, route, stop and parent school assignments before starting'},{status:409})
        const trip = await prisma.$transaction(async tx => {
            await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`trip-driver:${driverId}`}))`
            if (data.busId) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`trip-bus:${data.busId}`}))`
            const existingTrip = await tx.trip.findFirst({
                where: { status: { notIn: ['TRIP_COMPLETED', 'CANCELLED'] }, OR: [{ driverId }, ...(data.busId ? [{ busId: data.busId }] : [])] },
                select: { id: true },
            })
            if (existingTrip) return null
            return tx.trip.create({ data: { routeId: data.routeId, driverId, maintainerId: bus?.maintainerId, busId: data.busId, status: 'DRIVER_STARTED_ROUTE' } })
        })
        if (!trip) return NextResponse.json({ error: 'Driver or bus already has an active trip' }, { status: 409 })

        const parentIds = (await prisma.student.findMany({
            where: { routeId: data.routeId, isActive: true, parentId: { not: null }, busId: data.busId, isSelfPickup: false },
            select: { parentId: true },
        })).map(student => student.parentId).filter((id): id is string => Boolean(id))
        if (parentIds.length) await prisma.notification.createMany({
            data: [...new Set(parentIds)].map(parentId => ({ userId: parentId, title: 'Bus started', body: 'Your child’s assigned bus has started the trip.', type: 'INFO' })),
        })
        await writeAuditLog({ actorId: user.id, organizationId: route.organizationId, action: 'START', entityType: 'TRIP', entityId: trip.id, details: { driverId, routeId: data.routeId, busId: data.busId || null } })

        return NextResponse.json({ trip })
    } catch (error) {
        console.error('Trips POST Error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
