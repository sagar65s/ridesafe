import { NextResponse, NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { getUserFromSession } from '@/lib/auth'
import { canAccessOrganization, getCurrentUser, resolveUserOrganizationId } from '@/lib/authorization'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
    try {
        const user = await getUserFromSession()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { searchParams } = new URL(request.url)
        const routeId = searchParams.get('routeId')
        const organizationId = await resolveUserOrganizationId(user.id)
        if (user.role !== 'SUPER_ADMIN' && !organizationId) return NextResponse.json({ stops: [] })
        const whereClause = {
            ...(routeId ? { routeId } : {}),
            ...(user.role === 'SUPER_ADMIN' ? {} : { route: { organizationId: organizationId || '__none__' } }),
        }
        const stops = await prisma.stop.findMany({
            where: whereClause,
            orderBy: { order: 'asc' }
        })

        return NextResponse.json({ stops })
    } catch (error) {
        console.error('Stops GET Error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    try {
        const user = await getUserFromSession()
        if (!user || user.role === 'PARENT' || user.role === 'DRIVER') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        const data = await request.json()
        if (!data.routeId || !data.name || data.latitude === undefined || data.longitude === undefined || data.order === undefined) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
        }
        if (!String(data.name).trim()) {
            return NextResponse.json({ error: 'Stop name cannot be only spaces' }, { status: 400 })
        }
        const actor = await getCurrentUser()
        const route = await prisma.route.findUnique({ where: { id: data.routeId }, select: { organizationId: true } })
        if (!actor || !route || !canAccessOrganization(actor, route.organizationId)) return NextResponse.json({ error: 'Invalid route' }, { status: 403 })
        const latitude = Number(data.latitude)
        const longitude = Number(data.longitude)
        const order = Number(data.order)
        if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !Number.isInteger(order) || order < 0) {
            return NextResponse.json({ error: 'Invalid coordinates or stop order' }, { status: 400 })
        }

        const stop = await prisma.stop.create({
            data: {
                routeId: data.routeId,
                name: String(data.name).trim(),
                latitude,
                longitude,
                order,
            }
        })

        return NextResponse.json({ stop })
    } catch (error) {
        console.error('Stops POST Error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
