import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getUserFromSession } from '@/lib/auth'
import { canAccessOrganization, getCurrentUser } from '@/lib/authorization'

export const dynamic = 'force-dynamic'
const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN', 'SCHOOL_ADMIN']

export async function POST(req: Request) {
  try {
    const user = await getUserFromSession()
    if (!user || !ADMIN_ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { busId, type, description, scheduledDate, cost } = await req.json()
    if (!busId || !type || !scheduledDate) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    const actor = await getCurrentUser()
    const bus = await prisma.bus.findUnique({ where: { id: busId }, select: { organizationId: true } })
    if (!actor || !bus || !canAccessOrganization(actor, bus.organizationId)) return NextResponse.json({ error: 'Invalid bus' }, { status: 403 })
    const date = new Date(scheduledDate)
    if (Number.isNaN(date.getTime())) return NextResponse.json({ error: 'Invalid scheduled date' }, { status: 400 })
    const log = await prisma.maintenanceLog.create({ data: { busId, type, description, scheduledDate: date, cost: cost || null } })
    return NextResponse.json({ log })
  } catch (error) {
    console.error('Maintenance create error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const user = await getUserFromSession()
    if (!user || !ADMIN_ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const actor = await getCurrentUser()
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const logs = await prisma.maintenanceLog.findMany({
      where: actor.role === 'SUPER_ADMIN' ? {} : { bus: { organizationId: actor.organizationId || '__none__' } },
      orderBy: { scheduledDate: 'asc' }, take: 100,
      include: { bus: { select: { plateNumber: true, status: true } } },
    })
    return NextResponse.json({ logs })
  } catch (error) {
    console.error('Maintenance list error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getUserFromSession()
    if (!user || !ADMIN_ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { id, status, completedDate } = await req.json()
    const actor = await getCurrentUser()
    const existing = await prisma.maintenanceLog.findUnique({ where: { id }, include: { bus: { select: { organizationId: true } } } })
    if (!actor || !existing || !canAccessOrganization(actor, existing.bus.organizationId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const parsedCompletedDate = completedDate ? new Date(completedDate) : undefined
    if (parsedCompletedDate && Number.isNaN(parsedCompletedDate.getTime())) return NextResponse.json({ error: 'Invalid completed date' }, { status: 400 })
    const log = await prisma.maintenanceLog.update({ where: { id }, data: { status, completedDate: parsedCompletedDate } })
    return NextResponse.json({ log })
  } catch (error) {
    console.error('Maintenance update error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
