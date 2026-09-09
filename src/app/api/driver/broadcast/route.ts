import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getUserFromSession } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'

const TYPES = ['BUS_STARTED', 'BUS_DELAYED', 'ROUTE_DELAY', 'TRAFFIC', 'BREAKDOWN', 'EMERGENCY', 'OTHER']

export async function GET() {
  const session = await getUserFromSession()
  if (!session || session.role !== 'DRIVER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const broadcasts = await prisma.announcement.findMany({ where: { createdBy: session.id }, orderBy: { createdAt: 'desc' }, take: 50 })
  return NextResponse.json({ broadcasts })
}

export async function POST(request: NextRequest) {
  const session = await getUserFromSession()
  if (!session || session.role !== 'DRIVER') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { tripId, type, message } = await request.json().catch(() => ({}))
  if (!TYPES.includes(type)) return NextResponse.json({ error: 'Invalid broadcast type' }, { status: 400 })
  if (!message?.trim() || message.trim().length > 500) return NextResponse.json({ error: 'Message is required and must be under 500 characters' }, { status: 400 })
  const trip = await prisma.trip.findFirst({ where: { id: tripId, driverId: session.id, status: { notIn: ['TRIP_COMPLETED', 'CANCELLED'] } }, include: { route: { select: { organizationId: true } }, bus: { select: { id: true } } } })
  if (!trip) return NextResponse.json({ error: 'Active assigned trip not found' }, { status: 404 })

  const students = await prisma.student.findMany({ where: { routeId: trip.routeId, isActive: true, parentId: { not: null }, OR: [{ busId: trip.busId || undefined }, { busId: null }] }, select: { parentId: true } })
  const parentIds = [...new Set(students.map(student => student.parentId).filter((id): id is string => Boolean(id)))]
  const management = await prisma.user.findMany({ where: { organizationId: trip.route.organizationId || '__none__', role: { in: ['SCHOOL_ADMIN', 'ADMIN'] }, isActive: true }, select: { id: true } })
  const recipients = [...new Set([...parentIds, ...management.map(user => user.id)])]
  const title = type.replaceAll('_', ' ')
  const notificationType = type === 'EMERGENCY' ? 'EMERGENCY' : type.includes('DELAY') || type === 'TRAFFIC' || type === 'BREAKDOWN' ? 'WARNING' : 'INFO'
  const result = await prisma.$transaction(async tx => {
    if (recipients.length) await tx.notification.createMany({ data: recipients.map(userId => ({ userId, title, body: message.trim(), type: notificationType })) })
    return tx.announcement.create({ data: { title, body: message.trim(), targetRole: 'TRIP_USERS', type: notificationType, sentCount: recipients.length, createdBy: session.id, organizationId: trip.route.organizationId, tripId: trip.id, busId: trip.busId, routeId: trip.routeId } })
  })
  await writeAuditLog({ actorId: session.id, organizationId: trip.route.organizationId, action: 'BROADCAST', entityType: 'TRIP', entityId: trip.id, details: { type, recipients: recipients.length } })
  return NextResponse.json({ broadcast: result, sent: recipients.length }, { status: 201 })
}
