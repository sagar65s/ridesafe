import { NextResponse, NextRequest } from 'next/server'
import prisma from '@/lib/prisma'
import { getUserFromSession } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
    try {
        const user = await getUserFromSession()
        if (!user || user.role !== 'DRIVER') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const activeTrip = await prisma.trip.findFirst({
            where: { driverId: user.id, status: { notIn: ['TRIP_COMPLETED', 'CANCELLED'] } },
            include: {
                route: {
                    include: {
                        students: {
                            where: { isSelfPickup: false, isActive: true },
                            select: { id: true, name: true, grade: true, photoUrl: true, isSelfPickup: true, pickupStopId: true, dropoffStopId: true, busId: true }
                        },
                        stops: {
                            orderBy: { order: 'asc' },
                            include: {
                                pickupStudents: { select: { id: true, name: true, grade: true, photoUrl: true, isSelfPickup: true } },
                                dropoffStudents: { select: { id: true, name: true, grade: true, photoUrl: true, isSelfPickup: true } },
                                attendances: { where: { trip: { status: { notIn: ['TRIP_COMPLETED', 'CANCELLED'] } } } }
                            }
                        }
                    }
                }
            }
        })

        const bus = await prisma.bus.findFirst({
            where: { driverId: user.id, status: 'ACTIVE' },
            include: {
                route: {
                    include: {
                        stops: {
                            orderBy: { order: 'asc' }
                        },
                        students: { where: { isActive: true }, select: { id: true } }
                    }
                }
            }
        })

        // Auto-generate a qrToken for the bus if one doesn't exist yet
        let busQrToken = bus?.qrToken || null
        if (bus && !busQrToken) {
            busQrToken = 'QR-' + Math.random().toString(36).substring(2, 12).toUpperCase()
            await prisma.bus.update({ where: { id: bus.id }, data: { qrToken: busQrToken } })
        }

        if (activeTrip) {
            activeTrip.route.students = activeTrip.route.students.filter(student => !student.busId || student.busId === activeTrip.busId)
            const allowedStudentIds = new Set(activeTrip.route.students.map(student => student.id))
            for (const stop of activeTrip.route.stops) {
                stop.pickupStudents = stop.pickupStudents.filter(student => allowedStudentIds.has(student.id))
                stop.dropoffStudents = stop.dropoffStudents.filter(student => allowedStudentIds.has(student.id))
                stop.attendances = stop.attendances.filter(attendance => allowedStudentIds.has(attendance.studentId) && attendance.tripId === activeTrip.id)
            }
        }

        // Backward compatibility for existing data that only has routeId:
        // show those students at the first pickup and last drop-off until an
        // admin saves explicit stops in the student editor.
        if (activeTrip?.route.stops.length) {
            const firstStop = activeTrip.route.stops[0]
            const lastStop = activeTrip.route.stops[activeTrip.route.stops.length - 1]
            for (const student of activeTrip.route.students) {
                const summary = { id:student.id, name:student.name, grade:student.grade, photoUrl:student.photoUrl, isSelfPickup:student.isSelfPickup }
                if (!student.pickupStopId && !firstStop.pickupStudents.some(s => s.id === student.id)) firstStop.pickupStudents.push(summary)
                if (!student.dropoffStopId && !lastStop.dropoffStudents.some(s => s.id === student.id)) lastStop.dropoffStudents.push(summary)
            }
        }

        return NextResponse.json({
            activeTrip,
            assignedRoute: bus?.route || null,
            busId: bus?.id || null,
            busPlate: bus?.plateNumber || null,
            busQrToken,
            driverId: user.id,
        })
    } catch (error) {
        console.error('Driver Status GET Error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
