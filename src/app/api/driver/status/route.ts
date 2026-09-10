import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/authorization'
import { crewWhere, ACTIVE_TRIP_STATUSES } from '@/lib/transport'
export const dynamic = 'force-dynamic'
export async function GET() {
  const actor = await getCurrentUser()
  if (!actor || actor.role !== 'DRIVER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const bus = await prisma.bus.findFirst({ where: { ...crewWhere(actor.id), organizationId: actor.organizationId || '__none__', status: 'ACTIVE' }, include: { driver: { select: { id: true, name: true, phone: true } }, maintainer: { select: { id: true, name: true, phone: true } }, route: { include: { stops: { orderBy: { order: 'asc' } } } } } })
  const activeTrip = bus ? await prisma.trip.findFirst({ where: { busId: bus.id, ...crewWhere(actor.id), status: { in: ACTIVE_TRIP_STATUSES } }, include: { attendances: { orderBy: { timestamp: 'asc' } } } }) : null
  const students = bus ? await prisma.student.findMany({ where: { busId: bus.id, routeId: bus.routeId, organizationId: bus.organizationId, isActive: true, isSelfPickup: false }, select: { id: true, name: true, grade: true, studentCode: true, parentContact1: true, parentId: true, pickupStopId: true, dropoffStopId: true, pickupStop: true, dropoffStop: true } , orderBy: { name: 'asc' } }) : []
  return NextResponse.json({ bus, activeTrip, students })
}
