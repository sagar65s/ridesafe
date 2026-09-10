import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/authorization'
import { locationSchema, validateBody } from '@/lib/validation'
import { redisPublisher } from '@/lib/redis'
import { readLiveTracking } from '@/lib/live-tracking'
import { crewWhere, ACTIVE_TRIP_STATUSES, distanceKm } from '@/lib/transport'
export const dynamic = 'force-dynamic'
export async function GET() {
  const actor = await getCurrentUser()
  if (!actor || !['PARENT','ADMIN','SCHOOL_ADMIN','SUPER_ADMIN'].includes(actor.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  try {
    let where = {}
    if (actor.role === 'PARENT') {
      const students = await prisma.student.findMany({ where: { parentId: actor.id, isActive: true, isSelfPickup: false }, select: { busId: true, routeId: true } })
      where = { OR: students.filter(s => s.busId && s.routeId).map(s => ({ busId: s.busId, routeId: s.routeId })) }
    } else if (actor.role !== 'SUPER_ADMIN') where = { route: { organizationId: actor.organizationId || '__none__' } }
    return NextResponse.json({ drivers: await readLiveTracking(where, actor.role === 'PARENT' ? actor.id : undefined) })
  } catch (error) { console.error('Tracking error', error); return NextResponse.json({ error: 'Live tracking is temporarily unavailable' }, { status: 503 }) }
}
export async function POST(req: NextRequest) {
  const actor = await getCurrentUser()
  if (!actor || actor.role !== 'DRIVER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const validation = validateBody(locationSchema, await req.json().catch(() => null))
  if (!validation.success) return NextResponse.json({ error: validation.error }, { status: 400 })
  const trip = await prisma.trip.findFirst({ where: { ...crewWhere(actor.id), status: { in: ACTIVE_TRIP_STATUSES }, route: { organizationId: actor.organizationId || '__none__' } }, include: { driver: { select: { lastLatitude: true, lastLongitude: true, lastLocationUpdate: true, currentSpeedKmH: true } } } })
  if (!trip) return NextResponse.json({ error: 'Start your assigned trip before sharing GPS' }, { status: 409 })
  const { latitude, longitude } = validation.data, previous = trip.driver, now = new Date()
  const seconds = previous.lastLocationUpdate ? (now.getTime() - previous.lastLocationUpdate.getTime()) / 1000 : 0
  if (seconds > 0 && seconds < 4) return NextResponse.json({ success: true, throttled: true })
  let speed = 0
  if (seconds >= 4 && seconds < 120 && previous.lastLatitude !== null && previous.lastLongitude !== null) speed = Math.min(120, distanceKm({ latitude: previous.lastLatitude, longitude: previous.lastLongitude }, { latitude, longitude }) / seconds * 3600)
  await prisma.user.update({ where: { id: trip.driverId }, data: { lastLatitude: latitude, lastLongitude: longitude, lastLocationUpdate: now, currentSpeedKmH: speed } })
  await readLiveTracking({ id: trip.id }, undefined, { driverId: trip.driverId, location: { lat: latitude, lng: longitude, speed_kmh: speed, timestamp: now.toISOString(), source: 'MOBILE', heading: null, altitude: null, ignition: null } })
  const signal = JSON.stringify({ id: trip.driverId, refresh: true })
  await Promise.allSettled([redisPublisher.publish(`location_updates:${actor.organizationId}`, signal), redisPublisher.publish('location_updates:global', signal)])
  return NextResponse.json({ success: true })
}
