import Redis from 'ioredis'
import { EventEmitter } from 'events'

const eventBus = new EventEmitter()
eventBus.setMaxListeners(0)
const store = new Map<string, { value: string; expiresAt: number | null }>()

// Development fallback: all clients share data, just as a real Redis server does.
export class MockRedis extends EventEmitter {
  private channels = new Set<string>()
  private relay = (channel: string, message: string) => {
    if (this.channels.has(channel)) this.emit('message', channel, message)
  }
  constructor() { super(); eventBus.on('message', this.relay) }
  async set(key: string, value: string, ex?: 'EX', seconds?: number) {
    store.set(key, { value, expiresAt: ex === 'EX' && seconds ? Date.now() + seconds * 1000 : null })
    return 'OK'
  }
  async get(key: string) {
    const entry = store.get(key)
    if (!entry) return null
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) { store.delete(key); return null }
    return entry.value
  }
  async del(key: string) { return Number(store.delete(key)) }
  async ping() { return 'PONG' }
  async publish(channel: string, message: string) { eventBus.emit('message', channel, message); return 1 }
  async subscribe(channel: string) { this.channels.add(channel); return this.channels.size }
  async unsubscribe(channel: string) { this.channels.delete(channel); return this.channels.size }
  duplicate() { return new MockRedis() }
  async quit() { this.disconnect(); return 'OK' }
  disconnect() { eventBus.off('message', this.relay); this.removeAllListeners(); this.channels.clear() }
}

const getRedisClient = () => {
  if (process.env.REDIS_URL) {
    const client = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 2, connectTimeout: 10_000, lazyConnect: true })
    client.on('error', error => console.error('Redis connection error:', error.message))
    return client
  }
  if (process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build') throw new Error('REDIS_URL is required in production')
  return new MockRedis() as unknown as Redis
}
export const redis = getRedisClient()
export const redisPublisher = getRedisClient()
export const redisSubscriber = getRedisClient()
