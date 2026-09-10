import { ADMIN_TAB_ACCESS, USER_ROLES, canAccessAdminTab, canCreateRole, isUserRole } from '@/lib/roles'

describe('five-role access control', () => {
  test('accepts exactly the five supported account roles', () => {
    expect(USER_ROLES).toEqual(['SUPER_ADMIN', 'SCHOOL_ADMIN', 'ADMIN', 'DRIVER', 'PARENT'])
    for (const role of USER_ROLES) expect(isUserRole(role)).toBe(true)
    for (const role of ['STUDENT', 'TEACHER', 'MAINTAINER', 'GUEST', '', null]) expect(isUserRole(role)).toBe(false)
  })

  test('only the super admin can create another school or super admin', () => {
    expect(canCreateRole('SUPER_ADMIN', 'SCHOOL_ADMIN')).toBe(true)
    expect(canCreateRole('SUPER_ADMIN', 'SUPER_ADMIN')).toBe(true)
    expect(canCreateRole('SCHOOL_ADMIN', 'SCHOOL_ADMIN')).toBe(false)
    expect(canCreateRole('SCHOOL_ADMIN', 'ADMIN')).toBe(true)
    expect(canCreateRole('ADMIN', 'SCHOOL_ADMIN')).toBe(false)
  })

  test('transport coordinator has daily operations but no platform management', () => {
    expect(canAccessAdminTab('ADMIN', 'LIVETRIPS')).toBe(true)
    expect(canAccessAdminTab('ADMIN', 'STUDENTS')).toBe(false)
    expect(canAccessAdminTab('ADMIN', 'ORGANIZATIONS')).toBe(false)
    expect(canAccessAdminTab('ADMIN', 'USERS')).toBe(false)
    expect(canAccessAdminTab('ADMIN', 'SETTINGS')).toBe(false)
  })

  test('super admin platform modules remain reachable', () => {
    for (const tab of ['ORGANIZATIONS', 'SUPERUSERS', 'CALENDAR', 'AUDIT', 'SETTINGS']) {
      expect(ADMIN_TAB_ACCESS.SUPER_ADMIN).toContain(tab)
    }
  })
})
