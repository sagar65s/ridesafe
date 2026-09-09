import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import crypto from 'crypto'
import { registrationAccessToken } from '@/lib/services/registrationService'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const regId = req.nextUrl.searchParams.get('regId')
    const token = req.nextUrl.searchParams.get('token') || ''
    if (!regId) {
      return NextResponse.json({ error: 'Missing regId' }, { status: 400 })
    }
    const expected = registrationAccessToken(regId)
    if (!/^[a-f0-9]{64}$/.test(token) || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
      return NextResponse.json({ error: 'Invalid registration access token' }, { status: 403 })
    }

    const pending = await prisma.pendingRegistration.findUnique({ where: { id: regId } })
    if (!pending) {
      return NextResponse.json({ error: 'Registration not found' }, { status: 404 })
    }

    const payload: Record<string, unknown> = {
      status: pending.status,
      studentName: pending.studentName,
      parentEmail: pending.parentEmail,
      mockMode: pending.billUrl?.startsWith('/register/mock-pay/') || false,
      billUrl: pending.status === 'PENDING' ? pending.billUrl : undefined,
    }

    // One-time reveal of the generated password, then wipe it server-side.
    if (pending.status === 'PAID' && pending.tempPassword) {
      payload.tempPassword = pending.tempPassword
      await prisma.pendingRegistration.update({ where: { id: regId }, data: { tempPassword: null } })
    }

    return NextResponse.json(payload)
  } catch (error) {
    console.error('Registration status error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
