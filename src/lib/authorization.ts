import prisma from '@/lib/prisma'
import { getUserFromSession } from '@/lib/auth'
import { ADMIN_ROLES, isManagementRole } from '@/lib/roles'

export { ADMIN_ROLES }

export async function getCurrentUser() {
  const session = await getUserFromSession()
  if (!session) return null
  return prisma.user.findUnique({
    where: { id: session.id },
    select: { id: true, role: true, organizationId: true },
  })
}

export function isAdmin(role: string): boolean {
  return isManagementRole(role)
}

export function canAccessOrganization(
  user: { role: string; organizationId: string | null },
  organizationId: string | null | undefined,
): boolean {
  return user.role === 'SUPER_ADMIN' || (!!user.organizationId && user.organizationId === organizationId)
}

export async function resolveUserOrganizationId(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { organizationId: true } })
  if (user?.organizationId) return user.organizationId
  const student = await prisma.student.findFirst({
    where: { parentId: userId },
    select: { organizationId: true, route: { select: { organizationId: true } } },
  })
  return student?.organizationId || student?.route?.organizationId || null
}
