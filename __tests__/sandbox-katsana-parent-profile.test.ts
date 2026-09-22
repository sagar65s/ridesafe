import fs from 'node:fs'
import path from 'node:path'

const root = path.join(process.cwd())
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8')

test('Sandbox can choose a school for isolated attendance and calendar import/reset', () => {
  const attendance = read('src/components/admin/AttendanceTab.tsx')
  const calendar = read('src/components/admin/AcademicCalendarTab.tsx')
  expect(attendance).toContain("currentRole === 'SUPER_ADMIN' || currentRole === 'SANDBOX'")
  expect(attendance).toContain("scope:'ATTENDANCE',organizationId")
  expect(calendar).toContain('currentRole === "SUPER_ADMIN" || currentRole === "SANDBOX"')
  expect(calendar).toContain('scope: "ACADEMIC_CALENDAR", organizationId: importOrganizationId')
})

test('Katsana is the only hardware GPS provider exposed by the source', () => {
  const tracking = read('src/lib/services/trackingService.ts')
  const fleet = read('src/components/admin/FleetTab.tsx')
  expect(tracking).toContain("source:    'KATSANA'")
  expect(tracking).not.toMatch(/wialon/i)
  expect(fleet).toContain('Katsana Vehicle ID')
  expect(fleet).not.toMatch(/wialon/i)
  expect(fs.existsSync(path.join(root, 'src/lib/wialon.ts'))).toBe(false)
  expect(fs.existsSync(path.join(root, 'src/app/api/tracking/wialon-status/route.ts'))).toBe(false)
})

test('Parent portal has a dedicated editable profile with photo support', () => {
  const parent = read('src/app/parent/page.tsx')
  const profile = read('src/components/transport/ParentProfile.tsx')
  expect(parent).toContain('{ id: "profile", label: "Profile"')
  expect(parent).toContain('<ParentProfile')
  expect(profile).toContain("fetch('/api/account/profile'")
  expect(profile).toContain('prepareProfilePhoto')
})

test('Super Admin settings no longer expose global transport defaults', () => {
  expect(read('src/components/admin/AccountSettingsTab.tsx')).not.toContain('Global transport defaults')
})
