import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { getUserFromSession } from '@/lib/auth'
import bcrypt from 'bcryptjs'
import { canAccessOrganization, getCurrentUser } from '@/lib/authorization'
import { canCreateRole, isUserRole } from '@/lib/roles'
import { crewWhere } from '@/lib/transport'
import { writeAuditLog } from '@/lib/audit'

export const dynamic = 'force-dynamic'

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getUserFromSession()
    if (!auth || !['SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(auth.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const existing = await prisma.user.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    const actor = await getCurrentUser()
    if (!actor || !canAccessOrganization(actor, existing.organizationId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (auth.role !== 'SUPER_ADMIN' && ['SUPER_ADMIN', 'SCHOOL_ADMIN'].includes(existing.role)) {
      return NextResponse.json({ error: 'Only a Super Admin can manage School Admin accounts' }, { status: 403 })
    }

    const {
      name, email, phone, role, organizationId, password, isActive,
      personnelType, licenseNumber, licenseExpiry, onboardingDate,
      offboardingDate, offboardingReason, employmentStatus,
    } = await req.json()
    const updates: Record<string, unknown> = {}

    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
        return NextResponse.json({ error: 'Name must be between 2 and 100 characters' }, { status: 400 })
      }
      updates.name = name.trim()
    }

    if (email !== undefined) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json({ error: 'Invalid email address' }, { status: 400 })
      }
      const normalized = email.toLowerCase().trim()
      if (normalized !== existing.email) {
        const dupe = await prisma.user.findUnique({ where: { email: normalized } })
        if (dupe) {
          return NextResponse.json({ error: 'Email already in use' }, { status: 400 })
        }
      }
      updates.email = normalized
    }

    if (phone !== undefined) {
      if (phone && !/^[+0-9\s()\-]{7,20}$/.test(phone)) {
        return NextResponse.json({ error: 'Invalid phone number format' }, { status: 400 })
      }
      updates.phone = phone?.trim() || null
    }

    if (role !== undefined) {
      if (!isUserRole(role)) {
        return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
      }
      if (!canCreateRole(auth.role, role)) {
        return NextResponse.json({ error: 'You cannot assign this role' }, { status: 403 })
      }
      updates.role = role
    }

    if (organizationId !== undefined) {
      if (actor.role !== 'SUPER_ADMIN' && organizationId !== actor.organizationId) return NextResponse.json({ error: 'Cannot move users to another organization' }, { status: 403 })
      if (organizationId) {
        const org = await prisma.organization.findUnique({ where: { id: organizationId } })
        if (!org) {
          return NextResponse.json({ error: 'Organisation not found' }, { status: 400 })
        }
        updates.organizationId = organizationId
      } else {
        updates.organizationId = null
      }
    }

    if (password) {
      if (password.length < 12) {
        return NextResponse.json({ error: 'Password must be at least 12 characters' }, { status: 400 })
      }
      updates.password = await bcrypt.hash(password, 12)
    }

    if (isActive !== undefined) updates.isActive = Boolean(isActive)
    if (personnelType !== undefined) {
      if (personnelType && !['DRIVER', 'MAINTAINER'].includes(personnelType)) return NextResponse.json({ error: 'Invalid personnel type' }, { status: 400 })
      updates.personnelType = personnelType || null
    }
    if (licenseNumber !== undefined) updates.licenseNumber = licenseNumber?.trim() || null
    for (const [field,value] of [['licenseExpiry',licenseExpiry],['onboardingDate',onboardingDate],['offboardingDate',offboardingDate]] as const) {
      if (value !== undefined) {
        const parsed = value ? new Date(value) : null
        if (parsed && Number.isNaN(parsed.getTime())) return NextResponse.json({ error:`Invalid ${field}` }, { status:400 })
        updates[field] = parsed
      }
    }
    if (offboardingReason !== undefined) updates.offboardingReason = offboardingReason?.trim() || null
    if (employmentStatus !== undefined) {
      const valid = ['ACTIVE', 'INACTIVE', 'ONBOARDING', 'OFFBOARDING', 'OFFBOARDED']
      if (!valid.includes(employmentStatus)) return NextResponse.json({ error: 'Invalid employment status' }, { status: 400 })
      updates.employmentStatus = employmentStatus
      if (employmentStatus === 'OFFBOARDED') updates.isActive = false
    }

    const targetRole = role ?? existing.role
    const targetOrganizationId = organizationId !== undefined ? (organizationId || null) : existing.organizationId
    if (targetRole !== 'SUPER_ADMIN' && !targetOrganizationId) return NextResponse.json({ error:'A school assignment is required for this role' }, { status:400 })
    if (targetRole === 'SUPER_ADMIN') updates.organizationId = null

    if (id === auth.id && (isActive === false || employmentStatus === 'OFFBOARDED' || (role !== undefined && role !== existing.role))) return NextResponse.json({ error: 'You cannot deactivate or change your own role' }, { status: 400 })
    if (targetRole !== existing.role || targetOrganizationId !== existing.organizationId || personnelType !== undefined && personnelType !== existing.personnelType) {
      const [buses, children, activeTrips] = await Promise.all([
        prisma.bus.count({ where: { ...crewWhere(id) } }),
        prisma.student.count({ where: { parentId: id } }),
        prisma.trip.count({ where: { ...crewWhere(id), status: { notIn: ['TRIP_COMPLETED', 'CANCELLED'] } } }),
      ])
      if (buses || children || activeTrips) return NextResponse.json({ error: 'Reassign linked buses, students and active trips before changing the school or role' }, { status: 409 })
    }

    const shouldOffboard = existing.role === 'DRIVER' && (employmentStatus === 'OFFBOARDED' || isActive === false)
    if (shouldOffboard && await prisma.trip.count({ where: { ...crewWhere(id), status: { notIn: ['TRIP_COMPLETED', 'CANCELLED'] } } })) return NextResponse.json({ error: 'Complete or cancel active trips before offboarding this driver' }, { status: 409 })
    const user = await prisma.$transaction(async tx => {
      if (shouldOffboard) {
        const assignedBuses = await tx.bus.findMany({ where: { ...crewWhere(id) }, select: { id: true, routeId: true } })
        for (const bus of assignedBuses) {
          await tx.driverAssignmentHistory.create({ data: { driverId: id, busId: bus.id, routeId: bus.routeId, action: 'OFFBOARDED', reason: offboardingReason?.trim() || 'Account deactivated' } })
        }
        await tx.bus.updateMany({ where: { driverId: id }, data: { driverId: null } })
        await tx.bus.updateMany({ where: { maintainerId: id }, data: { maintainerId: null } })
      }
      return tx.user.update({
        where: { id }, data: updates,
        select: {
          id: true, name: true, email: true, role: true, phone: true, organizationId: true,
          isActive: true, personnelType: true, licenseNumber: true, licenseExpiry: true,
          onboardingDate: true, offboardingDate: true, offboardingReason: true, employmentStatus: true,
        },
      })
    })
    await writeAuditLog({ actorId: auth.id, organizationId: user.organizationId, action: shouldOffboard ? 'OFFBOARD' : 'UPDATE', entityType: 'USER', entityId: user.id, details: { role: user.role, isActive: user.isActive, employmentStatus: user.employmentStatus } })

    return NextResponse.json({ user })
  } catch (error) {
    console.error('User update error:', error)
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await getUserFromSession()
    if (!auth || !['SCHOOL_ADMIN', 'SUPER_ADMIN'].includes(auth.role)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    if (id === auth.id) {
      return NextResponse.json({ error: 'You cannot deactivate your own account' }, { status: 400 })
    }

    const existing = await prisma.user.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    const actor = await getCurrentUser()
    if (!actor || !canAccessOrganization(actor, existing.organizationId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    if (auth.role !== 'SUPER_ADMIN' && ['SUPER_ADMIN', 'SCHOOL_ADMIN'].includes(existing.role)) {
      return NextResponse.json({ error: 'Only a Super Admin can deactivate this account' }, { status: 403 })
    }

    if (existing.role === 'DRIVER' && await prisma.trip.count({ where: { ...crewWhere(id), status: { notIn: ['TRIP_COMPLETED', 'CANCELLED'] } } })) return NextResponse.json({ error: 'Complete or cancel active trips before offboarding this driver' }, { status: 409 })

    await prisma.$transaction(async tx => {
      if (existing.role === 'DRIVER') {
        const assignedBuses = await tx.bus.findMany({ where: { ...crewWhere(id) }, select: { id: true, routeId: true } })
        for (const bus of assignedBuses) {
          await tx.driverAssignmentHistory.create({ data: { driverId: id, busId: bus.id, routeId: bus.routeId, action: 'OFFBOARDED', reason: 'Account deactivated' } })
        }
        await tx.bus.updateMany({ where: { driverId: id }, data: { driverId: null } })
        await tx.bus.updateMany({ where: { maintainerId: id }, data: { maintainerId: null } })
      }
      await tx.user.update({ where: { id }, data: { isActive: false, ...(existing.role === 'DRIVER' ? { employmentStatus: 'OFFBOARDED', offboardingDate: new Date() } : {}) } })
    })
    await writeAuditLog({ actorId: auth.id, organizationId: existing.organizationId, action: 'DEACTIVATE', entityType: 'USER', entityId: id, details: { role: existing.role } })
    return NextResponse.json({ success: true, deactivated: true })
  } catch (error: unknown) {
    console.error('User delete error:', error)
    return NextResponse.json({ error: 'Failed to deactivate user' }, { status: 500 })
  }
}
