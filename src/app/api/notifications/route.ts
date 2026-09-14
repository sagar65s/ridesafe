import { NextResponse, NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { sendCalendarReminders, calendarReminderCopy } from '@/lib/calendar-notifications'
import {transportMessage} from '@/lib/notification-delivery'
import { getUserFromSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
    try {
        const user = await getUserFromSession()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        if (user.role === 'PARENT') await sendCalendarReminders(user.id).catch(error => console.error('Calendar reminders failed', error))
        const notifications = await prisma.notification.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: 'desc' },
            take: 50
        })

        const profile = await prisma.user.findUnique({where:{id:user.id},select:{locale:true}})
        return NextResponse.json({ notifications: notifications.map(n=>{try{const meta=JSON.parse(n.metadata || '{}');if(n.type === 'CALENDAR_REMINDER' && meta.eventTitle) return {...n,...calendarReminderCopy(profile?.locale || 'en',meta.eventTitle,meta.date,meta.tomorrow)};return meta.studentName && ['PICKED_UP','DROPPED_OFF','ABSENT','BUS_ETA_5_MIN'].includes(n.type) ? {...n,...transportMessage(profile?.locale || 'en',n.type,meta.studentName,meta.stopName || '',meta.actorName || '')}:n}catch{return n}}) })
    } catch (error) {
        console.error('Notifications GET Error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

export async function PATCH(request: NextRequest) {
    try {
        const user = await getUserFromSession()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const data = await request.json()
        if (data.markAll === true) {
            const types=Array.isArray(data.types)?data.types.filter((item:unknown):item is string=>typeof item==='string').slice(0,30):[]
            const updated=await prisma.notification.updateMany({where:{userId:user.id,read:false,...(types.length?{type:{in:types}}:{})},data:{read:true}})
            return NextResponse.json({updated:updated.count})
        }
        if (typeof data.id !== 'string' || typeof data.read !== 'boolean') return NextResponse.json({ error: 'Missing id' }, { status: 400 })

        const notification = await prisma.notification.findUnique({ where: { id: data.id } })
        if (notification?.userId !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

        const updated = await prisma.notification.update({
            where: { id: data.id },
            data: { read: data.read }
        })

        return NextResponse.json({ notification: updated })
    } catch (error) {
        console.error('Notifications PATCH Error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const user = await getUserFromSession()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        const data = await request.json().catch(() => ({}))
        if (typeof data.id !== 'string') return NextResponse.json({ error: 'Missing id' }, { status: 400 })
        const deleted = await prisma.notification.deleteMany({ where: { id: data.id, userId: user.id } })
        if (!deleted.count) return NextResponse.json({ error: 'Not found' }, { status: 404 })
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Notifications DELETE Error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
