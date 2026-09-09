import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Public registration only needs active school names and opaque IDs. No
// address, phone, user counts, or other tenant data is exposed here.
export async function GET() {
  const organizations = await prisma.organization.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  })
  return NextResponse.json({ organizations })
}
