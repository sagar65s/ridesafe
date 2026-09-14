import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
export async function GET(request: NextRequest) {
  const secret = process.env.TRACKING_WORKER_SECRET
  const received = request.headers.get('authorization') || ''
  const expected = `Bearer ${secret}`
  if (!secret || secret.length < 32 || Buffer.byteLength(received) !== Buffer.byteLength(expected) || !crypto.timingSafeEqual(Buffer.from(received), Buffer.from(expected))) return NextResponse.json({error:'Unauthorized'},{status:401})
  try {
    const {sendCalendarReminders} = await import('@/lib/calendar-notifications')
    return NextResponse.json({reminders:await sendCalendarReminders()})
  } catch (error) { console.error('Calendar worker failed', error); return NextResponse.json({error:'Calendar reminders unavailable'},{status:503}) }
}
