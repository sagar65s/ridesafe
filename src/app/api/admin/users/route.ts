import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getUserFromSession } from '@/lib/auth'
import bcrypt from 'bcryptjs'
import { canCreateRole, isUserRole } from '@/lib/roles'
import { writeAuditLog } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    try {
        const auth = await getUserFromSession()
        if (!auth || !['ADMIN', 'SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(auth.role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const actor = await prisma.user.findUnique({ where: { id: auth.id }, select: { organizationId: true } })
        const users = await prisma.user.findMany({
            where: auth.role === 'SUPER_ADMIN' ? {} : { organizationId: actor?.organizationId || '__none__' },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                phone: true,
                organizationId: true,
                createdAt: true,
                isActive: true,
                personnelType: true,
                licenseNumber: true,
                licenseExpiry: true,
                onboardingDate: true,
                offboardingDate: true,
                offboardingReason: true,
                employmentStatus: true,
                buses: { select: { id: true, plateNumber: true } },
                assignmentHistory: { orderBy: { effectiveAt:'desc' }, take:5, select:{ id:true,action:true,reason:true,effectiveAt:true,bus:{select:{plateNumber:true}},route:{select:{name:true}} } }
            },
            orderBy: { createdAt: 'desc' }
        })

        return NextResponse.json({ users })
    } catch (error) {
        console.error('User list error:', error)
        return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        const auth = await getUserFromSession()
        if (!auth || !['SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(auth.role)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const {
            name, email, password, role, phone, organizationId, isActive,
            personnelType, licenseNumber, licenseExpiry, onboardingDate, employmentStatus,
        } = await request.json()

        // Validate name
        if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
            return NextResponse.json({ error: 'Name must be between 2 and 100 characters' }, { status: 400 })
        }
        // Validate email
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
        }
        // Validate password
        if (!password || password.length < 12) {
            return NextResponse.json({ error: 'Password must be at least 12 characters' }, { status: 400 })
        }
        // Validate role
        if (!isUserRole(role)) {
            return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
        }
        if (!canCreateRole(auth.role, role)) {
            return NextResponse.json({ error: 'You cannot create this role' }, { status: 403 })
        }
        // Validate phone — only digits, +, spaces, hyphens, parentheses
        if (phone && !/^[+0-9\s()\-]{7,20}$/.test(phone)) {
            return NextResponse.json({ error: 'Invalid phone number format' }, { status: 400 })
        }

        const exists = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } })
        if (exists) {
            return NextResponse.json({ error: 'Email already in use' }, { status: 400 })
        }

        // Validate organizationId if provided
        const actor = await prisma.user.findUnique({ where: { id: auth.id }, select: { organizationId: true } })
        let resolvedOrgId: string | null = auth.role === 'SUPER_ADMIN' ? null : actor?.organizationId || null
        if (organizationId) {
            if (auth.role !== 'SUPER_ADMIN' && organizationId !== actor?.organizationId) {
                return NextResponse.json({ error: 'Cannot assign users to another organization' }, { status: 403 })
            }
            const org = await prisma.organization.findUnique({ where: { id: organizationId }, select:{ isActive:true } })
            if (!org?.isActive) {
                return NextResponse.json({ error: 'Organisation not found or inactive' }, { status: 400 })
            }
            resolvedOrgId = organizationId
        }

        if (role !== 'SUPER_ADMIN' && !resolvedOrgId) {
            return NextResponse.json({ error: 'A school assignment is required for this role' }, { status: 400 })
        }
        if (role === 'SUPER_ADMIN') resolvedOrgId = null
        if (role === 'DRIVER' && personnelType && !['DRIVER', 'MAINTAINER'].includes(personnelType)) {
            return NextResponse.json({ error: 'Invalid personnel type' }, { status: 400 })
        }
        if (role === 'DRIVER' && employmentStatus && !['ACTIVE','INACTIVE','ONBOARDING','OFFBOARDING','OFFBOARDED'].includes(employmentStatus)) return NextResponse.json({ error:'Invalid employment status' }, { status:400 })
        for (const [field,value] of [['licenseExpiry',licenseExpiry],['onboardingDate',onboardingDate]] as const) {
            if (value && Number.isNaN(new Date(value).getTime())) return NextResponse.json({ error:`Invalid ${field}` }, { status:400 })
        }

        const passwordHash = await bcrypt.hash(password, 12)

        const user = await prisma.user.create({
            data: {
                name: name.trim(),
                email: email.toLowerCase().trim(),
                password: passwordHash,
                role,
                phone: phone?.trim() || null,
                organizationId: resolvedOrgId,
                isActive: isActive !== false,
                personnelType: role === 'DRIVER' ? (personnelType || 'DRIVER') : null,
                licenseNumber: role === 'DRIVER' ? licenseNumber?.trim() || null : null,
                licenseExpiry: role === 'DRIVER' && licenseExpiry ? new Date(licenseExpiry) : null,
                onboardingDate: role === 'DRIVER' && onboardingDate ? new Date(onboardingDate) : null,
                employmentStatus: role === 'DRIVER' ? (employmentStatus || 'ACTIVE') : null,
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                phone: true,
                organizationId: true,
                isActive: true, personnelType: true, licenseNumber: true, licenseExpiry: true,
                onboardingDate: true, offboardingDate: true, offboardingReason: true, employmentStatus: true,
            }
        })

        if (role === 'DRIVER') {
            await prisma.driverAssignmentHistory.create({ data: { driverId: user.id, action: 'ONBOARDED', effectiveAt: user.onboardingDate || new Date() } })
        }
        await writeAuditLog({ actorId: auth.id, organizationId: user.organizationId, action: 'CREATE', entityType: 'USER', entityId: user.id, details: { role: user.role, email: user.email } })

        return NextResponse.json({ user })
    } catch (error) {
        console.error('User create error:', error)
        return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
    }
}
