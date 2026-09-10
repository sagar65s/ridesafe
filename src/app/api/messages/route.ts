import { NextResponse, NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { getUserFromSession } from '@/lib/auth'
import { resolveUserOrganizationId } from '@/lib/authorization'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
    try {
        const user = await getUserFromSession()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        // Find all messages involving this user (either sent or received)
        const messages = await prisma.message.findMany({
            where: { OR: [{ senderId: user.id, senderDeletedAt: null }, { recipientId: user.id, recipientDeletedAt: null }] },
            orderBy: { createdAt: 'asc' },
            include: {
                sender: { select: { id: true, name: true, role: true } },
                recipient: { select: { id: true, name: true, role: true } }
            }
        })

        return NextResponse.json({ messages })
    } catch (error) {
        console.error('Messages GET Error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const user = await getUserFromSession()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { id } = await request.json()
        if (!id) return NextResponse.json({ error: 'Message ID required' }, { status: 400 })

        // Only the recipient can mark a message as read
        const msg = await prisma.message.findUnique({ where: { id } })
        if (!msg) return NextResponse.json({ error: 'Not found' }, { status: 404 })
        if (msg.recipientId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

        await prisma.message.update({ where: { id }, data: { read: true } })
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Messages PATCH Error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

export async function POST(request: NextRequest) {
    try {
        const user = await getUserFromSession()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const data = await request.json()
        if (!data.recipientId || !data.content) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
        }
        const content = String(data.content).trim()
        if (!content || content.length > 2000) return NextResponse.json({ error: 'Message must be between 1 and 2000 characters' }, { status: 400 })
        const [senderOrganizationId, recipient, recipientOrganizationId] = await Promise.all([
            resolveUserOrganizationId(user.id),
            prisma.user.findUnique({ where: { id: data.recipientId }, select: { id: true, role: true, isActive: true } }),
            resolveUserOrganizationId(data.recipientId),
        ])
        if (!recipient || (!['SUPER_ADMIN'].includes(user.role) && (!senderOrganizationId || senderOrganizationId !== recipientOrganizationId))) {
            return NextResponse.json({ error: 'Invalid recipient' }, { status: 403 })
        }
        if (!recipient.isActive) return NextResponse.json({ error: 'Recipient is inactive' }, { status: 400 })
        if (['PARENT', 'DRIVER'].includes(user.role) && !['ADMIN', 'SCHOOL_ADMIN'].includes(recipient.role)) {
            return NextResponse.json({ error: 'Parents and drivers can message only their assigned school transport team' }, { status: 403 })
        }

        const message = await prisma.message.create({
            data: {
                senderId: user.id,
                recipientId: data.recipientId,
                content
            },
            include: {
                sender: { select: { id: true, name: true, role: true } },
                recipient: { select: { id: true, name: true, role: true } }
            }
        })

        return NextResponse.json({ message })
    } catch (error) {
        console.error('Messages POST Error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

export async function DELETE(request: NextRequest) {
  const user = await getUserFromSession()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await request.json().catch(() => ({}))
  if (typeof id !== 'string') return NextResponse.json({ error: 'Message ID required' }, { status: 400 })
  const message = await prisma.message.findUnique({ where: { id } })
  if (!message || (message.senderId !== user.id && message.recipientId !== user.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.message.update({ where: { id }, data: { ...(message.senderId === user.id && { senderDeletedAt: new Date() }), ...(message.recipientId === user.id && { recipientDeletedAt: new Date() }) } })
  return NextResponse.json({ success: true })
}
