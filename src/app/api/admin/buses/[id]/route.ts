import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getUserFromSession } from '@/lib/auth'
import { canAccessOrganization, getCurrentUser } from '@/lib/authorization'
import { writeAuditLog } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permissionSession = await getUserFromSession()
  if (permissionSession?.role === 'ADMIN') return NextResponse.json({ error: 'School Admin access required' }, { status: 403 })
  try {
    const auth = await getUserFromSession()
    if (!auth || !['ADMIN', 'SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(auth.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const existing = await prisma.bus.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Bus not found' }, { status: 404 })
    }
    const actor = await getCurrentUser()
    if (!actor || !canAccessOrganization(actor, existing.organizationId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { plateNumber, busNumber, registrationNumber, capacity, status, gpsStatus, driverId, maintainerId, routeId, wialonUnitId, katsanaVehicleId } = await req.json()
    const updates: Record<string, unknown> = {}

    if (plateNumber !== undefined) {
      if (!plateNumber || !String(plateNumber).trim()) {
        return NextResponse.json({ error: 'Plate number is required' }, { status: 400 })
      }
      updates.plateNumber = String(plateNumber).trim()
    }
    if (capacity !== undefined) {
      const cap = parseInt(capacity)
      if (isNaN(cap) || cap < 1 || cap > 200) {
        return NextResponse.json({ error: 'Capacity must be a number between 1 and 200' }, { status: 400 })
      }
      updates.capacity = cap
    }
    if (status !== undefined) {
      if (!['ACTIVE', 'INACTIVE', 'MAINTENANCE'].includes(status)) return NextResponse.json({ error: 'Invalid bus status' }, { status: 400 })
      updates.status = status
    }
    if (busNumber !== undefined) updates.busNumber = busNumber?.trim() || null
    if (registrationNumber !== undefined) updates.registrationNumber = registrationNumber?.trim() || null
    if (gpsStatus !== undefined) {
      if (!['NOT_CONFIGURED', 'CONFIGURED', 'ONLINE', 'OFFLINE'].includes(gpsStatus)) return NextResponse.json({ error: 'Invalid GPS status' }, { status: 400 })
      updates.gpsStatus = gpsStatus
    }
    if (driverId !== undefined) updates.driverId = driverId || null
    if (maintainerId !== undefined) updates.maintainerId = maintainerId || null
    if (routeId !== undefined) updates.routeId = routeId || null
    if (wialonUnitId !== undefined) updates.wialonUnitId = wialonUnitId || null
    if (katsanaVehicleId !== undefined) updates.katsanaVehicleId = katsanaVehicleId || null

    if (driverId) {
      const driver = await prisma.user.findUnique({ where: { id: driverId }, select: { role: true, personnelType: true, organizationId: true, isActive: true, employmentStatus: true } })
      if (!driver || driver.role !== 'DRIVER' || driver.personnelType === 'MAINTAINER' || !driver.isActive || driver.employmentStatus === 'OFFBOARDED' || driver.organizationId !== existing.organizationId || !canAccessOrganization(actor, driver.organizationId)) return NextResponse.json({ error: 'Invalid or inactive driver / maintainer assignment' }, { status: 400 })
      const conflictingBus = await prisma.bus.findFirst({ where:{ driverId,status:'ACTIVE',id:{not:id} }, select:{plateNumber:true} })
      if (conflictingBus) return NextResponse.json({ error:`Driver / maintainer is already assigned to bus ${conflictingBus.plateNumber}` }, { status:409 })
    }
    if (maintainerId) {
      if (maintainerId === (driverId === undefined ? existing.driverId : driverId)) return NextResponse.json({ error: 'Choose separate driver and maintainer accounts' }, { status: 400 })
      const maintainer = await prisma.user.findUnique({ where: { id: maintainerId }, select: { role: true, personnelType: true, organizationId: true, isActive: true } })
      if (!maintainer || maintainer.role !== 'DRIVER' || maintainer.personnelType !== 'MAINTAINER' || !maintainer.isActive || maintainer.organizationId !== existing.organizationId) return NextResponse.json({ error: 'Invalid maintainer for this school' }, { status: 400 })
      const assigned = await prisma.bus.findFirst({ where: { maintainerId, status: 'ACTIVE', id: { not: id } } })
      if (assigned) return NextResponse.json({ error: 'Maintainer already assigned to another bus' }, { status: 409 })
    }
    if (routeId) {
      const route = await prisma.route.findUnique({ where: { id: routeId }, select: { organizationId: true, isActive: true } })
      if (!route || !route.isActive || route.organizationId !== existing.organizationId || !canAccessOrganization(actor, route.organizationId)) return NextResponse.json({ error: 'Invalid or inactive route assignment' }, { status: 400 })
    }

    if ((maintainerId !== undefined && maintainerId !== existing.maintainerId || driverId !== undefined && driverId !== existing.driverId || routeId !== undefined && routeId !== existing.routeId || status !== undefined && status !== existing.status) && await prisma.trip.count({ where: { busId: id, status: { notIn: ['TRIP_COMPLETED', 'CANCELLED'] } } })) return NextResponse.json({ error: 'Complete or cancel active trips before reassigning this bus' }, { status: 409 })

    const bus = await prisma.$transaction(async tx => {
      if (driverId !== undefined && existing.driverId && driverId !== existing.driverId) await tx.driverAssignmentHistory.create({ data: { driverId: existing.driverId, busId: id, routeId: existing.routeId, action: 'UNASSIGNED', reason: driverId ? 'Bus reassigned' : 'Bus assignment removed' } })
      const updated = await tx.bus.update({
        where: { id }, data: updates,
        include: { driver: { select: { id: true, name: true, phone: true, personnelType: true, employmentStatus: true } },
                maintainer: { select: { id: true, name: true, phone: true } }, route: { select: { id: true, name: true } } },
      })
      if (driverId && driverId !== existing.driverId) await tx.driverAssignmentHistory.create({ data: { driverId, busId: id, routeId: updated.routeId, action: existing.driverId ? 'REASSIGNED' : 'ASSIGNED' } })
      return updated
    })
    await writeAuditLog({ actorId: auth.id, organizationId: existing.organizationId, action: 'UPDATE', entityType: 'BUS', entityId: id, details: { driverId: bus.driverId, routeId: bus.routeId, status: bus.status } })

    return NextResponse.json({ bus })
  } catch (error: unknown) {
    const code = (error as { code?: string })?.code
    if (code === 'P2002') {
      return NextResponse.json({ error: 'A bus with this plate number already exists' }, { status: 409 })
    }
    console.error('Bus update error:', error)
    return NextResponse.json({ error: 'Failed to update bus' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permissionSession = await getUserFromSession()
  if (permissionSession?.role === 'ADMIN') return NextResponse.json({ error: 'School Admin access required' }, { status: 403 })
  try {
    const auth = await getUserFromSession()
    if (!auth || !['ADMIN', 'SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(auth.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const existing = await prisma.bus.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Bus not found' }, { status: 404 })
    }
    const actor = await getCurrentUser()
    if (!actor || !canAccessOrganization(actor, existing.organizationId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (await prisma.trip.count({ where: { busId: id, status: { notIn: ['TRIP_COMPLETED', 'CANCELLED'] } } })) return NextResponse.json({ error: 'Complete or cancel active trips before deactivating this bus' }, { status: 409 })

    const bus = await prisma.$transaction(async tx => {
      if (existing.driverId) await tx.driverAssignmentHistory.create({ data: { driverId: existing.driverId, busId: id, routeId: existing.routeId, action: 'UNASSIGNED', reason: 'Bus deactivated' } })
      return tx.bus.update({ where: { id }, data: { status: 'INACTIVE', driverId: null, maintainerId: null } })
    })
    await writeAuditLog({ actorId: auth.id, organizationId: existing.organizationId, action: 'DEACTIVATE', entityType: 'BUS', entityId: id, details: { plateNumber: bus.plateNumber } })
    return NextResponse.json({ success: true, deactivated: true })
  } catch (error: unknown) {
    console.error('Bus delete error:', error)
    return NextResponse.json({ error: 'Failed to deactivate bus' }, { status: 500 })
  }
}
