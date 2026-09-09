import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getUserFromSession } from '@/lib/auth'
import { locationSchema, validateBody } from '@/lib/validation'
import { redisPublisher } from '@/lib/redis'
import { trackingService } from '@/lib/services/trackingService'
import { resolveUserOrganizationId } from '@/lib/authorization'

export const dynamic = 'force-dynamic'

// Simple in-memory rate limiter: UserId -> LastUpdateTimestamp
const rateLimitMap = new Map<string, number>();
const RATE_LIMIT_MS = 5000;

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromSession()
    if (!user || user.role !== 'DRIVER') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const validation = validateBody(locationSchema, body)
    if (!validation.success) {
      return NextResponse.json({ error: validation.error }, { status: 400 })
    }
    const { latitude, longitude } = validation.data

    // Rate limiting: 1 req / 5 sec
    const now = Date.now();
    const lastUpdate = rateLimitMap.get(user.id);
    if (lastUpdate && now - lastUpdate < RATE_LIMIT_MS) {
      return NextResponse.json({ error: 'Too many requests. Please wait 5 seconds.' }, { status: 429 });
    }
    rateLimitMap.set(user.id, now);

    const existingUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { name: true, organizationId: true, lastLatitude: true, lastLongitude: true, lastLocationUpdate: true, currentSpeedKmH: true }
    })

    let newSpeed = existingUser?.currentSpeedKmH || 30.0;
    if (existingUser?.lastLatitude != null && existingUser?.lastLongitude != null && existingUser.lastLocationUpdate) {
      const distKm = calculateDistance(existingUser.lastLatitude, existingUser.lastLongitude, latitude, longitude);
      const hoursDiff = (Date.now() - existingUser.lastLocationUpdate.getTime()) / (1000 * 60 * 60);

      // Calculate instantaneous speed if time diff is reasonable (between 2 seconds and 1 hour)
      if (hoursDiff > (2 / 3600) && hoursDiff < 1) {
        const instantSpeed = distKm / hoursDiff;
        // Exponential Moving Average: Alpha = 0.3 for smoothing erratic GPS jumps
        newSpeed = (0.3 * instantSpeed) + (0.7 * newSpeed);

        // Sanity constraints
        if (newSpeed > 120) newSpeed = 120; // Cap at 120 km/h
        if (newSpeed < 1) newSpeed = 1;     // Floor at 1 km/h to prevent infinite ETA
      }
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        lastLatitude: latitude,
        lastLongitude: longitude,
        lastLocationUpdate: new Date(),
        currentSpeedKmH: newSpeed
      }
    })

    // Notify linked parents as the active bus crosses the 2-minute and
    // 1-minute ETA thresholds. Notifications are de-duplicated for six hours
    // so a noisy GPS signal cannot repeatedly sound the parent's phone.
    const activeTrip = await prisma.trip.findFirst({
      where: { driverId: user.id, status: { in: ['DRIVER_STARTED_ROUTE', 'BUS_EN_ROUTE'] } },
      select: {
        id: true, busId: true,
        route: {
          select: {
            stops: { orderBy: { order:'asc' }, select: { name:true, latitude:true, longitude:true } },
            students: {
              where: { parentId: { not: null }, isSelfPickup: false, isActive: true },
              select: {
                id: true, name: true, status: true, parentId: true, busId: true,
                pickupStop: { select: { name: true, latitude: true, longitude: true } },
                dropoffStop: { select: { name: true, latitude: true, longitude: true } },
              }
            }
          }
        }
      }
    })
    if (activeTrip) {
      const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000)
      const parentIds = [...new Set(activeTrip.route.students.map(s => s.parentId).filter((id): id is string => Boolean(id)))]
      const existingAlerts = parentIds.length ? await prisma.notification.findMany({
        where: { userId: { in: parentIds }, type: { in: ['BUS_ETA_2_MIN', 'BUS_ETA_1_MIN'] }, createdAt: { gte: sixHoursAgo } },
        select: { userId: true, type: true, dedupeKey: true },
      }) : []
      const alerts: { userId:string; title:string; body:string; type:string; dedupeKey:string }[] = []
      for (const student of activeTrip.route.students) {
        if (!student.parentId || (student.busId && student.busId !== activeTrip.busId)) continue
        const routeStops = activeTrip.route.stops
        const stop = student.status === 'CHECKED_OUT'
          ? (student.dropoffStop || routeStops[routeStops.length - 1])
          : (student.pickupStop || routeStops[0])
        if (!stop) continue
        const stopDistance = calculateDistance(latitude, longitude, stop.latitude, stop.longitude)
        const eta = Math.max(0, Math.ceil((stopDistance / Math.max(newSpeed, 5)) * 60))
        for (const threshold of [2, 1]) {
          if (eta > threshold) continue
          const type = `BUS_ETA_${threshold}_MIN`
          const dedupeKey = `eta:${activeTrip.id}:${student.id}:${threshold}`
          if (existingAlerts.some(n => n.userId === student.parentId && n.type === type && n.dedupeKey === dedupeKey)) continue
          alerts.push({
            userId: student.parentId,
            title: `Bus arriving in about ${threshold} minute${threshold === 1 ? '' : 's'}`,
            body: `${student.name}'s bus is near ${stop.name}. Please be ready.`,
            type, dedupeKey,
          })
        }
      }
      if (alerts.length) await prisma.notification.createMany({ data: alerts, skipDuplicates: true })
    }

    // Fetch school settings for Geofencing
    const { schoolLat, schoolLng, geofenceRadiusKm } = await getSchoolGeo(existingUser?.organizationId)

    const distanceKm = calculateDistance(latitude, longitude, schoolLat, schoolLng);
    const isNear = distanceKm <= geofenceRadiusKm;
    const etaMins = Math.round((distanceKm / newSpeed) * 60);

    // Publish to Redis for real-time SSE
    try {
      const locationMessage = JSON.stringify({
        id: user.id,
        lastLatitude: latitude,
        lastLongitude: longitude,
        currentSpeedKmH: newSpeed,
        lastLocationUpdate: new Date().toISOString(),
        distanceKm,
        etaMins,
        isNear
      })
      if (existingUser?.organizationId) {
        await redisPublisher.publish(`location_updates:${existingUser.organizationId}`, locationMessage)
      }
      await redisPublisher.publish('location_updates:global', locationMessage)
    } catch (err) {
      console.error('Failed to publish location update to Redis', err);
    }

    // ── Night Bus / Late-Night Alert ────────────────────────────────────
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuala_Lumpur', hour: '2-digit', hourCycle: 'h23' }).format(new Date()))
    if (hour >= 19 || hour < 6) {
      // Curfew window: 7 PM to 6 AM — fire warning to admins
      const admins = await prisma.user.findMany({
        where: { role: { in: ['ADMIN', 'SCHOOL_ADMIN'] }, organizationId: existingUser?.organizationId || '__none__' },
        select: { id: true },
      })
      const warningBody = `Driver ${existingUser?.name || user.id} is broadcasting GPS during curfew hours.`
      const recentWarning = await prisma.notification.findFirst({ where: { userId: { in: admins.map(a => a.id) }, title: '🌙 Night Bus Alert', body: warningBody, createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } }, select: { id: true } })
      if (admins.length > 0 && !recentWarning) {
        await prisma.notification.createMany({
          data: admins.map(a => ({
            userId: a.id,
            title: '🌙 Night Bus Alert',
            body: warningBody,
            type: 'WARNING',
          }))
        }).catch(() => {}) // Silent fail — don't block location update
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating location:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Haversine formula to calculate distance in km
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371; // Radius of the earth in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function GET() {
  try {
    const user = await getUserFromSession()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Active trips drive who we should be tracking — this lets buses on
    // hardware GPS (Wialon/Katsana) show up even if the driver's phone
    // never sent a location update (previously this endpoint only ever
    // looked at User.lastLatitude, so hardware-tracked buses never appeared).
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)
    const organizationId = await resolveUserOrganizationId(user.id)
    const { schoolLat, schoolLng, geofenceRadiusKm } = await getSchoolGeo(organizationId)
    let accessWhere: Record<string, unknown> = {}
    if (user.role === 'DRIVER') accessWhere = { driverId: user.id }
    else if (user.role === 'PARENT') {
      const students = await prisma.student.findMany({ where: { parentId: user.id, isActive: true }, select: { routeId: true, busId: true } })
      accessWhere = { OR: students.filter(student => student.routeId).map(student => ({ routeId: student.routeId, ...(student.busId ? { busId: student.busId } : {}) })) }
    } else if (user.role !== 'SUPER_ADMIN') {
      if (!organizationId) return NextResponse.json({ drivers: [] })
      accessWhere = { route: { organizationId } }
    }
    const activeTrips = await prisma.trip.findMany({
      where: { status: { in: ['DRIVER_STARTED_ROUTE', 'BUS_EN_ROUTE'] }, date: { gte: oneDayAgo }, ...accessWhere },
      select: {
        driverId: true,
        busId: true, routeId: true,
        driver: { select: { id: true, name: true, phone: true } },
      },
    })

    // Dedupe by driver (a driver should only have one active trip at a time)
    const byDriver = new Map<string, { driverId: string; busId: string | null; routeId: string; name: string; phone: string | null }>()
    for (const t of activeTrips) {
      if (!byDriver.has(t.driverId)) {
        byDriver.set(t.driverId, { driverId: t.driverId, busId: t.busId, routeId: t.routeId, name: t.driver.name, phone: t.driver.phone })
      }
    }

    const driversWithGeo = await Promise.all(
      Array.from(byDriver.values()).map(async (entry) => {
        let parentTarget: { name: string; latitude: number; longitude: number } | null = null
        if (user.role === 'PARENT') {
          const child = await prisma.student.findFirst({
            where: { parentId: user.id, isActive: true, isSelfPickup: false, routeId: entry.routeId,
              ...(entry.busId ? { OR: [{ busId: entry.busId }, { busId: null }] } : {}) },
            orderBy: { updatedAt: 'desc' },
            select: { status: true, pickupStop: true, dropoffStop: true, route: { select: { stops: { orderBy: { order: 'asc' } } } } },
          })
          if (child) parentTarget = child.status === 'CHECKED_OUT'
            ? (child.dropoffStop || child.route?.stops[child.route.stops.length - 1] || null)
            : (child.pickupStop || child.route?.stops[0] || null)
        }
        const loc = entry.busId ? await trackingService.getLiveLocation(entry.busId, entry.driverId) : null

        let isNear = false
        let distanceKm: number | null = null
        let etaMins: number | null = null
        if (loc) {
          const targetLat = parentTarget?.latitude ?? schoolLat
          const targetLng = parentTarget?.longitude ?? schoolLng
          distanceKm = calculateDistance(loc.lat, loc.lng, targetLat, targetLng)
          isNear = user.role === 'PARENT' ? distanceKm <= Math.max(geofenceRadiusKm, 1) : distanceKm <= geofenceRadiusKm
          const speed = loc.speed_kmh || 30.0
          etaMins = Math.round((distanceKm / speed) * 60)
        }

        return {
          id: entry.driverId,
          name: entry.name,
          phone: entry.phone,
          lastLatitude: loc?.lat ?? null,
          lastLongitude: loc?.lng ?? null,
          currentSpeedKmH: loc?.speed_kmh ?? null,
          lastLocationUpdate: loc?.timestamp ?? null,
          source: loc?.source ?? null,
          distanceKm,
          etaMins,
          isNear,
          targetStop: parentTarget?.name ?? null,
        }
      })
    )

    return NextResponse.json({ drivers: driversWithGeo })
  } catch (error) {
    console.error('Error fetching driver locations:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function getSchoolGeo(organizationId?: string | null) {
  const keys = ['schoolLat', 'schoolLng', 'geofenceRadius']
  const settings = await prisma.systemSetting.findMany({ where: { key: { in: [...keys, ...keys.map(k => `${k}:${organizationId}`)] } } })
  const value = (key: string, fallback: number) => {
    const raw = settings.find(s => s.key === `${key}:${organizationId}`)?.value ?? settings.find(s => s.key === key)?.value
    const parsed = raw === undefined ? fallback : Number(raw)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  return { schoolLat: value('schoolLat', 3.1390), schoolLng: value('schoolLng', 101.6869), geofenceRadiusKm: value('geofenceRadius', 500) / 1000 }
}
