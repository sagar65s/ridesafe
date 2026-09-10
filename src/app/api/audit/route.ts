import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/authorization'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const session = await getCurrentUser()
  if (!session || !['SUPER_ADMIN','SCHOOL_ADMIN'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get('limit') || 100), 1), 250)
  const logs = await prisma.auditLog.findMany({
    where: session.role === 'SUPER_ADMIN' ? {} : { organizationId: session.organizationId || '__none__' },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: {
      actor: { select: { id: true, name: true, email: true, role: true } },
      organization: { select: { id: true, name: true } },
    },
  })
  return NextResponse.json({ logs })
}
