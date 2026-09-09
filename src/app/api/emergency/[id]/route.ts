import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getUserFromSession } from '@/lib/auth'
import { canAccessOrganization, getCurrentUser } from '@/lib/authorization'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await getUserFromSession()
        if (!user || !['ADMIN', 'SUPER_ADMIN', 'SCHOOL_ADMIN'].includes(user.role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { id } = await params
        const existing = await prisma.emergencyAlert.findUnique({ where: { id }, include: { driver: { select: { organizationId: true } } } })
        const actor = await getCurrentUser()
        if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
        if (!actor || !canAccessOrganization(actor, existing.driver.organizationId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

        const alert = await prisma.emergencyAlert.update({
            where: { id },
            data: { resolved: true }
        })

        return NextResponse.json({ success: true, alert })
    } catch (error) {
        console.error('Error resolving emergency alert:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
