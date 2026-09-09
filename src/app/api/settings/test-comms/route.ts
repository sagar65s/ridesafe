import { NextRequest, NextResponse } from 'next/server'
import { getUserFromSession } from '@/lib/auth'
import prisma from '@/lib/prisma'
import { Resend } from 'resend'

export const dynamic = 'force-dynamic'

/**
 * POST /api/settings/test-comms
 * Sends a test notification to verify email/SMS configuration.
 * Currently saves a test notification record to DB as confirmation.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromSession()
    if (!user || !['SUPER_ADMIN', 'SCHOOL_ADMIN'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const type = body.type || 'EMAIL'

    if (!['EMAIL', 'SMS', 'PUSH'].includes(type)) {
      return NextResponse.json({ error: 'Invalid comms type. Use EMAIL, SMS or PUSH.' }, { status: 400 })
    }

    if (type === 'PUSH') {
      await prisma.notification.create({ data: { userId:user.id, title:'RideSafe notification test', body:'In-app notification delivery is working.', type:'INFO' } })
      return NextResponse.json({ success:true, delivery:'IN_APP', message:'In-app notification delivered. Browser push additionally requires notification permission on the device.' })
    }
    if (type === 'SMS') return NextResponse.json({ success:false, error:'SMS provider is not configured in this build' }, { status:501 })
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) return NextResponse.json({ success:false, error:'RESEND_API_KEY and EMAIL_FROM are required for email delivery' }, { status:503 })
    const account = await prisma.user.findUnique({ where:{ id:user.id }, select:{ email:true,name:true } })
    if (!account) return NextResponse.json({ error:'Account not found' }, { status:404 })
    const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({ from:process.env.EMAIL_FROM, to:account.email, subject:'RideSafe email test', text:`Hello ${account.name},\n\nRideSafe email delivery is configured correctly.` })
    if (error) return NextResponse.json({ success:false, error:error.message }, { status:502 })
    return NextResponse.json({ success:true, delivery:'EMAIL', message:`Test email sent to ${account.email}` })
  } catch (error) {
    console.error('test-comms error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
