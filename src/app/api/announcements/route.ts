import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getUserFromSession } from '@/lib/auth'
import { resolveUserOrganizationId } from '@/lib/authorization'

export const dynamic = 'force-dynamic'

const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN', 'SCHOOL_ADMIN']

// List past announcements
export async function GET() {
  try {
    const user = await getUserFromSession()
    if (!user || !ADMIN_ROLES.includes(user.role))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const organizationId = await resolveUserOrganizationId(user.id)
    const announcements = await prisma.announcement.findMany({
      where: user.role === 'SUPER_ADMIN' ? {} : { organizationId: organizationId || '__none__' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })

    return NextResponse.json({ announcements })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// Broadcast announcement as notifications, and keep a record of the broadcast itself
export async function POST(req: Request) {
  try {
    const user = await getUserFromSession()
    if (!user || !ADMIN_ROLES.includes(user.role))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { title, body, targetRole, type } = await req.json()
    if (!title?.trim() || !body?.trim()) return NextResponse.json({ error: 'Title and body required' }, { status: 400 })
    const validRoles = ['ALL', 'ADMIN', 'SCHOOL_ADMIN', 'DRIVER', 'PARENT']
    const validTypes = ['INFO', 'WARNING', 'EMERGENCY']
    if (targetRole && !validRoles.includes(targetRole)) return NextResponse.json({ error: 'Invalid target role' }, { status: 400 })
    if (type && !validTypes.includes(type)) return NextResponse.json({ error: 'Invalid notification type' }, { status: 400 })
    const organizationId = await resolveUserOrganizationId(user.id)

    // Find target users
    const where: { role?: string; organizationId?: string } = {}
    if (targetRole && targetRole !== 'ALL') where.role = targetRole
    if (user.role !== 'SUPER_ADMIN') where.organizationId = organizationId || '__none__'

    const users = await prisma.user.findMany({ where: { ...where, isActive: true }, select: { id: true } })

    // Batch create notifications
    const result = await prisma.notification.createMany({
      data: users.map(u => ({
        userId: u.id,
        title: title.trim(),
        body: body.trim(),
        type: type || 'INFO',
      }))
    })

    // Record the broadcast itself so it can be listed later
    const announcement = await prisma.announcement.create({
      data: {
        title: title.trim(), body: body.trim(),
        targetRole: targetRole || 'ALL', type: type || 'INFO',
        sentCount: result.count, createdBy: user.id, organizationId: user.role === 'SUPER_ADMIN' ? null : organizationId,
      }
    })

    return NextResponse.json({ sent: result.count, targetRole: targetRole || 'ALL', announcement })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
