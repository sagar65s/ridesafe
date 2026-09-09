import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getUserFromSession } from '@/lib/auth'

// Next.js 15: params is now a Promise
type RouteContext = { params: Promise<{ id: string }> }

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getUserFromSession()
    if (!session || session.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    const body = await request.json()
    const { title, description, startDate, endDate, type, isPublic, color } = body

    if (title !== undefined && !String(title).trim()) {
      return NextResponse.json({ error: 'Title cannot be only spaces' }, { status: 400 })
    }
    const existing = await prisma.academicEvent.findUnique({ where:{ id }, select:{ startDate:true,endDate:true } })
    if (!existing) return NextResponse.json({ error:'Event not found' }, { status:404 })
    const validTypes = ['HOLIDAY', 'WORKING_DAY', 'SPECIAL_HOLIDAY', 'EXAM', 'EVENT', 'TERM_START', 'TERM_END', 'ASSEMBLY']
    if (type !== undefined && !validTypes.includes(type)) return NextResponse.json({ error:'Invalid academic event type' }, { status:400 })
    const parsedStart = startDate ? new Date(startDate) : existing.startDate
    const parsedEnd = endDate ? new Date(endDate) : endDate === null ? null : existing.endDate
    if (Number.isNaN(parsedStart.getTime()) || (parsedEnd && (Number.isNaN(parsedEnd.getTime()) || parsedEnd < parsedStart))) return NextResponse.json({ error:'Enter a valid date range' }, { status:400 })

    const updatedEvent = await prisma.academicEvent.update({
      where: { id },
      data: {
        title: title !== undefined ? String(title).trim() : undefined,
        description: description !== undefined ? (description && String(description).trim() ? String(description).trim() : null) : undefined,
        startDate: startDate ? parsedStart : undefined,
        endDate: endDate !== undefined ? parsedEnd : undefined,
        type,
        isPublic,
        color,
      },
    })

    return NextResponse.json({ event: updatedEvent })
  } catch (error) {
    console.error('Calendar PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getUserFromSession()
    if (!session || session.role !== 'SUPER_ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params

    await prisma.academicEvent.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Calendar DELETE error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
