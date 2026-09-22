import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { getUserFromSession } from '@/lib/auth'
import prisma from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const phonePattern = /^[+0-9\s()\-]{7,20}$/
const photoPattern = /^data:image\/(?:jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/

function validatedPhoto(value: unknown, current: string | null) {
  if (value === undefined) return current
  if (value === null || value === '') return null
  if (typeof value !== 'string') throw new Error('Invalid profile photo')
  const match = photoPattern.exec(value)
  if (!match || Buffer.byteLength(match[1], 'base64') > 600 * 1024) throw new Error('Use a JPEG, PNG or WebP profile photo up to 600 KB')
  return value
}

export async function PATCH(req: NextRequest) {
  const session = await getUserFromSession()
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const current = await prisma.user.findUnique({ where: { id: session.id } })
  if (!current) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  const name = typeof body.name === 'string' ? body.name.trim() : current.name
  const phone = typeof body.phone === 'string' ? body.phone.trim() : current.phone
  if (name.length < 2 || name.length > 100) return NextResponse.json({ error: 'Name must be between 2 and 100 characters' }, { status: 400 })
  if (phone && !phonePattern.test(phone)) return NextResponse.json({ error: 'Enter a valid phone number' }, { status: 400 })

  const data: Record<string, unknown> = { name, phone: phone || null }
  if (body.password) {
    if (typeof body.password !== 'string' || body.password.length < 8 || Buffer.byteLength(body.password, 'utf8') > 72) return NextResponse.json({ error: 'Password must be 8-72 bytes' }, { status: 400 })
    data.password = await bcrypt.hash(body.password, 12)
  }

  if (current.role === 'PARENT') {
    const address = typeof body.address === 'string' ? body.address.trim() : current.address || ''
    const emergencyContactName = typeof body.emergencyContactName === 'string' ? body.emergencyContactName.trim() : current.emergencyContactName || ''
    const emergencyContactPhone = typeof body.emergencyContactPhone === 'string' ? body.emergencyContactPhone.trim() : current.emergencyContactPhone || ''
    const relationship = typeof body.relationship === 'string' ? body.relationship.trim() : current.relationship || ''
    if (!phone || !address || !emergencyContactName || !emergencyContactPhone || !relationship) return NextResponse.json({ error: 'Complete every required parent detail before continuing' }, { status: 400 })
    if (address.length < 5 || address.length > 500) return NextResponse.json({ error: 'Address must be between 5 and 500 characters' }, { status: 400 })
    if (emergencyContactName.length < 2 || emergencyContactName.length > 100) return NextResponse.json({ error: 'Enter a valid emergency contact name' }, { status: 400 })
    if (!phonePattern.test(emergencyContactPhone)) return NextResponse.json({ error: 'Enter a valid emergency contact phone number' }, { status: 400 })
    if (relationship.length < 2 || relationship.length > 50) return NextResponse.json({ error: 'Enter a valid relationship' }, { status: 400 })
    let photoUrl: string | null
    try { photoUrl = validatedPhoto(body.photoUrl, current.photoUrl) }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid profile photo' }, { status: 400 }) }
    Object.assign(data, { address, emergencyContactName, emergencyContactPhone, relationship, photoUrl, profileCompleted: true })
  }

  const user = await prisma.user.update({
    where: { id: session.id },
    data,
    select: { id: true, name: true, email: true, phone: true, address: true, emergencyContactName: true, emergencyContactPhone: true, relationship: true, photoUrl: true, profileCompleted: true },
  })
  return NextResponse.json({ user })
}
