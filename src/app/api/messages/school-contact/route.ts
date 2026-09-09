import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getUserFromSession } from '@/lib/auth'
import { resolveUserOrganizationId } from '@/lib/authorization'

export const dynamic = 'force-dynamic'

/**
 * Lightweight, parent-safe lookup of "who do I message at the school" —
 * returns just an admin contact's id/name, not the full user list
 * (which /api/admin/users correctly restricts to admin roles only).
 */
export async function GET() {
  try {
    const user = await getUserFromSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    if (user.role !== 'PARENT' && user.role !== 'DRIVER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const organizationId = await resolveUserOrganizationId(user.id)
    if (!organizationId) return NextResponse.json({ error: 'No assigned school contact found' }, { status: 404 })

    // Never fall back to another school's administrator.
    const admin = await prisma.user.findFirst({
      where: { role: { in: ['ADMIN', 'SCHOOL_ADMIN'] }, organizationId, isActive: true },
      select: { id: true, name: true },
    })

    if (!admin) {
      return NextResponse.json({ error: 'No school contact found' }, { status: 404 })
    }

    return NextResponse.json({ admin })
  } catch (error) {
    console.error('School contact lookup error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
