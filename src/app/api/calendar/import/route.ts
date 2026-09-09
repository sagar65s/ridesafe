import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getUserFromSession } from '@/lib/auth'
import { writeAuditLog } from '@/lib/audit'

const TYPES = ['HOLIDAY', 'WORKING_DAY', 'SPECIAL_HOLIDAY', 'EXAM', 'EVENT', 'TERM_START', 'TERM_END', 'ASSEMBLY']

export async function GET() {
  const session = await getUserFromSession()
  if (!session || session.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const imports = await prisma.academicCalendarImport.findMany({
    orderBy: { createdAt: 'desc' }, take: 50,
    include: { organization: { select: { id: true, name: true } }, importedBy: { select: { id: true, name: true } } },
  })
  return NextResponse.json({ imports })
}

function parseCsvLine(line: string): string[] {
  const values: string[] = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"' && quoted && line[i + 1] === '"') { current += '"'; i++; continue }
    if (char === '"') { quoted = !quoted; continue }
    if (char === ',' && !quoted) { values.push(current.trim()); current = ''; continue }
    current += char
  }
  values.push(current.trim())
  return values
}

export async function POST(request: NextRequest) {
  const session = await getUserFromSession()
  if (!session || session.role !== 'SUPER_ADMIN') return NextResponse.json({ error: 'Only the Super Admin can import academic calendars' }, { status: 403 })
  const form = await request.formData()
  const file = form.get('file')
  const academicYear = String(form.get('academicYear') || '').trim()
  const organizationId = String(form.get('organizationId') || '').trim() || null
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.csv')) return NextResponse.json({ error: 'Please upload a CSV file' }, { status: 400 })
  if (!academicYear || academicYear.length > 20) return NextResponse.json({ error: 'Academic year is required' }, { status: 400 })
  if (file.size > 2 * 1024 * 1024) return NextResponse.json({ error: 'Calendar file must be smaller than 2 MB' }, { status: 400 })
  if (organizationId) {
    const school = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } })
    if (!school) return NextResponse.json({ error: 'School not found' }, { status: 400 })
  }

  const lines = (await file.text()).replace(/^\uFEFF/, '').split(/\r?\n/).filter(line => line.trim())
  if (lines.length < 2 || lines.length > 2001) return NextResponse.json({ error: 'CSV must contain a header and 1–2000 event rows' }, { status: 400 })
  const headers = parseCsvLine(lines[0]).map(v => v.toLowerCase())
  const required = ['title', 'startdate', 'type']
  if (required.some(name => !headers.includes(name))) return NextResponse.json({ error: 'CSV headers must include title,startDate,type' }, { status: 400 })
  const at = (row: string[], name: string) => row[headers.indexOf(name)] || ''
  let events
  try {
    events = lines.slice(1).map((line, index) => {
      const row = parseCsvLine(line)
      const startDate = new Date(at(row, 'startdate'))
      const endRaw = at(row, 'enddate')
      const endDate = endRaw ? new Date(endRaw) : null
      const type = at(row, 'type').toUpperCase()
      if (!at(row, 'title') || Number.isNaN(startDate.getTime()) || (endDate && (Number.isNaN(endDate.getTime()) || endDate < startDate)) || !TYPES.includes(type)) throw new Error(`Invalid data on CSV row ${index + 2}`)
      return {
        title: at(row, 'title').slice(0, 160), description: at(row, 'description').slice(0, 1000) || null,
        startDate, endDate, type, isPublic: at(row, 'ispublic').toLowerCase() !== 'false',
        color: at(row, 'color') || '#1E3A8A', organizationId,
      }
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid CSV data' }, { status: 400 })
  }

  const imported = await prisma.$transaction(async tx => {
    await tx.academicEvent.createMany({ data: events })
    return tx.academicCalendarImport.create({ data: { fileName: file.name.slice(0, 255), academicYear, eventCount: events.length, organizationId, importedById: session.id } })
  })
  await writeAuditLog({ actorId: session.id, organizationId, action: 'IMPORT', entityType: 'ACADEMIC_CALENDAR', entityId: imported.id, details: { fileName: imported.fileName, academicYear, eventCount: events.length } })
  return NextResponse.json({ imported, eventCount: events.length }, { status: 201 })
}
