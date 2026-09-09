import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getUserFromSession } from '@/lib/auth'
import { getCurrentUser } from '@/lib/authorization'
import { writeAuditLog } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const CATEGORIES = ['DELAY', 'DRIVER', 'BUS', 'ROUTE', 'SAFETY', 'ATTENDANCE', 'OTHER']
const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT']
const STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']

export async function GET() {
  const session = await getUserFromSession()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const actor = await getCurrentUser()
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const where = session.role === 'SUPER_ADMIN'
    ? {}
    : session.role === 'PARENT'
      ? { reporterId: session.id }
      : ['SCHOOL_ADMIN', 'ADMIN'].includes(session.role)
        ? { organizationId: actor.organizationId || '__none__' }
        : { id: '__none__' }

  const issues = await prisma.transportIssue.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: {
      reporter: { select: { id: true, name: true, email: true, phone: true } },
      student: { select: { id: true, studentCode: true, name: true, grade: true, className: true, section: true } },
      organization: { select: { id: true, name: true } },
    },
  })
  return NextResponse.json({ issues })
}

export async function POST(request: NextRequest) {
  const session = await getUserFromSession()
  if (!session || session.role !== 'PARENT') return NextResponse.json({ error: 'Only parents can submit transport issues' }, { status: 403 })
  const actor = await getCurrentUser()
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { studentId, category, subject, description, priority } = await request.json().catch(() => ({}))
  if (!CATEGORIES.includes(category)) return NextResponse.json({ error: 'Invalid issue category' }, { status: 400 })
  if (!subject?.trim() || subject.trim().length > 120) return NextResponse.json({ error: 'Subject is required and must be under 120 characters' }, { status: 400 })
  if (!description?.trim() || description.trim().length < 10 || description.trim().length > 2000) return NextResponse.json({ error: 'Description must be between 10 and 2000 characters' }, { status: 400 })
  if (priority && !PRIORITIES.includes(priority)) return NextResponse.json({ error: 'Invalid priority' }, { status: 400 })

  const student = studentId ? await prisma.student.findFirst({ where: { id: studentId, parentId: session.id }, select: { id: true, organizationId: true } }) : null
  if (studentId && !student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })
  const organizationId = student?.organizationId || actor.organizationId
  const issue = await prisma.transportIssue.create({ data: {
    reporterId: session.id, studentId: student?.id || null, organizationId,
    category, subject: subject.trim(), description: description.trim(), priority: priority || 'NORMAL',
  } })
  const admins = await prisma.user.findMany({ where: { organizationId: organizationId || '__none__', role: { in: ['SCHOOL_ADMIN', 'ADMIN'] }, isActive: true }, select: { id: true } })
  if (admins.length) await prisma.notification.createMany({ data: admins.map(admin => ({ userId: admin.id, title: `Transport issue: ${issue.subject}`, body: issue.description, type: issue.priority === 'URGENT' ? 'EMERGENCY' : 'WARNING' })) })
  await writeAuditLog({ actorId: session.id, organizationId, action: 'CREATE', entityType: 'TRANSPORT_ISSUE', entityId: issue.id, details: { category, priority: issue.priority } })
  return NextResponse.json({ issue }, { status: 201 })
}

export async function PATCH(request: NextRequest) {
  const session = await getUserFromSession()
  if (!session || !['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const actor = await getCurrentUser()
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, status, resolution } = await request.json().catch(() => ({}))
  if (!id || !STATUSES.includes(status)) return NextResponse.json({ error: 'Issue id and valid status are required' }, { status: 400 })
  const existing = await prisma.transportIssue.findUnique({ where: { id }, select: { id: true, reporterId: true, organizationId: true } })
  if (!existing || (session.role !== 'SUPER_ADMIN' && existing.organizationId !== actor.organizationId)) return NextResponse.json({ error: 'Issue not found' }, { status: 404 })
  const issue = await prisma.transportIssue.update({ where: { id }, data: { status, resolution: resolution?.trim() || null } })
  await prisma.notification.create({ data: { userId: existing.reporterId, title: `Issue ${status.replace('_', ' ').toLowerCase()}`, body: resolution?.trim() || 'Your transport issue status was updated.', type: 'INFO' } })
  await writeAuditLog({ actorId: session.id, organizationId: existing.organizationId, action: 'UPDATE_STATUS', entityType: 'TRANSPORT_ISSUE', entityId: id, details: { status } })
  return NextResponse.json({ issue })
}
