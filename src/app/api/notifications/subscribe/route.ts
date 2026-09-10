import { NextRequest, NextResponse } from 'next/server'
import { getUserFromSession } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { z } from 'zod'
const schema = z.object({ endpoint: z.string().url().max(2048), keys: z.object({ p256dh: z.string().regex(/^[A-Za-z0-9_-]+$/).min(80).max(200), auth: z.string().regex(/^[A-Za-z0-9_-]+$/).min(16).max(100) }) })
export async function POST(req: NextRequest) {
  const user = await getUserFromSession()
  if (!user || user.role !== 'PARENT') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY || !process.env.VAPID_SUBJECT) return NextResponse.json({ error: 'Background notifications are not configured' }, { status: 503 })
  const data = schema.safeParse(await req.json().catch(() => null))
  if (!data.success) return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
  const url = new URL(data.data.endpoint)
  const host = url.hostname
  if (url.protocol !== 'https:' || url.port || url.username || url.password || !(host === 'fcm.googleapis.com' || host === 'web.push.apple.com' || host.endsWith('.push.services.mozilla.com') || host.endsWith('.notify.windows.com'))) return NextResponse.json({ error: 'Unsupported push service' }, { status: 400 })
  await prisma.pushSubscription.upsert({ where: { endpoint: data.data.endpoint }, create: { userId: user.id, endpoint: data.data.endpoint, ...data.data.keys }, update: { userId: user.id, ...data.data.keys } })
  return NextResponse.json({ success: true })
}
export async function DELETE(req: NextRequest) {
  const user = await getUserFromSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { endpoint } = await req.json().catch(() => ({}))
  if (typeof endpoint !== 'string') return NextResponse.json({ error: 'Endpoint required' }, { status: 400 })
  await prisma.pushSubscription.deleteMany({ where: { userId: user.id, endpoint } })
  return NextResponse.json({ success: true })
}
