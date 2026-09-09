import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getUserFromSession } from '@/lib/auth'
import { canAccessOrganization, getCurrentUser } from '@/lib/authorization'
import { writeAuditLog } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getUserFromSession()
    if (!auth || !['ADMIN', 'SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(auth.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const existing = await prisma.route.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Route not found' }, { status: 404 })
    }
    const actor = await getCurrentUser()
    if (!actor || !canAccessOrganization(actor, existing.organizationId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { name, morningTime, afternoonTime, isActive } = await req.json()
    const updates: Record<string, unknown> = {}

    if (name !== undefined) {
      if (!name || !String(name).trim()) {
        return NextResponse.json({ error: 'Route name is required' }, { status: 400 })
      }
      updates.name = String(name).trim()
    }
    if (morningTime !== undefined) updates.morningTime = morningTime || null
    if (afternoonTime !== undefined) updates.afternoonTime = afternoonTime || null
    if (isActive !== undefined) updates.isActive = Boolean(isActive)

    const route = await prisma.route.update({
      where: { id },
      data: updates,
      include: { _count: { select: { students: true, buses: true } } }
    })
    await writeAuditLog({ actorId: auth.id, organizationId: existing.organizationId, action: 'UPDATE', entityType: 'ROUTE', entityId: id, details: { name: route.name, isActive: route.isActive } })

    return NextResponse.json({ route })
  } catch (error: unknown) {
    const code = (error as { code?: string })?.code
    if (code === 'P2002') {
      return NextResponse.json({ error: 'A route with this name already exists' }, { status: 409 })
    }
    console.error('Route update error:', error)
    return NextResponse.json({ error: 'Failed to update route' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getUserFromSession()
    if (!auth || !['ADMIN', 'SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(auth.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const existing = await prisma.route.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Route not found' }, { status: 404 })
    }
    const actor = await getCurrentUser()
    if (!actor || !canAccessOrganization(actor, existing.organizationId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const route = await prisma.route.update({ where: { id }, data: { isActive: false } })
    await prisma.bus.updateMany({ where: { routeId: id }, data: { routeId: null } })
    await writeAuditLog({ actorId: auth.id, organizationId: existing.organizationId, action: 'DEACTIVATE', entityType: 'ROUTE', entityId: id, details: { name: route.name } })
    return NextResponse.json({ success: true, deactivated: true })
  } catch (error: unknown) {
    console.error('Route delete error:', error)
    return NextResponse.json({ error: 'Failed to deactivate route' }, { status: 500 })
  }
}
