import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getUserFromSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await getUserFromSession()
  if (!session || session.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get('limit') || 100), 1), 250)
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      actor: { select: { id: true, name: true, email: true, role: true } },
      organization: { select: { id: true, name: true } },
    },
  })
  return NextResponse.json({ logs })
}
