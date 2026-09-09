import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getUserFromSession } from '@/lib/auth'
import { resolveUserOrganizationId } from '@/lib/authorization'

export const dynamic = 'force-dynamic'

// GET: fetch all settings as a key-value map
export async function GET() {
  try {
    const user = await getUserFromSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const organizationId = await resolveUserOrganizationId(user.id)
    const suffix = organizationId ? `:${organizationId}` : ''
    const baseKeys = ['SCHOOL_NAME', 'PICKUP_TIMES', 'schoolLat', 'schoolLng', 'geofenceRadius', 'notificationsEmailEnabled', 'notificationsPushEnabled', 'sosEscalationMinutes']
    const settings = await prisma.systemSetting.findMany({
      where: { key: { in: [...baseKeys, ...baseKeys.map(key => `${key}${suffix}`)] } },
    })
    const map: Record<string, string> = {}
    settings.forEach(s => { map[s.key] = s.value })
    const value = (key: string) => map[`${key}${suffix}`] ?? map[key]

    // Return structured useful settings with sane defaults
    return NextResponse.json({
      schoolName: value('SCHOOL_NAME') || 'RideSafe School',
      pickupTimes: JSON.parse(value('PICKUP_TIMES') || '["3:00 PM","4:00 PM","5:00 PM"]'),
      schoolLat: value('schoolLat') || '3.1390',
      schoolLng: value('schoolLng') || '101.6869',
      geofenceRadius: value('geofenceRadius') || '500',
      notificationsEmailEnabled: value('notificationsEmailEnabled') !== 'false',
      notificationsPushEnabled: value('notificationsPushEnabled') !== 'false',
      sosEscalationMinutes: value('sosEscalationMinutes') || '2',
    })
  } catch (error) {
    console.error('Admin settings GET error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST: update settings
export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromSession()
    if (!user || !['SUPER_ADMIN', 'SCHOOL_ADMIN'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const organizationId = await resolveUserOrganizationId(user.id)
    if (user.role !== 'SUPER_ADMIN' && !organizationId) return NextResponse.json({ error: 'Organization assignment required' }, { status: 403 })
    const suffix = organizationId ? `:${organizationId}` : ''

    const body = await req.json()
    const updates: { key: string; value: string }[] = []

    if (body.schoolName !== undefined) {
      if (typeof body.schoolName !== 'string' || body.schoolName.trim().length < 3 || body.schoolName.trim().length > 100) return NextResponse.json({ error: 'School name must be between 3 and 100 characters' }, { status: 400 })
      updates.push({ key: 'SCHOOL_NAME', value: body.schoolName.trim() })
    }
    if (body.pickupTimes !== undefined) {
      if (!Array.isArray(body.pickupTimes) || body.pickupTimes.length < 1 || body.pickupTimes.length > 20 || body.pickupTimes.some((time:unknown) => typeof time !== 'string' || !time.trim() || time.length > 30)) return NextResponse.json({ error: 'Pickup times must contain 1-20 valid labels' }, { status: 400 })
      updates.push({ key: 'PICKUP_TIMES', value: JSON.stringify(body.pickupTimes.map((time:string) => time.trim())) })
    }
    if (body.schoolLat !== undefined) {
      const value = Number(body.schoolLat); if (!Number.isFinite(value) || value < -90 || value > 90) return NextResponse.json({ error: 'Invalid school latitude' }, { status: 400 })
      updates.push({ key: 'schoolLat', value: String(value) })
    }
    if (body.schoolLng !== undefined) {
      const value = Number(body.schoolLng); if (!Number.isFinite(value) || value < -180 || value > 180) return NextResponse.json({ error: 'Invalid school longitude' }, { status: 400 })
      updates.push({ key: 'schoolLng', value: String(value) })
    }
    if (body.geofenceRadius !== undefined) {
      const value = Number(body.geofenceRadius); if (!Number.isFinite(value) || value < 10 || value > 50000) return NextResponse.json({ error: 'Geofence radius must be between 10 and 50,000 metres' }, { status: 400 })
      updates.push({ key: 'geofenceRadius', value: String(value) })
    }
    if (body.notificationsEmailEnabled !== undefined) updates.push({ key: 'notificationsEmailEnabled', value: String(Boolean(body.notificationsEmailEnabled)) })
    if (body.notificationsPushEnabled !== undefined) updates.push({ key: 'notificationsPushEnabled', value: String(Boolean(body.notificationsPushEnabled)) })
    if (body.sosEscalationMinutes !== undefined) {
      const minutes = Number(body.sosEscalationMinutes)
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) return NextResponse.json({ error: 'SOS escalation must be between 1 and 60 minutes' }, { status: 400 })
      updates.push({ key: 'sosEscalationMinutes', value: String(minutes) })
    }

    await Promise.all(updates.map(u =>
      prisma.systemSetting.upsert({
        where: { key: `${u.key}${suffix}` },
        update: { value: u.value },
        create: { key: `${u.key}${suffix}`, value: u.value }
      })
    ))

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Admin settings POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
