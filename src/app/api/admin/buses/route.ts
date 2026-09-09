import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getUserFromSession } from '@/lib/auth'
import { canAccessOrganization, getCurrentUser } from '@/lib/authorization'
import { writeAuditLog } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    try {
        const auth = await getUserFromSession()
        if (!auth || !['ADMIN', 'SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(auth.role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const actor = await prisma.user.findUnique({ where: { id: auth.id }, select: { organizationId: true } })
        const buses = await prisma.bus.findMany({
            where: auth.role === 'SUPER_ADMIN' ? {} : { organizationId: actor?.organizationId || '__none__' },
            include: {
                driver: { select: { id: true, name: true, phone: true, personnelType: true, employmentStatus: true } },
                route: { select: { id: true, name: true } },
                organization: { select: { id: true, name: true } },
                _count: { select: { students: true, trips: true } },
            },
            orderBy: { createdAt: 'desc' }
        })

        return NextResponse.json({ buses })
    } catch (error) {
        console.error('Bus list error:', error)
        return NextResponse.json({ error: 'Failed to fetch buses' }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        const auth = await getUserFromSession()
        if (!auth || !['ADMIN', 'SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(auth.role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { plateNumber, busNumber, registrationNumber, capacity, status, gpsStatus, driverId, routeId, wialonUnitId, katsanaVehicleId, organizationId } = await request.json()

        if (!plateNumber || !capacity) {
            return NextResponse.json({ error: 'Plate number and capacity are required' }, { status: 400 })
        }

        const actor = await getCurrentUser()
        if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        const resolvedOrganizationId = auth.role === 'SUPER_ADMIN' ? (organizationId || null) : actor.organizationId
        if (!resolvedOrganizationId) return NextResponse.json({ error: 'School assignment is required' }, { status: 400 })
        const organization = await prisma.organization.findUnique({ where: { id: resolvedOrganizationId }, select: { isActive: true } })
        if (!organization?.isActive || !canAccessOrganization(actor, resolvedOrganizationId)) return NextResponse.json({ error: 'Invalid or inactive school' }, { status: 400 })
        const capacityValue = Number(capacity)
        if (!Number.isInteger(capacityValue) || capacityValue < 1 || capacityValue > 200) return NextResponse.json({ error: 'Capacity must be between 1 and 200' }, { status: 400 })
        if (status && !['ACTIVE', 'INACTIVE', 'MAINTENANCE'].includes(status)) return NextResponse.json({ error: 'Invalid bus status' }, { status: 400 })
        if (gpsStatus && !['NOT_CONFIGURED', 'CONFIGURED', 'ONLINE', 'OFFLINE'].includes(gpsStatus)) return NextResponse.json({ error: 'Invalid GPS status' }, { status: 400 })
        if (driverId) {
            const driver = await prisma.user.findUnique({ where: { id: driverId }, select: { role: true, organizationId: true, isActive: true, employmentStatus: true } })
            if (!driver || driver.role !== 'DRIVER' || !driver.isActive || driver.employmentStatus === 'OFFBOARDED' || driver.organizationId !== resolvedOrganizationId) return NextResponse.json({ error: 'Invalid or inactive driver / maintainer' }, { status: 400 })
            const existingAssignment = await prisma.bus.findFirst({ where:{ driverId,status:'ACTIVE' }, select:{ plateNumber:true } })
            if (existingAssignment) return NextResponse.json({ error:`Driver / maintainer is already assigned to bus ${existingAssignment.plateNumber}` }, { status:409 })
        }
        if (routeId) {
            const route = await prisma.route.findUnique({ where: { id: routeId }, select: { organizationId: true, isActive: true } })
            if (!route?.isActive || route.organizationId !== resolvedOrganizationId || !canAccessOrganization(actor, route.organizationId)) return NextResponse.json({ error: 'Invalid or inactive route assignment' }, { status: 400 })
        }
        const bus = await prisma.bus.create({
            data: {
                plateNumber: String(plateNumber).trim().toUpperCase(),
                busNumber: busNumber?.trim() || null,
                registrationNumber: registrationNumber?.trim() || null,
                capacity: capacityValue,
                status: status || 'ACTIVE',
                gpsStatus: gpsStatus || ((wialonUnitId || katsanaVehicleId) ? 'CONFIGURED' : 'NOT_CONFIGURED'),
                driverId: driverId || null,
                routeId: routeId || null,
                wialonUnitId: wialonUnitId || null,
                katsanaVehicleId: katsanaVehicleId || null,
                organizationId: resolvedOrganizationId,
            },
            include: {
                driver: true,
                route: true
            }
        })

        if (driverId) await prisma.driverAssignmentHistory.create({ data: { driverId, busId: bus.id, routeId: bus.routeId, action: 'ASSIGNED' } })
        await writeAuditLog({ actorId: auth.id, organizationId: bus.organizationId, action: 'CREATE', entityType: 'BUS', entityId: bus.id, details: { plateNumber: bus.plateNumber, driverId, routeId } })

        return NextResponse.json({ bus })
    } catch (error: unknown) {
        if ((error as { code?: string })?.code === 'P2002') return NextResponse.json({ error: 'A bus with this plate number already exists' }, { status: 409 })
        console.error('Bus create error:', error)
        return NextResponse.json({ error: 'Failed to create bus' }, { status: 500 })
    }
}
