import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
export async function GET(req: NextRequest) {
  const secret = process.env.TRACKING_WORKER_SECRET, received = req.headers.get('authorization') || ''
  const expected = `Bearer ${secret}`
  if (!secret || secret.length < 32 || Buffer.byteLength(received) !== Buffer.byteLength(expected) || !crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
  const {readLiveTracking}=await import('@/lib/live-tracking')
  const buses = await readLiveTracking({ bus: { OR: [{ wialonUnitId: { not: null } }, { katsanaVehicleId: { not: null } }] } })
  return NextResponse.json({ checked: buses.length })
  } catch(error) { console.error('Tracking worker unavailable',error);return NextResponse.json({error:'Tracking services unavailable; check database, Redis and GPS configuration'},{status:503}) }
}
