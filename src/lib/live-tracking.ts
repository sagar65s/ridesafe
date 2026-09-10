import type { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { trackingService, type LiveLocation } from '@/lib/services/trackingService'
import { distanceKm, nextAttendanceAction, ACTIVE_TRIP_STATUSES } from '@/lib/transport'
import { transportMessage, pushNotification } from '@/lib/notification-delivery'

export async function readLiveTracking(where: Prisma.TripWhereInput, parentId?: string, supplied?: { driverId: string; location: LiveLocation }) {
  const trips = await prisma.trip.findMany({ where: { ...where, status: { in: ACTIVE_TRIP_STATUSES } }, include: {
    driver: { select: { id: true, name: true, phone: true } }, maintainer: { select: { id: true, name: true, phone: true } },
    bus: { select: { id: true, plateNumber: true, busNumber: true, capacity: true } },
    route: { include: { stops: { orderBy: { order: 'asc' } }, students: { where: { isActive: true, isSelfPickup: false }, include: { parent: { select: { id: true, locale: true } }, pickupStop: true, dropoffStop: true } } } },
    attendances: { select: { studentId: true, action: true } },
  } })
  return Promise.all(trips.map(async trip => {
    const location = supplied?.driverId === trip.driverId ? supplied.location : trip.busId ? await trackingService.getLiveLocation(trip.busId, trip.driverId) : null
    const age = location ? Date.now() - new Date(location.timestamp).getTime() : Infinity
    const fresh = Boolean(location && age >= -30000 && age <= 90000)
    const students = trip.route.students.filter(s => s.busId === trip.busId)
    const pending = students.map(student => {
      const action = nextAttendanceAction(trip.attendances.filter(a => a.studentId === student.id).map(a => a.action))
      return { student, action, stop: action === 'PICKED_UP' ? student.pickupStop : action === 'DROPPED_OFF' ? student.dropoffStop : null }
    })
    const nextOrder = Math.min(...pending.filter(p => p.stop).map(p => p.stop!.order))
    const targets = []
    for (const item of pending) {
      const { student, action, stop } = item
      if (parentId && student.parentId !== parentId) continue
      let etaMins: number | null = null
      if (fresh && location && stop && location.speed_kmh >= 3) {
        const path = trip.route.stops.filter(s => s.order >= nextOrder && s.order <= stop.order)
        let previous = { latitude: location.lat, longitude: location.lng }, km = 0
        for (const waypoint of path) { km += distanceKm(previous, waypoint); previous = waypoint }
        etaMins = Math.ceil(km / Math.min(location.speed_kmh, 120) * 60)
      }
      if (etaMins !== null && etaMins <= 5 && student.parent && stop && action) {
        const dedupeKey = `eta5:${trip.id}:${student.id}:${action}`
        try {
          const notification = await prisma.notification.create({ data: {
            userId: student.parent.id, ...transportMessage(student.parent.locale, 'BUS_ETA_5_MIN', student.name, stop.name), type: 'BUS_ETA_5_MIN', dedupeKey,
            metadata: JSON.stringify({ studentName: student.name, stopName: stop.name, tripId: trip.id, studentId: student.id, action, stopId: stop.id, expiresAt: new Date(Date.now() + 5 * 60000).toISOString() }),
          } })
          await pushNotification(notification)
        } catch (error) { if ((error as { code?: string }).code !== 'P2002') throw error }
      }
      targets.push({ studentId: student.id, studentName: student.name, action, stopId: stop?.id || null, stopName: stop?.name || null, latitude: stop?.latitude, longitude: stop?.longitude, etaMins })
    }
    return { id: trip.id, tripId: trip.id, busId: trip.busId, name: trip.bus?.busNumber || trip.bus?.plateNumber || trip.driver.name,
      bus: trip.bus, driver: trip.driver, maintainer: trip.maintainer, routeName: trip.route.name, status: trip.status, targets,
      lastLatitude: location?.lat ?? null, lastLongitude: location?.lng ?? null, lastLocationUpdate: location?.timestamp || null,
      currentSpeedKmH: location?.speed_kmh || 0, source: location?.source || null, fresh, etaMins: targets[0]?.etaMins ?? null,
      targetStop: targets[0]?.stopName || null,
    }
  }))
}
