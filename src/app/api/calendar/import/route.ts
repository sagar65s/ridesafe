import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/authorization'
import { parseCalendarFile } from '@/lib/calendar-import'
import { writeAuditLog } from '@/lib/audit'
export const runtime = 'nodejs'

export async function GET() {
  const actor = await getCurrentUser()
  if (!actor || !['SUPER_ADMIN', 'SCHOOL_ADMIN'].includes(actor.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const imports = await prisma.academicCalendarImport.findMany({ where: actor.role === 'SUPER_ADMIN' ? {} : { organizationId: actor.organizationId || '__none__' }, orderBy: { createdAt: 'desc' }, take: 50, include: { organization: { select: { id: true, name: true } }, importedBy: { select: { name: true } } } })
  return NextResponse.json({ imports })
}
export async function POST(request: NextRequest) {
  const actor = await getCurrentUser()
  if (!actor || !['SUPER_ADMIN', 'SCHOOL_ADMIN'].includes(actor.role)) return NextResponse.json({ error: 'Only Super Admin and School Admin can import calendars' }, { status: 403 })
  try {
    if (Number(request.headers.get('content-length')) > 2.1 * 1024 * 1024) return NextResponse.json({ error: 'File too large' }, { status: 413 })
    const form = await request.formData(), file = form.get('file')
    if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a calendar file' }, { status: 400 })
    const requestedOrg = String(form.get('organizationId') || '')
    if (actor.role !== 'SUPER_ADMIN' && requestedOrg && requestedOrg !== actor.organizationId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const organizationId = actor.role === 'SUPER_ADMIN' ? requestedOrg || null : actor.organizationId
    if (actor.role !== 'SUPER_ADMIN' && !organizationId) return NextResponse.json({ error: 'School assignment required' }, { status: 403 })
    if (organizationId && !await prisma.organization.findFirst({ where: { id: organizationId, isActive: true } })) return NextResponse.json({ error: 'Invalid school' }, { status: 400 })
    const academicYear = String(form.get('academicYear') || '').trim()
    if (!academicYear || academicYear.length > 20) return NextResponse.json({ error: 'Academic year is required' }, { status: 400 })
    const events = await parseCalendarFile(file, organizationId)
    const imported = await prisma.$transaction(async tx => {
      await tx.academicEvent.createMany({ data: events })
      return tx.academicCalendarImport.create({ data: { fileName: file.name.slice(0, 255), academicYear, eventCount: events.length, organizationId, importedById: actor.id } })
    })
    await writeAuditLog({ actorId: actor.id, organizationId, action: 'IMPORT', entityType: 'ACADEMIC_CALENDAR', entityId: imported.id })
    return NextResponse.json({ imported, eventCount: events.length }, { status: 201 })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Import failed' }, { status: 400 }) }
}
