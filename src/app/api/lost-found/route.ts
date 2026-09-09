import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getUserFromSession } from '@/lib/auth'
import { canAccessOrganization, getCurrentUser, resolveUserOrganizationId } from '@/lib/authorization'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const user = await getUserFromSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { description } = await req.json()
    if (!description?.trim()) return NextResponse.json({ error: 'Description required' }, { status: 400 })
    const item = await prisma.lostFoundItem.create({ data: { reportedBy: user.id, description: description.trim() } })
    return NextResponse.json({ item })
  } catch (error) {
    console.error('Lost-and-found create error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const user = await getUserFromSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const organizationId = await resolveUserOrganizationId(user.id)
    const management = ['ADMIN', 'SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(user.role)
    const items = await prisma.lostFoundItem.findMany({
      where: user.role === 'SUPER_ADMIN' ? {} : management ? { reporter: { organizationId: organizationId || '__none__' } } : { reportedBy: user.id },
      orderBy: { createdAt: 'desc' }, take: 50,
      include: { reporter: { select: { name: true, role: true } } },
    })
    return NextResponse.json({ items })
  } catch (error) {
    console.error('Lost-and-found list error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getUserFromSession()
    if (!user || !['ADMIN', 'SUPER_ADMIN', 'SCHOOL_ADMIN'].includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { id, status } = await req.json()
    if (!id || !['OPEN', 'FOUND', 'CLOSED'].includes(status)) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    const actor = await getCurrentUser()
    const existing = await prisma.lostFoundItem.findUnique({ where: { id }, include: { reporter: { select: { organizationId: true } } } })
    if (!actor || !existing || !canAccessOrganization(actor, existing.reporter.organizationId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const item = await prisma.lostFoundItem.update({ where: { id }, data: { status } })
    return NextResponse.json({ item })
  } catch (error) {
    console.error('Lost-and-found update error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
