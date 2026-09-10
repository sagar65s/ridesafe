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
    const user = await getUserFromSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const data = await req.json()

    // Find existing student
    const existing = await prisma.student.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    }
    const actor = await getCurrentUser()
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let updateData = {}

    if (user.role === 'PARENT') {
      // Parent can only update their own child's pickup preferences
      if (existing.parentId !== user.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      if (data.pickupStopId !== undefined || data.dropoffStopId !== undefined || data.isSelfPickup !== undefined) {
        if (await prisma.trip.count({ where: { busId: existing.busId || '__none__', status: { in: ['DRIVER_STARTED_ROUTE', 'BUS_EN_ROUTE'] } } })) return NextResponse.json({ error: 'Stop preferences cannot change during an active trip' }, { status: 409 })
      }
      for (const field of ['pickupStopId', 'dropoffStopId'] as const) {
        if (data[field] !== undefined) {
          if (typeof data[field] !== 'string' || !existing.routeId || !await prisma.stop.findFirst({ where: { id: data[field], routeId: existing.routeId } })) return NextResponse.json({ error: 'Choose a stop on your assigned route' }, { status: 400 })
        }
      }
      if (data.isSelfPickup !== undefined && typeof data.isSelfPickup !== 'boolean') return NextResponse.json({error:'Invalid pickup preference'},{status:400})
      if (data.parentContact2 && (typeof data.parentContact2 !== 'string' || !/^[+0-9\s()\-]{7,20}$/.test(data.parentContact2))) return NextResponse.json({error:'Invalid contact number'},{status:400})
      if (data.pickupTime !== undefined && (typeof data.pickupTime !== 'string' || data.pickupTime.length > 40)) return NextResponse.json({error:'Invalid pickup time'},{status:400})
      if (data.photoUrl !== undefined) return NextResponse.json({error:'Contact the school to update the student photo'},{status:400})
      // Allow parents to update their own transport preferences.
      updateData = {
        ...(data.pickupStopId !== undefined && { pickupStopId: data.pickupStopId }),
        ...(data.dropoffStopId !== undefined && { dropoffStopId: data.dropoffStopId }),
        ...(data.isSelfPickup !== undefined && { isSelfPickup: data.isSelfPickup }),
        ...(data.pickupTime !== undefined && { pickupTime: data.pickupTime }),
        ...(data.photoUrl !== undefined && { photoUrl: data.photoUrl }),
        ...(data.parentContact2 !== undefined && { parentContact2: data.parentContact2 }),
      }
    } else if (user.role === 'DRIVER') {
      return NextResponse.json({ error: 'Use the attendance endpoint' }, { status: 403 })
    } else if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' || user.role === 'SCHOOL_ADMIN') {
      if (!canAccessOrganization(actor, existing.organizationId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      // Relationship fields were previously stripped here, which made the
      // route/parent controls appear to save while silently keeping the old
      // assignment. Allow them only after checking tenant and role ownership.
      if (['parentId','routeId','busId','pickupStopId','dropoffStopId','isActive','isSelfPickup'].some(key => data[key] !== undefined) && existing.busId && await prisma.trip.count({where:{busId:existing.busId,status:{in:['DRIVER_STARTED_ROUTE','BUS_EN_ROUTE']}}})) return NextResponse.json({error:'Assignments cannot change during an active trip'},{status:409})
      const { parentId, routeId, busId, pickupStopId, dropoffStopId } = data
      const targetRouteId = routeId !== undefined ? (routeId || null) : existing.routeId
      const targetBusId = busId !== undefined ? (busId || null) : existing.busId
      const safeData: Record<string, unknown> = {}
      for (const field of ['name','grade','level','parentContact1','parentContact2','selfPickupSession','pickupTime','status','photoUrl','studentCode','className','section','pickupAddress','dropoffAddress'] as const) {
        if (data[field] !== undefined) safeData[field] = typeof data[field] === 'string' ? data[field].trim() || null : data[field]
      }
      if (data.isSelfPickup !== undefined) safeData.isSelfPickup = Boolean(data.isSelfPickup)
      if (data.isActive !== undefined) safeData.isActive = Boolean(data.isActive)
      if (safeData.name !== undefined && (typeof safeData.name !== 'string' || safeData.name.length < 2 || safeData.name.length > 100)) return NextResponse.json({ error: 'Student name must be between 2 and 100 characters' }, { status: 400 })
      if (safeData.grade !== undefined && (typeof safeData.grade !== 'string' || !safeData.grade || safeData.grade.length > 30)) return NextResponse.json({ error: 'Enter a valid grade' }, { status: 400 })
      if (safeData.parentContact1 !== undefined && (typeof safeData.parentContact1 !== 'string' || !/^[+0-9\s()\-]{7,20}$/.test(safeData.parentContact1))) return NextResponse.json({ error: 'Enter a valid primary contact' }, { status: 400 })
      if (safeData.parentContact2 && (typeof safeData.parentContact2 !== 'string' || !/^[+0-9\s()\-]{7,20}$/.test(safeData.parentContact2))) return NextResponse.json({ error: 'Enter a valid secondary contact' }, { status: 400 })
      if (safeData.status !== undefined && !['PENDING','CHECKED_OUT','DROPPED_OFF','INACTIVE'].includes(String(safeData.status))) return NextResponse.json({ error: 'Invalid student status' }, { status: 400 })

      if (routeId) {
        const route = await prisma.route.findUnique({ where: { id: routeId }, select: { organizationId: true, isActive:true } })
        if (!route?.isActive || !canAccessOrganization(actor, route.organizationId) || route.organizationId !== existing.organizationId) {
          return NextResponse.json({ error: 'Invalid route for this student organization' }, { status: 400 })
        }
      }
      if (parentId) {
        const parent = await prisma.user.findUnique({ where: { id: parentId }, select: { role: true, organizationId: true, isActive:true } })
        if (!parent?.isActive || parent.role !== 'PARENT' || !canAccessOrganization(actor, parent.organizationId) || parent.organizationId !== existing.organizationId) {
          return NextResponse.json({ error: 'Invalid parent for this student organization' }, { status: 400 })
        }
      }
      if (busId) {
        const bus = await prisma.bus.findUnique({ where: { id: busId }, select: { organizationId: true, routeId: true, status:true } })
        if (bus?.status !== 'ACTIVE' || bus.organizationId !== existing.organizationId || (routeId && bus.routeId && bus.routeId !== routeId)) return NextResponse.json({ error: 'Invalid bus for this student organization or route' }, { status: 400 })
      }
      if (targetBusId) {
        const targetBus = await prisma.bus.findUnique({ where:{ id:targetBusId }, select:{ organizationId:true,routeId:true,status:true } })
        if (targetBus?.status !== 'ACTIVE' || targetBus.organizationId !== existing.organizationId || (targetRouteId && targetBus.routeId && targetBus.routeId !== targetRouteId)) return NextResponse.json({ error:'Bus and route assignments must belong together' }, { status:400 })
      }
      if (safeData.studentCode && safeData.studentCode !== existing.studentCode) {
        const duplicate = await prisma.student.findFirst({ where: { studentCode: String(safeData.studentCode).trim(), organizationId: existing.organizationId, id: { not: existing.id } }, select: { id: true } })
        if (duplicate) return NextResponse.json({ error: 'Student ID already exists' }, { status: 409 })
        safeData.studentCode = String(safeData.studentCode).trim()
      }

      const stopIds = [pickupStopId, dropoffStopId].filter((id): id is string => typeof id === 'string' && id.length > 0)
      if (stopIds.length > 0) {
        if (!targetRouteId) return NextResponse.json({ error: 'Select a route before assigning stops' }, { status: 400 })
        const validStops = await prisma.stop.count({ where: { id: { in: stopIds }, routeId:targetRouteId } })
        if (validStops !== new Set(stopIds).size) return NextResponse.json({ error: 'Invalid stop for selected route' }, { status: 400 })
      }

      updateData = {
        ...safeData,
        ...(parentId !== undefined && { parentId: parentId || null }),
        ...(routeId !== undefined && { routeId: routeId || null }),
        ...(busId !== undefined && { busId: busId || null }),
        ...(pickupStopId !== undefined && { pickupStopId: pickupStopId || null }),
        ...(dropoffStopId !== undefined && { dropoffStopId: dropoffStopId || null }),
      }
      if (routeId !== undefined && routeId !== existing.routeId) {
        if (pickupStopId === undefined) (updateData as Record<string, unknown>).pickupStopId = null
        if (dropoffStopId === undefined) (updateData as Record<string, unknown>).dropoffStopId = null
      }
    } else {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const student = await prisma.student.update({
      where: { id },
      data: updateData
    })
    if (['ADMIN', 'SUPER_ADMIN', 'SCHOOL_ADMIN'].includes(user.role)) await writeAuditLog({ actorId: user.id, organizationId: student.organizationId, action: 'UPDATE', entityType: 'STUDENT', entityId: student.id, details: { routeId: student.routeId, busId: student.busId, isActive: student.isActive } })

    return NextResponse.json({ student })
  } catch (error) {
    console.error('Error updating student:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permissionSession = await getUserFromSession()
  if (permissionSession?.role === 'ADMIN') return NextResponse.json({ error: 'School Admin access required' }, { status: 403 })
  try {
    const user = await getUserFromSession()
    if (!user || !['ADMIN', 'SUPER_ADMIN', 'SCHOOL_ADMIN'].includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const existing = await prisma.student.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    }
    const actor = await getCurrentUser()
    if (!actor || !canAccessOrganization(actor, existing.organizationId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    if (existing.busId && await prisma.trip.count({where:{busId:existing.busId,status:{in:['DRIVER_STARTED_ROUTE','BUS_EN_ROUTE']}}})) return NextResponse.json({error:'Complete the active trip before deactivating this student'},{status:409})
    const student = await prisma.student.update({ where: { id }, data: { isActive: false, status: 'INACTIVE' } })
    await writeAuditLog({ actorId: user.id, organizationId: student.organizationId, action: 'DEACTIVATE', entityType: 'STUDENT', entityId: student.id })
    return NextResponse.json({ success: true, deactivated: true })
  } catch (error) {
    console.error('Error deleting student:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
