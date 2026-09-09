import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getUserFromSession } from '@/lib/auth'
import { canAccessOrganization, getCurrentUser } from '@/lib/authorization'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserFromSession()
    if (!user || !['ADMIN', 'SUPER_ADMIN', 'SCHOOL_ADMIN', 'DRIVER'].includes(user.role))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const actor = await getCurrentUser()
    const existing = await prisma.driverShift.findUnique({ where: { id }, include: { driver: { select: { name: true, organizationId: true } } } })
    if (!actor || !existing || !canAccessOrganization(actor, existing.driver.organizationId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { driverId, date, startTime, endTime, status, lateReason } = await req.json()
    if (user.role === 'DRIVER') {
      if (existing.driverId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      if (typeof lateReason !== 'string' || lateReason.trim().length < 3 || lateReason.trim().length > 500) {
        return NextResponse.json({ error: 'Late reason must be between 3 and 500 characters' }, { status: 400 })
      }
      const shift = await prisma.driverShift.update({
        where: { id },
        data: { lateReason: lateReason.trim(), status: 'LATE', checkedInAt: new Date() },
      })
      const admins = await prisma.user.findMany({
        where: { role: { in: ['ADMIN', 'SCHOOL_ADMIN'] }, organizationId: existing.driver.organizationId || '__none__' },
        select: { id: true },
      })
      if (admins.length) await prisma.notification.createMany({ data: admins.map(admin => ({
        userId: admin.id,
        title: 'Driver reported late',
        body: `${existing.driver.name}: ${lateReason.trim()}`,
        type: 'WARNING',
      })) })
      return NextResponse.json({ shift })
    }
    if (driverId) {
      const driver = await prisma.user.findUnique({ where: { id: driverId }, select: { role: true, organizationId: true, isActive:true,employmentStatus:true } })
      if (!driver?.isActive || driver.employmentStatus === 'OFFBOARDED' || driver.role !== 'DRIVER' || !canAccessOrganization(actor, driver.organizationId)) return NextResponse.json({ error: 'Invalid or inactive driver' }, { status: 403 })
    }
    if (date && Number.isNaN(new Date(date).getTime())) return NextResponse.json({ error:'Invalid date' }, { status:400 })
    if (status && !['SCHEDULED','ACTIVE','LATE','COMPLETED','CANCELLED'].includes(status)) return NextResponse.json({ error:'Invalid shift status' }, { status:400 })
    const targetStart = startTime || existing.startTime
    const targetEnd = endTime || existing.endTime
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(targetStart) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(targetEnd) || targetStart >= targetEnd) return NextResponse.json({ error:'Enter a valid shift time range' }, { status:400 })

    const shift = await prisma.driverShift.update({
      where: { id },
      data: {
        ...(driverId && { driverId }),
        ...(date && { date: new Date(date) }),
        ...(startTime && { startTime }),
        ...(endTime && { endTime }),
        ...(status && { status }),
        ...(lateReason !== undefined && { lateReason: lateReason?.trim() || null }),
      },
    })
    return NextResponse.json({ shift })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getUserFromSession()
    if (!user || !['ADMIN', 'SUPER_ADMIN', 'SCHOOL_ADMIN'].includes(user.role))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const { id } = await params
    const actor = await getCurrentUser()
    const existing = await prisma.driverShift.findUnique({ where: { id }, include: { driver: { select: { organizationId: true } } } })
    if (!actor || !existing || !canAccessOrganization(actor, existing.driver.organizationId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    await prisma.driverShift.update({ where: { id }, data:{ status:'CANCELLED' } })
    return NextResponse.json({ success: true, cancelled:true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
