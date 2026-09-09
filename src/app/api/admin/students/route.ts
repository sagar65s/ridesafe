import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getUserFromSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    try {
        const auth = await getUserFromSession()
        if (!auth || !['ADMIN', 'SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(auth.role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const actor = await prisma.user.findUnique({ where: { id: auth.id }, select: { organizationId: true } })
        const students = await prisma.student.findMany({
            where: auth.role === 'SUPER_ADMIN' ? {} : { organizationId: actor?.organizationId || '__none__' },
            include: {
                parent: { select: { id: true, name: true, phone: true } },
                route: { select: { id: true, name: true } }
            },
            orderBy: { createdAt: 'desc' }
        })

        return NextResponse.json({ students })
    } catch (error) {
        console.error('Admin student list error:', error)
        return NextResponse.json({ error: 'Failed to fetch students' }, { status: 500 })
    }
}

// Keep legacy clients on the same validated, school-scoped write path.
export { POST } from '@/app/api/students/route'
