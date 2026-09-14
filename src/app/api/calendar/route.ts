import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getUserFromSession } from '@/lib/auth'
import { getCurrentUser } from '@/lib/authorization'
import { after } from 'next/server'
import { notifyCalendarPublished } from '@/lib/calendar-notifications'

export async function GET(request: NextRequest) {
  try {
    const session = await getUserFromSession()
    if (!session) return NextResponse.json({error:'Unauthorized'},{status:401})
    const user = session ? await prisma.user.findUnique({ where: { id: session.id }, select: { role: true, organizationId: true } }) : null

    const isAdmin = user && ['ADMIN', 'SUPER_ADMIN', 'SCHOOL_ADMIN'].includes(user.role)
    const requestedOrganizationId = new URL(request.url).searchParams.get('organizationId')
    const organizationId = user?.role === 'SUPER_ADMIN' ? requestedOrganizationId : user?.organizationId
    if (!organizationId) return NextResponse.json({ events: [] })
    if (user?.role === 'SUPER_ADMIN' && !await prisma.organization.findFirst({ where:{ id:organizationId,isActive:true },select:{id:true} })) return NextResponse.json({error:'Invalid school'},{status:400})
    const orgScope = { organizationId }

    const events = await prisma.academicEvent.findMany({
      where: isAdmin ? orgScope : { ...orgScope, isPublic: true },
      orderBy: { startDate: 'asc' }
    })

    return NextResponse.json({ events })
  } catch (error) {
    console.error('Academic Calendar GET Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getUserFromSession()
    if (!session || !['SUPER_ADMIN', 'SCHOOL_ADMIN'].includes(session.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const body = await request.json()
    const { title, description, startDate, endDate, type, isPublic, color } = body
    const actor = await getCurrentUser()
    if (!actor || (actor.role !== 'SUPER_ADMIN' && !actor.organizationId)) return NextResponse.json({ error: 'School assignment required' }, { status: 403 })
    if (actor.role !== 'SUPER_ADMIN' && body.organizationId && body.organizationId !== actor.organizationId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const organizationId = actor.role === 'SUPER_ADMIN' ? body.organizationId || null : actor.organizationId
    if (!organizationId) return NextResponse.json({ error: 'Select a school before adding an academic event' }, { status: 400 })

    if (!title || !String(title).trim() || !startDate) {
      return NextResponse.json({ error: 'Title and Start Date are required' }, { status: 400 })
    }
    const validTypes = ['HOLIDAY', 'FESTIVAL', 'WORKING_DAY', 'SPECIAL_HOLIDAY', 'EXAM', 'EVENT', 'TERM_START', 'TERM_END', 'ASSEMBLY']
    const parsedStartDate = new Date(startDate)
    const parsedEndDate = endDate ? new Date(endDate) : null
    if (Number.isNaN(parsedStartDate.getTime()) || (parsedEndDate && (Number.isNaN(parsedEndDate.getTime()) || parsedEndDate < parsedStartDate))) return NextResponse.json({ error: 'Enter a valid date range' }, { status: 400 })
    if (type && !validTypes.includes(type)) return NextResponse.json({ error: 'Invalid academic event type' }, { status: 400 })
    if (organizationId) {
      const organization = await prisma.organization.findUnique({ where: { id:organizationId }, select:{ isActive:true } })
      if (!organization?.isActive) return NextResponse.json({ error: 'Invalid or inactive school' }, { status: 400 })
    }

    const event = await prisma.academicEvent.create({
      data: {
        title: String(title).trim(),
        description: description && String(description).trim() ? String(description).trim() : null,
        startDate: parsedStartDate,
        endDate: parsedEndDate,
        type: type || 'EVENT',
        isPublic: isPublic !== undefined ? isPublic : true,
        color: color || '#1E3A8A',
        organizationId,
      }
    })
    after(async () => { try { await notifyCalendarPublished(event.organizationId, event.id) } catch (error) { console.error('Calendar created; parent alert failed', error) } })

    return NextResponse.json({ event })
  } catch (error) {
    console.error('Academic Calendar POST Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
