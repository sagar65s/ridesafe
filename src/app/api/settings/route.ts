import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getUserFromSession } from '@/lib/auth'
import { resolveUserOrganizationId } from '@/lib/authorization'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const user = await getUserFromSession()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const organizationId = await resolveUserOrganizationId(user.id)
    const scopedKey = organizationId ? `PICKUP_TIMES:${organizationId}` : 'PICKUP_TIMES'
    const [scoped, global] = await Promise.all([
      prisma.systemSetting.findUnique({ where: { key: scopedKey } }),
      scopedKey === 'PICKUP_TIMES' ? Promise.resolve(null) : prisma.systemSetting.findUnique({ where: { key: 'PICKUP_TIMES' } }),
    ])
    const value = scoped?.value || global?.value || '["3:00 PM","4:00 PM","5:00 PM"]'

    return NextResponse.json({
      times: JSON.parse(value)
    })
  } catch (error) {
    console.error('Error fetching settings:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getUserFromSession()
    if (!user || !['SUPER_ADMIN','SCHOOL_ADMIN'].includes(user.role)) {
      return NextResponse.json({ error: 'Unauthorized. Admin role required.' }, { status: 401 })
    }

    const { times } = await req.json()

    if (!Array.isArray(times) || times.length < 1 || times.length > 20 || times.some(time => typeof time !== 'string' || !time.trim() || time.length > 30)) {
      return NextResponse.json({ error: 'Times must contain 1-20 valid time labels' }, { status: 400 })
    }
    const organizationId = await resolveUserOrganizationId(user.id)
    if (user.role !== 'SUPER_ADMIN' && !organizationId) return NextResponse.json({ error: 'Organization assignment required' }, { status: 403 })
    const key = organizationId ? `PICKUP_TIMES:${organizationId}` : 'PICKUP_TIMES'

    const setting = await prisma.systemSetting.upsert({
      where: { key },
      update: { value: JSON.stringify(times.map(time => time.trim())) },
      create: { key, value: JSON.stringify(times.map(time => time.trim())) },
    })

    return NextResponse.json({
      times: JSON.parse(setting.value)
    })
  } catch (error) {
    console.error('Error updating settings:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
