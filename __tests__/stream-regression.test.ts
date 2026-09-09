import { EventEmitter } from 'events'
import { NextRequest } from 'next/server'
jest.mock('@/lib/auth', () => ({ getUserFromSession: jest.fn() }))
jest.mock('@/lib/authorization', () => ({ resolveUserOrganizationId: jest.fn().mockResolvedValue('school-a') }))
jest.mock('@/lib/redis', () => ({ redisSubscriber: { duplicate: jest.fn() } }))
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {
  student: { findMany: jest.fn().mockResolvedValue([{ routeId: 'r', busId: 'b' }]) },
  trip: { findMany: jest.fn().mockResolvedValue([{ driverId: 'allowed-driver' }]) },
} }))
import { getUserFromSession } from '@/lib/auth'
import { redisSubscriber } from '@/lib/redis'
import { GET } from '@/app/api/location/stream/route'

it('streams bytes, filters other drivers and cleans up on cancellation', async () => {
  const subscriber = Object.assign(new EventEmitter(), { subscribe: jest.fn().mockResolvedValue(1), disconnect: jest.fn() })
  ;(redisSubscriber.duplicate as jest.Mock).mockReturnValue(subscriber)
  ;(getUserFromSession as jest.Mock).mockResolvedValue({ id: 'p', role: 'PARENT' })
  const response = await GET(new NextRequest('http://localhost/api/location/stream'))
  const reader = response.body!.getReader()
  const first = await reader.read()
  expect(first.value).toBeInstanceOf(Uint8Array)
  subscriber.emit('message', 'location_updates:school-a', JSON.stringify({ id: 'other-driver', lastLatitude: 1 }))
  subscriber.emit('message', 'location_updates:school-a', JSON.stringify({ id: 'allowed-driver', lastLatitude: 2 }))
  expect(new TextDecoder().decode((await reader.read()).value)).toBe('data: {"refresh":true}\n\n')
  await reader.cancel()
  expect(subscriber.disconnect).toHaveBeenCalledTimes(1)
  expect(subscriber.listenerCount('message')).toBe(0)
})
it('returns a recoverable error if Redis subscription fails', async () => {
  const subscriber = Object.assign(new EventEmitter(), { subscribe: jest.fn().mockRejectedValue(new Error('offline')), disconnect: jest.fn() })
  ;(redisSubscriber.duplicate as jest.Mock).mockReturnValue(subscriber)
  ;(getUserFromSession as jest.Mock).mockResolvedValue({ id: 'admin', role: 'SUPER_ADMIN' })
  expect((await GET(new NextRequest('http://localhost/api/location/stream'))).status).toBe(503)
  expect(subscriber.disconnect).toHaveBeenCalled()
})
