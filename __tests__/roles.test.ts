import { ADMIN_TAB_ACCESS, USER_ROLES, canAccessAdminTab, canCreateRole, isUserRole } from '@/lib/roles'

describe('six-role access control', () => {
  test('accepts exactly the six supported account roles', () => {
    expect(USER_ROLES).toEqual(['SANDBOX', 'SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN', 'DRIVER', 'PARENT'])
    for (const role of USER_ROLES) expect(isUserRole(role)).toBe(true)
    for (const role of ['STUDENT', 'TEACHER', 'MAINTAINER', 'GUEST', '', null]) expect(isUserRole(role)).toBe(false)
  })

  test('global account creation is restricted by the actor profile', () => {
    expect(canCreateRole('SUPER_ADMIN', 'SCHOOL_ADMIN')).toBe(true)
    expect(canCreateRole('SUPER_ADMIN', 'SUPER_ADMIN')).toBe(true)
    expect(canCreateRole('SUPER_ADMIN', 'SANDBOX')).toBe(true)
    expect(canCreateRole('SANDBOX', 'SCHOOL_ADMIN')).toBe(true)
    expect(canCreateRole('SANDBOX', 'ADMIN')).toBe(true)
    expect(canCreateRole('SANDBOX', 'DRIVER')).toBe(true)
    expect(canCreateRole('SANDBOX', 'PARENT')).toBe(true)
    expect(canCreateRole('SANDBOX', 'SUPER_ADMIN')).toBe(false)
    expect(canCreateRole('SANDBOX', 'SANDBOX')).toBe(false)
    expect(canCreateRole('SCHOOL_ADMIN', 'SCHOOL_ADMIN')).toBe(false)
    expect(canCreateRole('SCHOOL_ADMIN', 'ADMIN')).toBe(true)
    expect(canCreateRole('ADMIN', 'SCHOOL_ADMIN')).toBe(false)
  })

  test('transport coordinator has daily operations but no platform management', () => {
    expect(canAccessAdminTab('ADMIN', 'LIVETRIPS')).toBe(true)
    expect(canAccessAdminTab('ADMIN', 'FLEET')).toBe(true)
    expect(canAccessAdminTab('ADMIN', 'STUDENTS')).toBe(true)
    expect(canAccessAdminTab('ADMIN', 'ORGANIZATIONS')).toBe(false)
    expect(canAccessAdminTab('ADMIN', 'USERS')).toBe(false)
    expect(canAccessAdminTab('ADMIN', 'SETTINGS')).toBe(false)
  })

  test('super admin is limited to platform governance modules', () => {
    for (const tab of ['OVERVIEW','ORGANIZATIONS', 'SUPERUSERS', 'AUDIT', 'ANNOUNCEMENTS', 'MESSAGES', 'NOTIFICATIONS', 'SETTINGS']) {
      expect(ADMIN_TAB_ACCESS.SUPER_ADMIN).toContain(tab)
    }
    for (const tab of ['CALENDAR','USERS','FLEET','STUDENTS','ATTENDANCE','LIVETRIPS']) expect(ADMIN_TAB_ACCESS.SUPER_ADMIN).not.toContain(tab)
  })

  test('sandbox preserves the former global operational access', () => {
    for (const tab of ['ORGANIZATIONS','SUPERUSERS','CALENDAR','AUDIT','USERS','FLEET','STUDENTS','ATTENDANCE','LIVETRIPS']) expect(ADMIN_TAB_ACCESS.SANDBOX).toContain(tab)
    expect(ADMIN_TAB_ACCESS.SANDBOX).not.toContain('SETTINGS')
  })
})
