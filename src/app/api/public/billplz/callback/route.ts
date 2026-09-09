import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { billplzAdapter } from '@/lib/adapters/billplz'
import { registrationService } from '@/lib/services/registrationService'

export const dynamic = 'force-dynamic'

/**
 * Real Billplz server-to-server webhook. Only meaningful once
 * BILLPLZ_API_KEY / BILLPLZ_X_SIGNATURE_KEY are configured — in mock mode,
 * registrations are fulfilled via /api/public/billplz/mock-pay instead.
 */
export async function POST(req: NextRequest) {
  try {
    if (!billplzAdapter.isConfigured()) {
      return NextResponse.json({ error: 'Billplz not configured on this server' }, { status: 501 })
    }

    const form = await req.formData()
    const xSignature = String(form.get('x_signature') || '')
    const fields: Record<string, string> = {}
    for (const [key, value] of form.entries()) {
      if (key === 'x_signature') continue
      if (typeof value !== 'string' || Object.hasOwn(fields, key)) {
        return NextResponse.json({ error: 'Invalid callback fields' }, { status: 400 })
      }
      fields[key] = value
    }

    if (!xSignature || !billplzAdapter.verifyXSignature(fields, xSignature)) {
      console.error('[Billplz Callback] Invalid X-Signature')
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
    }

    const billId = fields.id
    const paid = fields.paid === 'true'
    if (!billId) {
      return NextResponse.json({ error: 'Missing bill id' }, { status: 400 })
    }

    const pending = await prisma.pendingRegistration.findUnique({ where: { billId } })
    if (!pending) {
      console.error('[Billplz Callback] No pending registration for bill', billId)
      return NextResponse.json({ received: true })
    }

    if (paid) {
      if (fields.collection_id !== process.env.BILLPLZ_COLLECTION_ID ||
          Number(fields.amount) !== Math.round(pending.amount * 100)) {
        return NextResponse.json({ error: 'Payment does not match registration' }, { status: 400 })
      }
      await registrationService.fulfillRegistration(pending.id)
    } else if (pending.status === 'PENDING') {
      await prisma.pendingRegistration.update({ where: { id: pending.id }, data: { status: 'FAILED' } })
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Billplz callback error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
