import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getUserFromSession } from '@/lib/auth'
import { canAccessOrganization, getCurrentUser } from '@/lib/authorization'
import { crewWhere } from '@/lib/transport'

export const dynamic = 'force-dynamic'
const VIEW_ROLES = ['ADMIN', 'SUPER_ADMIN', 'SCHOOL_ADMIN', 'DRIVER']

async function canMaintainBus(actor: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>, busId: string) {
  const bus = await prisma.bus.findUnique({ where: { id: busId }, select: { organizationId: true, driverId: true, maintainerId: true } })
  return Boolean(bus && actor.role === 'DRIVER' && actor.organizationId === bus.organizationId && (bus.driverId === actor.id || bus.maintainerId === actor.id))
}

export async function POST(req: Request) {
  try {
    const user = await getUserFromSession()
    if (!user || user.role !== 'DRIVER') return NextResponse.json({ error: 'Only assigned driver or maintainer can create maintenance checks' }, { status: 403 })
    const { busId, type, description, scheduledDate, cost } = await req.json()
    if (!busId || !type || !scheduledDate) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    const actor = await getCurrentUser()
    if (!actor || !(await canMaintainBus(actor, busId))) return NextResponse.json({ error: 'You can maintain only your assigned bus' }, { status: 403 })
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
    if (!user || !VIEW_ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const actor = await getCurrentUser()
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const logs = await prisma.maintenanceLog.findMany({
      where: actor.role === 'SUPER_ADMIN' ? {} : actor.role === 'DRIVER' ? { bus: { ...crewWhere(actor.id), organizationId: actor.organizationId || '__none__' } } : { bus: { organizationId: actor.organizationId || '__none__' } },
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
    if (!user || user.role !== 'DRIVER') return NextResponse.json({ error: 'Only assigned driver or maintainer can update maintenance checks' }, { status: 403 })
    const { id, status, completedDate } = await req.json()
    const actor = await getCurrentUser()
    const existing = await prisma.maintenanceLog.findUnique({ where: { id }, select: { busId: true } })
    if (!actor || !existing || !(await canMaintainBus(actor, existing.busId))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const parsedCompletedDate = completedDate ? new Date(completedDate) : undefined
    if (parsedCompletedDate && Number.isNaN(parsedCompletedDate.getTime())) return NextResponse.json({ error: 'Invalid completed date' }, { status: 400 })
    const log = await prisma.maintenanceLog.update({ where: { id }, data: { status, completedDate: parsedCompletedDate } })
    return NextResponse.json({ log })
  } catch (error) {
    console.error('Maintenance update error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await getUserFromSession()
    const actor = await getCurrentUser()
    if (!user || !actor || !VIEW_ROLES.includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { id } = await req.json().catch(() => ({}))
    if (typeof id !== 'string') return NextResponse.json({ error: 'Maintenance log ID required' }, { status: 400 })
    const existing = await prisma.maintenanceLog.findUnique({ where: { id }, include: { bus: { select: { organizationId: true } } } })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const allowed = actor.role === 'DRIVER' ? await canMaintainBus(actor, existing.busId) : canAccessOrganization(actor, existing.bus.organizationId)
    if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    await prisma.maintenanceLog.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Maintenance delete error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
