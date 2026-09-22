/**
 * TrackingService — GPS location orchestration.
 *
 * Provider chain:
 *   1. Katsana — the configured fleet GPS provider
 *   2. Mobile  — driver's phone GPS broadcast fallback
 *
 * Architecture: Client App → RideSafe Backend → GPS Provider
 * Katsana is never called directly from the browser.
 */

import { getKatsanaAdapter } from '@/lib/adapters/katsana'
import prisma from '../prisma'

export type TrackingSource = 'KATSANA' | 'MOBILE'

export interface LiveLocation {
  lat:       number
  lng:       number
  speed_kmh: number
  heading:   number | null
  altitude:  number | null
  ignition:  boolean | null
  timestamp: string
  source:    TrackingSource
}

export class TrackingService {

  async getLiveLocation(busId: string, driverId: string): Promise<LiveLocation | null> {

    const bus = await prisma.bus.findUnique({
      where: { id: busId },
      select: {
        katsanaVehicleId: true,
      },
    })

    // ── 1. Katsana ───────────────────────────────────────────────────────────
    if (bus?.katsanaVehicleId) {
      try {
        const katsana = getKatsanaAdapter()
        if (!katsana.isAuthenticated()) await katsana.authenticate()

        const pos = await katsana.fetchLocation(bus.katsanaVehicleId)
        if (pos && Date.now() - new Date(pos.timestamp).getTime() <= 90000 && Date.now() - new Date(pos.timestamp).getTime() >= -30000) {
          return {
            lat:       pos.lat,
            lng:       pos.lng,
            speed_kmh: pos.speed,
            heading:   pos.heading,
            altitude:  pos.altitude,
            ignition:  pos.ignition,
            timestamp: pos.timestamp,
            source:    'KATSANA',
          }
        }
      } catch (err) {
        console.warn('[TrackingService] Katsana unavailable for bus', busId, (err as Error).message)
      }
    }

    // ── 2. Mobile GPS fallback ───────────────────────────────────────────────


    const driver = await prisma.user.findUnique({
      where: { id: driverId },
      select: {
        lastLatitude:       true,
        lastLongitude:      true,
        currentSpeedKmH:    true,
        lastLocationUpdate: true,
      },
    })

    if (driver?.lastLatitude != null && driver?.lastLongitude != null && driver.lastLocationUpdate) {
      return {
        lat:       driver.lastLatitude,
        lng:       driver.lastLongitude,
        speed_kmh: driver.currentSpeedKmH || 0,
        heading:   null,
        altitude:  null,
        ignition:  null,
        timestamp: driver.lastLocationUpdate?.toISOString() ?? new Date().toISOString(),
        source:    'MOBILE',
      }
    }

    return null
  }
}

export const trackingService = new TrackingService()
