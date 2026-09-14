import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getUserFromSession } from '@/lib/auth'
import { resolveUserOrganizationId } from '@/lib/authorization'
import type { Prisma } from '@prisma/client'
import { studentUsesBus } from '@/lib/transport'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const user = await getUserFromSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const page = Number(searchParams.get('page') || '1')
    const requestedOrganizationId = searchParams.get('organizationId') || ''
    if (!Number.isSafeInteger(page) || page < 1 || page > 1000000) return NextResponse.json({ error: 'Invalid page' }, { status: 400 })
    const limit = 15
    const skip = (page - 1) * limit

    // Role-based filter
    const where: Prisma.TripWhereInput = {}
    where.historyDeletions = { none: { userId: user.id } }
    let parentStudentIds: string[] = []
    if (user.role === 'DRIVER') where.OR = [{ driverId: user.id }, { maintainerId: user.id }]
    if (user.role === 'PARENT') {
      const assignedStudents = await prisma.student.findMany({where:{parentId:user.id},select:{id:true,busId:true,routeId:true}})
      parentStudentIds = assignedStudents.map(student=>student.id)
      if (!parentStudentIds.length) return NextResponse.json({trips:[],total:0,page,totalPages:0})
      where.OR = assignedStudents.filter((s): s is typeof s & {busId:string;routeId:string}=>Boolean(s.busId&&s.routeId)).map(s=>({busId:s.busId,routeId:s.routeId}))
    }
    if (['ADMIN', 'SCHOOL_ADMIN'].includes(user.role)) {
      const organizationId = await resolveUserOrganizationId(user.id)
      if (!organizationId) return NextResponse.json({ trips: [], total: 0, page })
      where.route = { organizationId }
    } else if (user.role === 'SUPER_ADMIN' && requestedOrganizationId) {
      where.route = { organizationId: requestedOrganizationId }
    } else if (!['DRIVER', 'PARENT', 'SUPER_ADMIN'].includes(user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const [trips, total] = await Promise.all([
      prisma.trip.findMany({
        where, orderBy: { date: 'desc' }, skip, take: limit,
        include: {
          route: { select: { name: true, organization:{select:{id:true,name:true}}, students: { where:{isActive:true}, select:{id:true,name:true,busId:true,isSelfPickup:true,selfPickupSession:true} } } },
          driver: { select: { name: true } },
          bus: { select: { busNumber: true, plateNumber: true } },
          attendances: {
            ...(user.role === 'PARENT' ? { where: { studentId: { in: parentStudentIds } } } : {}),
            select: { action: true, timestamp: true, student: { select: { id: true, name: true } } },
          },
          attendanceRequests: {
            ...(user.role === 'PARENT' ? { where: { studentId: { in: parentStudentIds } } } : {}),
            select: { studentId:true, action:true, status:true, requestedAt:true, student:{select:{id:true,name:true}} },
          },
          ratings: { select: { rating: true } },
        }
      }),
      prisma.trip.count({ where })
    ])

    const formatted = trips.map(t => {
      const relevantStudents = t.route.students.filter(student => student.busId === t.busId && studentUsesBus(student, t.serviceType as 'MORNING'|'PM'|'AFTER_SCHOOL') && (user.role !== 'PARENT' || parentStudentIds.includes(student.id)))
      const parentConfirmations = relevantStudents.flatMap(student => (['PICKED_UP','DROPPED_OFF'] as const).map(action => {
        const request = t.attendanceRequests.find(item => item.studentId === student.id && item.action === action)
        return { studentId:student.id, studentName:student.name, action, status:request?.status || 'NOT_SUBMITTED', requestedAt:request?.requestedAt || null }
      }))
      return ({
      id: t.id, date: t.date, status: t.status,
      routeName: t.route.name, driverName: t.driver.name,
      organization: t.route.organization,
      busNumber: t.bus?.busNumber || t.bus?.plateNumber || null,
      delayMinutes: t.delayMinutes, delayReason: t.delayReason,
      attendanceCount: t.attendances.length,
      pickedUp: t.attendances.filter(a => a.action === 'PICKED_UP').length,
      droppedOff: t.attendances.filter(a => a.action === 'DROPPED_OFF').length,
      absent: t.attendances.filter(a => a.action === 'ABSENT').length,
      attendance: t.attendances.map(a => ({ studentId: a.student.id, studentName: a.student.name, action: a.action, timestamp: a.timestamp })),
      parentConfirmations,
      avgRating: t.ratings.length > 0 ? (t.ratings.reduce((a, r) => a + r.rating, 0) / t.ratings.length).toFixed(1) : null,
    })})

    return NextResponse.json({ trips: formatted, total, page, totalPages: Math.ceil(total / limit) })
  } catch (e) {
    console.error(e)
    const msg = 'Internal server error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(req:NextRequest) {
  const user=await getUserFromSession()
  if(!user)return NextResponse.json({error:'Unauthorized'},{status:401})
  const {id}=await req.json().catch(()=>({}))
  if(typeof id!=='string')return NextResponse.json({error:'Trip ID required'},{status:400})
  const trip=await prisma.trip.findUnique({where:{id},select:{id:true,driverId:true,maintainerId:true,routeId:true,route:{select:{organizationId:true}},busId:true}})
  if(!trip)return NextResponse.json({error:'Not found'},{status:404})
  let allowed=trip.driverId===user.id||trip.maintainerId===user.id
  if(['ADMIN','SCHOOL_ADMIN'].includes(user.role))allowed=(await resolveUserOrganizationId(user.id))===trip.route.organizationId
  if(user.role==='SUPER_ADMIN')allowed=true
  if(user.role==='PARENT')allowed=Boolean(await prisma.student.findFirst({where:{parentId:user.id,busId:trip.busId,routeId:trip.routeId},select:{id:true}}))
  if(!allowed)return NextResponse.json({error:'Not found'},{status:404})
  await prisma.tripHistoryDeletion.upsert({where:{tripId_userId:{tripId:id,userId:user.id}},create:{tripId:id,userId:user.id},update:{}})
  return NextResponse.json({success:true})
}
