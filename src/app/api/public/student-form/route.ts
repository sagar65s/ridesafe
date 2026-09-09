import { NextRequest, NextResponse } from 'next/server'
import { registrationService, REGISTRATION_FEE } from '@/lib/services/registrationService'
import prisma from '@/lib/prisma'
import { z } from 'zod'

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}, 'Invalid calendar date').or(z.literal('')).nullish()
const formSchema = z.object({
  parentName: z.string().trim().min(2).max(100), parentEmail: z.string().trim().email().max(255).toLowerCase(),
  name: z.string().trim().min(2).max(100), grade: z.string().trim().min(1).max(50),
  level: z.string().trim().max(50).nullish(), dob: date, preferredStartDate: date,
  parentContact1: z.string().trim().regex(/^[+0-9\s()-]{7,20}$/),
  parentContact2: z.string().trim().regex(/^[+0-9\s()-]{7,20}$/).or(z.literal('')).nullish(),
  selfPickupSession: z.string().max(100).nullish(), organizationId: z.string().max(100).nullish(),
})

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const result = formSchema.safeParse(body)
    if (!result.success) return NextResponse.json({ error: result.error.issues[0]?.message || 'Invalid registration details' }, { status: 400 })
    const { parentName, parentEmail, name, grade, level, dob, preferredStartDate, parentContact1, parentContact2, selfPickupSession, organizationId } = result.data

    if (!parentName || !parentName.trim() || parentName.trim().length < 2) {
      return NextResponse.json({ error: 'Parent/guardian name must be at least 2 characters' }, { status: 400 })
    }
    if (!parentEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parentEmail)) {
      return NextResponse.json({ error: 'A valid parent/guardian email is required' }, { status: 400 })
    }
    if (!name || !name.trim() || name.trim().length < 2) {
      return NextResponse.json({ error: 'Student name must be at least 2 characters' }, { status: 400 })
    }
    if (!grade || !grade.trim()) {
      return NextResponse.json({ error: 'Grade is required' }, { status: 400 })
    }
    if (!parentContact1 || !/^[+0-9\s()-]{7,20}$/.test(parentContact1.trim())) {
      return NextResponse.json({ error: 'A valid parent/guardian phone number is required' }, { status: 400 })
    }
    const todayStr = new Date().toISOString().slice(0, 10)
    if (dob && dob > todayStr) {
      return NextResponse.json({ error: 'Date of birth cannot be in the future' }, { status: 400 })
    }
    if (preferredStartDate && preferredStartDate < todayStr) {
      return NextResponse.json({ error: 'Preferred start date cannot be in the past' }, { status: 400 })
    }
    let resolvedOrganizationId = organizationId || null
    if (resolvedOrganizationId) {
      const organization = await prisma.organization.findFirst({ where: { id: resolvedOrganizationId, isActive: true }, select: { id: true } })
      if (!organization) return NextResponse.json({ error: 'Please select a valid school' }, { status: 400 })
    } else {
      const activeOrganizations = await prisma.organization.findMany({ where: { isActive:true }, select: { id:true }, take:2 })
      if (activeOrganizations.length === 0) return NextResponse.json({ error: 'Registration is not available until a school is configured' }, { status: 503 })
      if (activeOrganizations.length > 1) return NextResponse.json({ error: 'Please select your school' }, { status: 400 })
      resolvedOrganizationId = activeOrganizations[0].id
    }

    const existingParent = await prisma.user.findUnique({ where: { email: parentEmail }, select: { role: true, isActive: true, organizationId: true } })
    if (existingParent && (existingParent.role !== 'PARENT' || !existingParent.isActive || (existingParent.organizationId && existingParent.organizationId !== resolvedOrganizationId))) return NextResponse.json({ error: 'This email cannot register for this school. Contact the school office before payment.' }, { status: 409 })

    const configuredAppUrl = process.env.APP_URL
    if (process.env.NODE_ENV === 'production' && !configuredAppUrl) {
      return NextResponse.json({ error: 'Registration service is not configured' }, { status: 503 })
    }
    const appUrl = new URL(configuredAppUrl || req.nextUrl.origin)
    const loopback = ['localhost', '127.0.0.1', '::1'].includes(appUrl.hostname)
    if (process.env.NODE_ENV === 'production' && appUrl.protocol !== 'https:' && !loopback) {
      return NextResponse.json({ error: 'Registration service requires HTTPS' }, { status: 503 })
    }

    const { pending, redirectUrl } = await registrationService.createPendingRegistration({
      parentName, parentEmail, parentContact1, parentContact2,
      studentName: name, studentGrade: grade, studentLevel: level, dob, preferredStartDate, selfPickupSession, organizationId:resolvedOrganizationId,
      origin: appUrl.origin,
    })

    return NextResponse.json({ billId: pending.id, redirectUrl, amount: REGISTRATION_FEE })
  } catch (error) {
    console.error('Public student form error:', error)
    return NextResponse.json({ error: 'Failed to submit registration' }, { status: 500 })
  }
}
