import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getUserFromSession } from '@/lib/auth'
import { canAccessOrganization, getCurrentUser } from '@/lib/authorization'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const user = await getUserFromSession()
    if (!user || !['ADMIN','SUPER_ADMIN','SCHOOL_ADMIN'].includes(user.role))
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { driverId, date, startTime, endTime } = await req.json()
    if (!driverId || !date || !startTime || !endTime)
      return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
    const actor = await getCurrentUser()
    const driver = await prisma.user.findUnique({ where: { id: driverId }, select: { role: true, organizationId: true, isActive:true,employmentStatus:true } })
    if (!actor || !driver?.isActive || driver.employmentStatus === 'OFFBOARDED' || driver.role !== 'DRIVER' || !canAccessOrganization(actor, driver.organizationId)) return NextResponse.json({ error: 'Invalid or inactive driver' }, { status: 403 })
    const parsedDate = new Date(date)
    if (Number.isNaN(parsedDate.getTime())) return NextResponse.json({ error: 'Invalid date' }, { status: 400 })
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime) || startTime >= endTime) return NextResponse.json({ error:'Enter a valid shift time range' }, { status:400 })
    const shift = await prisma.driverShift.create({ data: { driverId, date: parsedDate, startTime, endTime } })
    return NextResponse.json({ shift })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function GET() {
  try {
    const user = await getUserFromSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (!['DRIVER', 'ADMIN', 'SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const actor = await getCurrentUser()
    if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const where = user.role === 'DRIVER'
      ? { driverId: user.id }
      : user.role === 'SUPER_ADMIN' ? {} : { driver: { organizationId: actor.organizationId || '__none__' } }
    const shifts = await prisma.driverShift.findMany({
      where, orderBy: { date: 'asc' }, take: 50,
      include: { driver: { select: { name: true, phone: true } } }
    })
    return NextResponse.json({ shifts })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
