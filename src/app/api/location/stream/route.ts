import { NextRequest } from 'next/server'
import { redisSubscriber } from '@/lib/redis'
import { getUserFromSession } from '@/lib/auth'
import { resolveUserOrganizationId } from '@/lib/authorization'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const user = await getUserFromSession()
  if (!user) return new Response('Unauthorized', { status: 401 })
  if (user.role === 'DRIVER') return new Response('Forbidden', { status: 403 })
  const organizationId = await resolveUserOrganizationId(user.id)
  if (user.role !== 'SUPER_ADMIN' && !organizationId) return new Response('Organization not assigned', { status: 403 })
  const channel = user.role === 'SUPER_ADMIN' ? 'location_updates:global' : `location_updates:${organizationId}`
  let allowedDriverIds: Set<string> | null = null
  if (user.role === 'PARENT') {
    const students = await prisma.student.findMany({ where: { parentId: user.id, isActive: true }, select: { routeId: true, busId: true } })
    const assignments = students.filter(s => s.routeId).map(s => ({ routeId: s.routeId as string, ...(s.busId ? { busId: s.busId } : {}) }))
    const trips = assignments.length ? await prisma.trip.findMany({ where: { status: { in: ['DRIVER_STARTED_ROUTE', 'BUS_EN_ROUTE'] }, OR: assignments }, select: { driverId: true } }) : []
    allowedDriverIds = new Set(trips.map(t => t.driverId))
  }
  const subscriber = redisSubscriber.duplicate()
  subscriber.on('error', () => {})
  try { await subscriber.subscribe(channel) } catch {
    subscriber.disconnect()
    return new Response('Live stream unavailable; polling remains available', { status: 503 })
  }
  const encoder = new TextEncoder()
  let cleanup = () => {}
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false
      const timers: { heartbeat?: ReturnType<typeof setInterval>; expiry?: ReturnType<typeof setTimeout> } = {}
      const close = () => {
        if (closed) return
        closed = true
        clearInterval(timers.heartbeat)
        clearTimeout(timers.expiry)
        req.signal.removeEventListener('abort', close)
        subscriber.off('message', listener)
        subscriber.disconnect()
        try { controller.close() } catch { /* Already cancelled. */ }
      }
      const send = (value: string) => { try { controller.enqueue(encoder.encode(value)) } catch { close() } }
      const listener = (incoming: string, message: string) => {
        if (incoming !== channel || closed) return
        try {
          const payload = JSON.parse(message) as { id?: string }
          if (allowedDriverIds && (!payload.id || !allowedDriverIds.has(payload.id))) return
          // Parents refresh the scoped endpoint for their child's stop-specific ETA.
          send(`data: ${JSON.stringify({ refresh: true })}\n\n`)
        } catch { /* Ignore malformed publisher messages. */ }
      }
      cleanup = close
      subscriber.on('message', listener)
      req.signal.addEventListener('abort', close, { once: true })
      if (req.signal.aborted) { close(); return }
      send('retry: 3000\n\n')
      timers.heartbeat = setInterval(() => send(': heartbeat\n\n'), 15000)
      // EventSource reconnects and revalidates session/assignments every minute.
      timers.expiry = setTimeout(close, 60000)
    },
    cancel() { cleanup() },
  })
  return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' } })
}
