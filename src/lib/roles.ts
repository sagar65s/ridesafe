export const USER_ROLES = ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN', 'DRIVER', 'PARENT'] as const

export type UserRole = (typeof USER_ROLES)[number]

export const ADMIN_ROLES: readonly UserRole[] = ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN']

export const ROLE_LABELS: Record<UserRole, string> = {
  SUPER_ADMIN: 'Super Admin',
  SCHOOL_ADMIN: 'School Admin',
  ADMIN: 'Admin / Transport Coordinator',
  DRIVER: 'Driver / Maintainer',
  PARENT: 'Parent',
}

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && USER_ROLES.includes(value as UserRole)
}

export function isManagementRole(value: string): value is 'SUPER_ADMIN' | 'SCHOOL_ADMIN' | 'ADMIN' {
  return ADMIN_ROLES.includes(value as UserRole)
}

export function canCreateRole(actorRole: string, targetRole: UserRole): boolean {
  if (actorRole === 'SUPER_ADMIN') return true
  if (actorRole === 'SCHOOL_ADMIN') return ['ADMIN', 'DRIVER', 'PARENT'].includes(targetRole)
  return false
}

export const ADMIN_TAB_ACCESS: Record<'SUPER_ADMIN' | 'SCHOOL_ADMIN' | 'ADMIN', readonly string[]> = {
  SUPER_ADMIN: ['ORGANIZATIONS', 'SUPERUSERS', 'OVERVIEW', 'FLEET', 'STUDENTS', 'ATTENDANCE', 'LIVETRIPS', 'HISTORY', 'MAINTENANCE', 'LOSTFOUND', 'ANNOUNCEMENTS', 'ANALYTICS', 'MESSAGES', 'CALENDAR', 'ISSUES', 'AUDIT', 'SETTINGS'],
  SCHOOL_ADMIN: ['OVERVIEW', 'FLEET', 'STUDENTS', 'ATTENDANCE', 'LIVETRIPS', 'HISTORY', 'USERS', 'MAINTENANCE', 'LOSTFOUND', 'ANNOUNCEMENTS', 'ANALYTICS', 'MESSAGES', 'CALENDAR', 'SETTINGS', 'AUDIT', 'ISSUES'],
  ADMIN: ['OVERVIEW', 'ATTENDANCE', 'LIVETRIPS', 'HISTORY', 'ANNOUNCEMENTS', 'MESSAGES', 'ISSUES'],
}

export function canAccessAdminTab(role: string, tab: string): boolean {
  if (!(role in ADMIN_TAB_ACCESS)) return false
  return ADMIN_TAB_ACCESS[role as keyof typeof ADMIN_TAB_ACCESS].includes(tab)
}
