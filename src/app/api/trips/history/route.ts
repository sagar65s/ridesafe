import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getUserFromSession } from '@/lib/auth'
import { resolveUserOrganizationId } from '@/lib/authorization'
import type { Prisma } from '@prisma/client'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const page = Number(searchParams.get('page') || '1')
    if (!Number.isSafeInteger(page) || page < 1 || page > 1000000) return NextResponse.json({ error: 'Invalid page' }, { status: 400 })
    const limit = 15
    const skip = (page - 1) * limit

    // Role-based filter
    const where: Prisma.TripWhereInput = {}
    let parentStudentIds: string[] = []
    if (user.role === 'DRIVER') where.driverId = user.id
    if (user.role === 'PARENT') {
      // Get student route IDs
      const assignedStudents = await prisma.student.findMany({
        where: { parentId: user.id, isActive: true }, select: { id: true, routeId: true, busId: true }
      })
      parentStudentIds = assignedStudents.map(student => student.id)
      const assignments = assignedStudents.filter(student => student.routeId).map(student => ({
        routeId: student.routeId as string,
        ...(student.busId ? { busId: student.busId } : {}),
      }))
      if (assignments.length > 0) where.OR = assignments
      else return NextResponse.json({ trips: [], total: 0, page })
    }
    if (['ADMIN', 'SCHOOL_ADMIN'].includes(user.role)) {
      const organizationId = await resolveUserOrganizationId(user.id)
      if (!organizationId) return NextResponse.json({ trips: [], total: 0, page })
      where.route = { organizationId }
    } else if (!['DRIVER', 'PARENT', 'SUPER_ADMIN'].includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const [trips, total] = await Promise.all([
      prisma.trip.findMany({
        where, orderBy: { date: 'desc' }, skip, take: limit,
        include: {
          route: { select: { name: true } },
          driver: { select: { name: true } },
          bus: { select: { busNumber: true, plateNumber: true } },
          attendances: {
            ...(user.role === 'PARENT' ? { where: { studentId: { in: parentStudentIds } } } : {}),
            select: { action: true, timestamp: true, student: { select: { id: true, name: true } } },
          },
          ratings: { select: { rating: true } },
        }
      }),
      prisma.trip.count({ where })
    ])

    const formatted = trips.map(t => ({
      id: t.id, date: t.date, status: t.status,
      routeName: t.route.name, driverName: t.driver.name,
      busNumber: t.bus?.busNumber || t.bus?.plateNumber || null,
      delayMinutes: t.delayMinutes, delayReason: t.delayReason,
      attendanceCount: t.attendances.length,
      pickedUp: t.attendances.filter(a => a.action === 'PICKED_UP').length,
      droppedOff: t.attendances.filter(a => a.action === 'DROPPED_OFF').length,
      absent: t.attendances.filter(a => a.action === 'ABSENT').length,
      attendance: t.attendances.map(a => ({ studentId: a.student.id, studentName: a.student.name, action: a.action, timestamp: a.timestamp })),
      avgRating: t.ratings.length > 0 ? (t.ratings.reduce((a, r) => a + r.rating, 0) / t.ratings.length).toFixed(1) : null,
    }))

    return NextResponse.json({ trips: formatted, total, page, totalPages: Math.ceil(total / limit) })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
