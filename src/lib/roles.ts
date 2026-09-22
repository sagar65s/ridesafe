export const USER_ROLES = ['SANDBOX', 'SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN', 'DRIVER', 'PARENT'] as const

export type UserRole = (typeof USER_ROLES)[number]

export const ADMIN_ROLES: readonly UserRole[] = ['SANDBOX', 'SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN']

export const ROLE_LABELS: Record<UserRole, string> = {
  SANDBOX: 'Sandbox Account',
  SUPER_ADMIN: 'Super Admin',
  SCHOOL_ADMIN: 'School Admin',
  ADMIN: 'Admin / Transport Coordinator',
  DRIVER: 'Driver / Maintainer',
  PARENT: 'Parent',
}

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && USER_ROLES.includes(value as UserRole)
}

export function isManagementRole(value: string): value is 'SANDBOX' | 'SUPER_ADMIN' | 'SCHOOL_ADMIN' | 'ADMIN' {
  return ADMIN_ROLES.includes(value as UserRole)
}

export function toStoredRole(role: UserRole): Exclude<UserRole, 'SANDBOX'> {
  return role === 'SANDBOX' ? 'SUPER_ADMIN' : role
}

export function toEffectiveRole(role: string, accessProfile?: string | null): UserRole | string {
  return accessProfile === 'SANDBOX' && role === 'SUPER_ADMIN' ? 'SANDBOX' : role
}

export function canCreateRole(actorRole: string, targetRole: UserRole): boolean {
  if (actorRole === 'SUPER_ADMIN') return true
  if (actorRole === 'SANDBOX') return ['SCHOOL_ADMIN', 'ADMIN', 'DRIVER', 'PARENT'].includes(targetRole)
  if (actorRole === 'SCHOOL_ADMIN') return ['ADMIN', 'DRIVER', 'PARENT'].includes(targetRole)
  return false
}

export const ADMIN_TAB_ACCESS: Record<'SANDBOX' | 'SUPER_ADMIN' | 'SCHOOL_ADMIN' | 'ADMIN', readonly string[]> = {
  SANDBOX: ['USERS', 'ORGANIZATIONS', 'SUPERUSERS', 'OVERVIEW', 'FLEET', 'STUDENTS', 'ATTENDANCE', 'LIVETRIPS', 'HISTORY', 'MAINTENANCE', 'ANNOUNCEMENTS', 'ANALYTICS', 'MESSAGES', 'NOTIFICATIONS', 'CALENDAR', 'ISSUES', 'AUDIT'],
  SUPER_ADMIN: ['SUPERUSERS', 'ORGANIZATIONS', 'OVERVIEW', 'AUDIT', 'ANNOUNCEMENTS', 'MESSAGES', 'NOTIFICATIONS', 'SETTINGS'],
  SCHOOL_ADMIN: ['OVERVIEW', 'FLEET', 'STUDENTS', 'ATTENDANCE', 'LIVETRIPS', 'HISTORY', 'USERS', 'MAINTENANCE', 'ANNOUNCEMENTS', 'ANALYTICS', 'MESSAGES', 'NOTIFICATIONS', 'CALENDAR', 'AUDIT', 'ISSUES'],
  ADMIN: ['OVERVIEW', 'FLEET', 'STUDENTS', 'ATTENDANCE', 'LIVETRIPS', 'HISTORY', 'ANNOUNCEMENTS', 'MESSAGES', 'NOTIFICATIONS', 'ISSUES'],
}

export function canAccessAdminTab(role: string, tab: string): boolean {
  if (!(role in ADMIN_TAB_ACCESS)) return false
  return ADMIN_TAB_ACCESS[role as keyof typeof ADMIN_TAB_ACCESS].includes(tab)
}
