import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getUserFromSession } from '@/lib/auth'
import { canAccessOrganization, getCurrentUser } from '@/lib/authorization'
import { crewWhere } from '@/lib/transport'
import { writeAuditLog } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const actor = await getCurrentUser()
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let students;

    if (user.role === 'ADMIN' || user.role === 'SUPER_ADMIN' || user.role === 'SCHOOL_ADMIN') {
      // Admins see all students
      students = await prisma.student.findMany({
        where: actor.role === 'SUPER_ADMIN' ? {} : { organizationId: actor.organizationId || '__none__' },
        include: {
          parent: { select: { id: true, name: true, phone: true } },
          route: { select: { id: true, name: true } },
          pickupStop: { select: { id: true, name: true } },
          dropoffStop: { select: { id: true, name: true } },
          bus: { select: { id: true, busNumber: true, plateNumber: true, status: true, driver: { select: { id: true, name: true, phone: true, personnelType: true } }, maintainer: { select: { id: true, name: true, phone: true, personnelType: true } } } },
        }
      })
    } else if (user.role === 'DRIVER') {
      // A driver/maintainer can only see students assigned to their own bus or route.
      const assignedBuses = await prisma.bus.findMany({ where: { ...crewWhere(user.id), status: 'ACTIVE', organizationId: actor.organizationId || '__none__' }, select: { id: true, routeId: true } })
      const busIds = assignedBuses.map(bus => bus.id)
      const routeIds = assignedBuses.map(bus => bus.routeId).filter((id): id is string => Boolean(id))
      students = await prisma.student.findMany({
        where: {
          organizationId: actor.organizationId || '__none__', isActive: true,
          busId: { in: busIds },
        },
        include: {
          parent: { select: { id: true, name: true, phone: true } },
          route: { select: { id: true, name: true } },
          pickupStop: { select: { id: true, name: true } },
          dropoffStop: { select: { id: true, name: true } },
          bus: { select: { id: true, busNumber: true, plateNumber: true, status: true } },
        },
        orderBy: { name: 'asc' }
      })
    } else if (user.role === 'PARENT') {
      // Parents see only their own students
      students = await prisma.student.findMany({
        where: { parentId: user.id, isActive: true },
        include: {
          route: { include: { stops: { orderBy: { order: 'asc' } } } },
          bus: { select: { id: true, busNumber: true, plateNumber: true, status: true, driver: { select: { id: true, name: true, phone: true, personnelType: true } }, maintainer: { select: { id: true, name: true, phone: true, personnelType: true } } } },
          pickupStop: true, dropoffStop: true,
        },
      })
    } else {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    return NextResponse.json({ students })
  } catch (error) {
    console.error('Error fetching students:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const permissionSession = await getUserFromSession()
  if (permissionSession?.role === 'ADMIN') return NextResponse.json({ error: 'School Admin access required' }, { status: 403 })
  try {
    const user = await getUserFromSession()
    if (!user || (!['ADMIN', 'SUPER_ADMIN', 'SCHOOL_ADMIN'].includes(user.role))) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const actor = await getCurrentUser()
    if (!actor || (actor.role !== 'SUPER_ADMIN' && !actor.organizationId)) return NextResponse.json({ error: 'Organization required' }, { status: 400 })

    // Validate required fields
    const {
      name, grade, level, parentContact1, parentContact2, isSelfPickup, selfPickupSession,
      routeId, busId, parentId, pickupStopId, dropoffStopId, organizationId,
      studentCode, className, section, pickupAddress, dropoffAddress, isActive,
    } = body

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      return NextResponse.json({ error: 'Student name must be at least 2 characters' }, { status: 400 })
    }
    if (!grade || typeof grade !== 'string' || !grade.trim()) {
      return NextResponse.json({ error: 'Grade is required' }, { status: 400 })
    }
    if (!parentContact1 || typeof parentContact1 !== 'string' || !parentContact1.trim()) {
      return NextResponse.json({ error: 'Primary parent contact is required' }, { status: 400 })
    }
    if (!/^[+0-9\s()\-]{7,20}$/.test(parentContact1.trim()) || (parentContact2 && !/^[+0-9\s()\-]{7,20}$/.test(String(parentContact2).trim()))) return NextResponse.json({ error: 'Enter valid parent contact numbers' }, { status: 400 })
    const resolvedOrganizationId = actor.role === 'SUPER_ADMIN' ? (organizationId || null) : actor.organizationId
    if (!resolvedOrganizationId) return NextResponse.json({ error: 'Select a school for this student' }, { status: 400 })
    const organization = await prisma.organization.findUnique({ where: { id:resolvedOrganizationId }, select:{ isActive:true } })
    if (!organization?.isActive || !canAccessOrganization(actor, resolvedOrganizationId)) return NextResponse.json({ error: 'Invalid or inactive school' }, { status: 400 })
    if (routeId) {
      const route = await prisma.route.findUnique({ where: { id: routeId }, select: { organizationId: true, isActive:true } })
      if (!route?.isActive || route.organizationId !== resolvedOrganizationId || !canAccessOrganization(actor, route.organizationId)) return NextResponse.json({ error: 'Invalid or inactive route' }, { status: 400 })
    }
    if (parentId) {
      const parent = await prisma.user.findUnique({ where: { id: parentId }, select: { role: true, organizationId: true, isActive:true } })
      if (!parent?.isActive || parent.role !== 'PARENT' || parent.organizationId !== resolvedOrganizationId || !canAccessOrganization(actor, parent.organizationId)) return NextResponse.json({ error: 'Invalid parent' }, { status: 400 })
    }
    if (busId) {
      const bus = await prisma.bus.findUnique({ where: { id: busId }, select: { organizationId: true, routeId: true, status:true } })
      if (bus?.status !== 'ACTIVE' || bus.organizationId !== resolvedOrganizationId || !canAccessOrganization(actor, bus.organizationId) || (routeId && bus.routeId !== routeId)) return NextResponse.json({ error: 'Invalid bus for the selected school or route' }, { status: 400 })
    }
    if (studentCode) {
      const duplicate = await prisma.student.findFirst({ where: { studentCode: String(studentCode).trim(), organizationId: resolvedOrganizationId }, select: { id: true } })
      if (duplicate) return NextResponse.json({ error: 'Student ID already exists' }, { status: 409 })
    }
    const stopIds = [pickupStopId, dropoffStopId].filter((id): id is string => typeof id === 'string' && id.length > 0)
    if (stopIds.length) {
      if (!routeId) return NextResponse.json({ error: 'Select a route before assigning stops' }, { status: 400 })
      const validStopCount = await prisma.stop.count({ where: { id: { in: stopIds }, routeId } })
      if (validStopCount !== new Set(stopIds).size) return NextResponse.json({ error: 'Invalid pickup or drop-off stop' }, { status: 400 })
    }

    const studentData: Record<string, unknown> = {
      name: name.trim(),
      grade: grade.trim(),
      level: (level || 'Primary').trim(),
      parentContact1: parentContact1.trim(),
      parentContact2: parentContact2?.trim() || null,
      isSelfPickup: Boolean(isSelfPickup),
      selfPickupSession: selfPickupSession || null,
      routeId: routeId || null,
      busId: busId || null,
      parentId: parentId || null,
      pickupStopId: pickupStopId || null,
      dropoffStopId: dropoffStopId || null,
      studentCode: studentCode?.trim() || null,
      className: className?.trim() || null,
      section: section?.trim() || null,
      pickupAddress: pickupAddress?.trim() || null,
      dropoffAddress: dropoffAddress?.trim() || null,
      isActive: isActive !== false,
      organizationId: resolvedOrganizationId,
    }

    const student = await prisma.student.create({ data: studentData as Parameters<typeof prisma.student.create>[0]['data'] })
    await writeAuditLog({ actorId: user.id, organizationId: student.organizationId, action: 'CREATE', entityType: 'STUDENT', entityId: student.id, details: { studentCode: student.studentCode, routeId: student.routeId, busId: student.busId } })

    return NextResponse.json({ student })
  } catch (error) {
    console.error('Error creating student:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
