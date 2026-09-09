import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { redis } from '@/lib/redis'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await Promise.all([prisma.$queryRaw`SELECT 1`, redis.ping()])
    return NextResponse.json({ status: 'ok' })
  } catch (error) {
    console.error('Health check failed:', error)
    return NextResponse.json({ status: 'unhealthy' }, { status: 503 })
  }
}
