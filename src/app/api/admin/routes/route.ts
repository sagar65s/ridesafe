import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getUserFromSession } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    try {
        const auth = await getUserFromSession()
        if (!auth || !['ADMIN', 'SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(auth.role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const actor = await prisma.user.findUnique({ where: { id: auth.id }, select: { organizationId: true } })
        const routes = await prisma.route.findMany({
            where: auth.role === 'SUPER_ADMIN' ? {} : { organizationId: actor?.organizationId || '__none__' },
            include: {
                _count: {
                    select: { students: true, buses: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        })

        return NextResponse.json({ routes })
    } catch (error) {
        console.error('Route list error:', error)
        return NextResponse.json({ error: 'Failed to fetch routes' }, { status: 500 })
    }
}

export async function POST(request: Request) {
  const permissionSession = await getUserFromSession()
  if (permissionSession?.role === 'ADMIN') return NextResponse.json({ error: 'School Admin access required' }, { status: 403 })
    try {
        const auth = await getUserFromSession()
        if (!auth || !['ADMIN', 'SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(auth.role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { name, morningTime, afternoonTime, organizationId } = await request.json()

        if (!name) {
            return NextResponse.json({ error: 'Route name is required' }, { status: 400 })
        }

        const actor = await prisma.user.findUnique({ where: { id: auth.id }, select: { organizationId: true } })
        const resolvedOrganizationId = auth.role === 'SUPER_ADMIN' ? (organizationId || null) : actor?.organizationId || null
        if (!resolvedOrganizationId) return NextResponse.json({ error: 'School assignment is required' }, { status: 400 })
        const organization = await prisma.organization.findUnique({ where: { id: resolvedOrganizationId }, select: { isActive: true } })
        if (!organization?.isActive) return NextResponse.json({ error: 'Invalid or inactive school' }, { status: 400 })
        const route = await prisma.route.create({
            data: {
                name: String(name).trim(),
                morningTime: morningTime?.trim() || null,
                afternoonTime: afternoonTime?.trim() || null,
                organizationId: resolvedOrganizationId,
            }
        })
        await writeAuditLog({ actorId: auth.id, organizationId: route.organizationId, action: 'CREATE', entityType: 'ROUTE', entityId: route.id, details: { name: route.name } })

        return NextResponse.json({ route })
    } catch (error: unknown) {
        if ((error as { code?: string })?.code === 'P2002') return NextResponse.json({ error: 'A route with this name already exists in this school' }, { status: 409 })
        console.error('Route create error:', error)
        return NextResponse.json({ error: 'Failed to create route' }, { status: 500 })
    }
}
