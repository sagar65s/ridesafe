import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getUserFromSession } from '@/lib/auth'
import { crewWhere } from '@/lib/transport'
import { pushNotification } from '@/lib/notification-delivery'
import { resolveUserOrganizationId } from '@/lib/authorization'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
    try {
        const user = await getUserFromSession()
        if (!user || !['DRIVER', 'PARENT'].includes(user.role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { latitude, longitude, source } = await req.json()
        const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { name: true, organizationId: true } })
        const organizationId = dbUser?.organizationId || await resolveUserOrganizationId(user.id)

        // Create a new emergency alert
        const alert = await prisma.emergencyAlert.create({
            data: {
                driverId: user.id,
                latitude: latitude ?? null,
                longitude: longitude ?? null,
                resolved: false,
                source: user.role === 'PARENT' || source === 'PARENT' ? 'PARENT' : 'DRIVER',
            }
        })

        // Find active trip for driver to get assigned students' parents
        const activeTrip = user.role === 'DRIVER' ? await prisma.trip.findFirst({
            where: {
                ...crewWhere(user.id),
                status: { in: ['DRIVER_STARTED_ROUTE', 'BUS_EN_ROUTE'] }
            },
            include: {
                route: {
                    include: {
                        students: true
                    }
                }
            }
        }) : null;

        const notificationsToCreate: Array<{ userId: string, title: string, body: string, type: string }> = [];

        // Notify Parents on this route
        if (activeTrip && activeTrip.route.students.length > 0) {
            const parentIds = new Set(
                activeTrip.route.students
                    .filter(s=>s.busId===activeTrip.busId && s.isActive && !s.isSelfPickup)
                    .map(s => s.parentId)
                    .filter((id): id is string => id !== null)
            );
            parentIds.forEach(parentId => {
                notificationsToCreate.push({
                    userId: parentId,
                    title: '🚨 EMERGENCY ALERT',
                    body: `The driver for ${activeTrip.route.name} has triggered an emergency alert. Please contact the school immediately.`,
                    type: 'EMERGENCY'
                });
            });
        }

        // Notify all Admins
        const admins = await prisma.user.findMany({
            where: {
                OR: [
                    { role: 'SUPER_ADMIN' },
                    { role: { in: ['ADMIN', 'SCHOOL_ADMIN'] }, organizationId: organizationId || '__none__' },
                ],
            },
            select: { id: true, name: true }
        });

        admins.forEach(admin => {
            notificationsToCreate.push({
                userId: admin.id,
                title: '🚨 DRIVER EMERGENCY',
                body: `Emergency panic button triggered by ${dbUser?.name || 'a user'}${activeTrip ? ` on route ${activeTrip.route.name}` : ''}.`,
                type: 'EMERGENCY'
            });
        });

        if (notificationsToCreate.length > 0) {
            await prisma.notification.createMany({
                data: notificationsToCreate.map(n=>({...n,dedupeKey:`emergency:${alert.id}:${n.userId}`}))
            });
        }

        await Promise.allSettled((await prisma.notification.findMany({where:{dedupeKey:{startsWith:`emergency:${alert.id}:`}}})).map(pushNotification))
        return NextResponse.json({ success: true, alert })
    } catch (error) {
        console.error('Error creating emergency alert:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

export async function GET() {
    try {
        const user = await getUserFromSession()
        if (!user || !['ADMIN', 'SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }
        const organizationId = await resolveUserOrganizationId(user.id)

        // Only get active (unresolved) emergencies from the last 24 hours
        const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

        const activeAlerts = await prisma.emergencyAlert.findMany({
            where: {
                resolved: false,
                timestamp: {
                    gte: twentyFourHoursAgo
                },
                ...(user.role === 'SUPER_ADMIN' ? {} : { driver: { organizationId: organizationId || '__none__' } }),
            },
            include: {
                driver: {
                    select: {
                        name: true,
                        phone: true
                    }
                }
            },
            orderBy: { timestamp: 'desc' }
        })

        return NextResponse.json({ alerts: activeAlerts })
    } catch (error) {
        console.error('Error fetching emergency alerts:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
