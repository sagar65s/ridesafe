import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import prisma from '../prisma'
import { billplzAdapter } from '../adapters/billplz'

export const REGISTRATION_FEE = Number(process.env.REGISTRATION_FEE_AMOUNT || 50)

interface RegistrationInput {
  parentName: string
  parentEmail: string
  parentContact1: string
  parentContact2?: string | null
  studentName: string
  studentGrade: string
  studentLevel?: string | null
  dob?: string | null
  preferredStartDate?: string | null
  selfPickupSession?: string | null
  organizationId?: string | null
  origin: string // request origin, e.g. https://ridesafe.com.my
}

function generateTempPassword(): string {
  return crypto.randomBytes(6).toString('base64url').replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || 'Ride' + Date.now()
}

export function registrationAccessToken(pendingId: string): string {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters')
  return crypto.createHmac('sha256', secret).update(`registration:${pendingId}`).digest('hex')
}

export class RegistrationService {
  async createPendingRegistration(input: RegistrationInput) {
    const amount = REGISTRATION_FEE
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Registration fee is not configured correctly')

    const pending = await prisma.pendingRegistration.create({
      data: {
        parentName: input.parentName.trim(),
        parentEmail: input.parentEmail.trim().toLowerCase(),
        parentContact1: input.parentContact1.trim(),
        parentContact2: input.parentContact2?.trim() || null,
        studentName: input.studentName.trim(),
        studentGrade: input.studentGrade.trim(),
        studentLevel: input.studentLevel?.trim() || 'Primary',
        dob: input.dob ? new Date(input.dob) : null,
        preferredStartDate: input.preferredStartDate ? new Date(input.preferredStartDate) : null,
        selfPickupSession: input.selfPickupSession || null,
        amount,
        status: 'PENDING',
        organizationId: input.organizationId || null,
      },
    })

    const bill = await billplzAdapter.createBill({
      name: input.parentName.trim(),
      email: input.parentEmail.trim(),
      mobile: input.parentContact1.trim(),
      amount,
      description: `RideSafe registration — ${input.studentName.trim()}`,
      callbackUrl: `${input.origin}/api/public/billplz/callback`,
      redirectUrl: `${input.origin}/student-form?regId=${pending.id}&token=${registrationAccessToken(pending.id)}`,
      reference: pending.id,
    })

    if (!bill.success) {
      await prisma.pendingRegistration.update({ where: { id: pending.id }, data: { status: 'FAILED' } })
      throw new Error(bill.error || 'Failed to create payment bill')
    }

    const updated = await prisma.pendingRegistration.update({
      where: { id: pending.id },
      data: { billId: bill.billId, billUrl: bill.url },
    })

    return { pending: updated, redirectUrl: bill.url! }
  }

  /**
   * Idempotently marks a pending registration as paid and creates the
   * parent User + Student records. Safe to call more than once for the
   * same registration (e.g. webhook retries).
   */
  async fulfillRegistration(pendingId: string) {
    const tempPassword = generateTempPassword()
    const passwordHash = await bcrypt.hash(tempPassword, 12)
    return prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "PendingRegistration" WHERE id = ${pendingId} FOR UPDATE`
      const pending = await tx.pendingRegistration.findUnique({ where: { id: pendingId } })
      if (!pending) throw new Error('Registration not found')
      if (pending.status === 'PAID') return pending

      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${pending.parentEmail}))`
      let parent = await tx.user.findUnique({ where: { email: pending.parentEmail } })
      if (parent && parent.role !== 'PARENT') throw new Error('This email belongs to a non-parent account')
      if (parent?.organizationId && pending.organizationId && parent.organizationId !== pending.organizationId) {
        throw new Error('This parent account belongs to a different school')
      }
      const isNewParent = !parent
      const activeOrganizations = await tx.organization.findMany({
        where: { isActive: true },
        select: { id: true },
        take: 2,
      })
      const inferredOrganizationId = pending.organizationId || (activeOrganizations.length === 1 ? activeOrganizations[0].id : null)
      if (!parent) {
        parent = await tx.user.create({
          data: {
            name: pending.parentName,
            email: pending.parentEmail,
            password: passwordHash,
            role: 'PARENT',
            phone: pending.parentContact1,
            organizationId: inferredOrganizationId,
          },
        })
      } else if (!parent.organizationId && inferredOrganizationId) {
        parent = await tx.user.update({
          where: { id: parent.id },
          data: { organizationId: inferredOrganizationId },
        })
      }

      const student = await tx.student.create({
        data: {
          name: pending.studentName, grade: pending.studentGrade, level: pending.studentLevel,
          dob: pending.dob, preferredStartDate: pending.preferredStartDate,
          parentContact1: pending.parentContact1, parentContact2: pending.parentContact2,
          isSelfPickup: !!pending.selfPickupSession, selfPickupSession: pending.selfPickupSession,
          status: 'PENDING', parentId: parent.id, organizationId: parent.organizationId,
        },
      })

      await tx.payment.create({
        data: { parentId: parent.id, amount: pending.amount, status: 'PAID', paidAt: new Date() },
      })

      return tx.pendingRegistration.update({
        where: { id: pendingId },
        data: {
          status: 'PAID', paidAt: new Date(), tempPassword: isNewParent ? tempPassword : null,
          createdUserId: parent.id, createdStudentId: student.id,
        },
      })
    })
  }
}

export const registrationService = new RegistrationService()
