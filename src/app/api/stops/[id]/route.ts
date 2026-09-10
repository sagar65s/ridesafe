import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getUserFromSession } from '@/lib/auth'
import { canAccessOrganization, getCurrentUser } from '@/lib/authorization'

export const dynamic = 'force-dynamic'

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const permissionSession = await getUserFromSession()
  if (permissionSession?.role === 'ADMIN') return NextResponse.json({ error: 'School Admin access required' }, { status: 403 })
  try {
    const user = await getUserFromSession()
    if (!user || user.role === 'PARENT' || user.role === 'DRIVER') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id } = await params
    const existing = await prisma.stop.findUnique({ where: { id }, include: { route: { select: { organizationId: true } } } })
    if (!existing) {
      return NextResponse.json({ error: 'Stop not found' }, { status: 404 })
    }
    const actor = await getCurrentUser()
    if (!actor || !canAccessOrganization(actor, existing.route.organizationId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const [students, attendance, trips] = await Promise.all([prisma.student.count({where:{OR:[{pickupStopId:id},{dropoffStopId:id}]}}),prisma.attendance.count({where:{stopId:id}}),prisma.trip.count({where:{routeId:existing.routeId,status:{in:['DRIVER_STARTED_ROUTE','BUS_EN_ROUTE']}}})])
    if(students || attendance || trips) return NextResponse.json({error:'This stop is in use by students, attendance history or an active trip and cannot be deleted'},{status:409})
    await prisma.stop.delete({ where: { id } })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Stop DELETE Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
