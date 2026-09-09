import { NextRequest } from 'next/server'
import crypto from 'crypto'

jest.mock('@/lib/auth', () => ({ getUserFromSession: jest.fn() }))
jest.mock('@/lib/authorization', () => ({
  getCurrentUser: jest.fn(),
  canAccessOrganization: (u: { role: string; organizationId: string }, id: string) => u.role === 'SUPER_ADMIN' || u.organizationId === id,
}))
jest.mock('@/lib/audit', () => ({ writeAuditLog: jest.fn() }))
jest.mock('@/lib/prisma', () => ({ __esModule: true, default: {
  organization: { findUnique: jest.fn() }, route: { findUnique: jest.fn() }, user: { findUnique: jest.fn() },
  student: { create: jest.fn(), findUnique: jest.fn() }, trip: { findUnique: jest.fn(), update: jest.fn() },
  attendance: { findMany: jest.fn(), create: jest.fn() }, pendingRegistration: { findUnique: jest.fn() },
} }))
jest.mock('@/lib/services/registrationService', () => ({ registrationService: { fulfillRegistration: jest.fn() } }))
import prisma from '@/lib/prisma'
import { getUserFromSession } from '@/lib/auth'
import { getCurrentUser } from '@/lib/authorization'
import { POST as createStudent } from '@/app/api/admin/students/route'
import { POST as markAttendance } from '@/app/api/attendance/route'
import { PATCH as updateTrip } from '@/app/api/trips/[id]/route'
import { registrationService } from '@/lib/services/registrationService'

const request = (path: string, body: object, method = 'POST') => new NextRequest(`http://localhost${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const mock = (fn: unknown) => fn as jest.Mock
beforeEach(() => {
  jest.clearAllMocks()
  mock(getUserFromSession).mockResolvedValue({ id: 'admin', role: 'SCHOOL_ADMIN' })
  mock(getCurrentUser).mockResolvedValue({ id: 'admin', role: 'SCHOOL_ADMIN', organizationId: 'school-a' })
})
it('legacy student endpoint rejects a cross-school route without creating a student', async () => {
  mock(prisma.organization.findUnique).mockResolvedValue({ isActive: true })
  mock(prisma.route.findUnique).mockResolvedValue({ isActive: true, organizationId: 'school-b' })
  const res = await createStudent(request('/api/admin/students', { name: 'Student One', grade: '5', parentContact1: '0123456789', routeId: 'route-b' }))
  expect(res.status).toBe(400)
  expect(prisma.student.create).not.toHaveBeenCalled()
})
it('legacy student endpoint rejects a cross-school parent', async () => {
  mock(prisma.organization.findUnique).mockResolvedValue({ isActive: true })
  mock(prisma.user.findUnique).mockResolvedValue({ role: 'PARENT', isActive: true, organizationId: 'school-b' })
  const res = await createStudent(request('/api/admin/students', { name: 'Student One', grade: '5', parentContact1: '0123456789', parentId: 'parent-b' }))
  expect(res.status).toBe(400)
  expect(prisma.student.create).not.toHaveBeenCalled()
})
it('a completed trip cannot be reopened', async () => {
  mock(getUserFromSession).mockResolvedValue({ id: 'driver', role: 'DRIVER' })
  mock(prisma.trip.findUnique).mockResolvedValue({ id: 'trip', driverId: 'driver', status: 'TRIP_COMPLETED' })
  const res = await updateTrip(request('/api/trips/trip', { status: 'BUS_EN_ROUTE' }, 'PATCH'), { params: Promise.resolve({ id: 'trip' }) })
  expect(res.status).toBe(409)
  expect(prisma.trip.update).not.toHaveBeenCalled()
})
it('driver cannot mark attendance on a completed trip', async () => {
  mock(getUserFromSession).mockResolvedValue({ id: 'driver', role: 'DRIVER' })
  mock(prisma.trip.findUnique).mockResolvedValue({ id: 'trip', driverId: 'driver', routeId: 'r', status: 'TRIP_COMPLETED', route: { organizationId: 'school-a' } })
  mock(prisma.student.findUnique).mockResolvedValue({ id: 's', isActive: true, routeId: 'r' })
  const res = await markAttendance(request('/api/attendance', { tripId: 'trip', studentId: 's', action: 'PICKED_UP' }))
  expect(res.status).toBe(409)
  expect(prisma.attendance.create).not.toHaveBeenCalled()
})
it('accepts a signed flat Billplz callback and rejects tampering', async () => {
  process.env.BILLPLZ_API_KEY = 'test-api-key'
  process.env.BILLPLZ_COLLECTION_ID = 'collection'
  process.env.BILLPLZ_X_SIGNATURE_KEY = 'callback-test-secret'
  const { POST } = await import('@/app/api/public/billplz/callback/route')
  const fields = { id: 'bill', collection_id: 'collection', paid: 'true', amount: '5000', paid_amount: '5000' }
  const source = Object.entries(fields).map(([k, v]) => k + v).sort((a,b) => a.toLowerCase() < b.toLowerCase() ? -1 : 1).join('|')
  const signature = crypto.createHmac('sha256', 'callback-test-secret').update(source).digest('hex')
  mock(prisma.pendingRegistration.findUnique).mockResolvedValue({ id: 'registration', amount: 50, status: 'PENDING' })
  const callback = (amount: string) => new NextRequest('http://localhost/api/public/billplz/callback', { method: 'POST', body: new URLSearchParams({ ...fields, amount, x_signature: signature }) })
  expect((await POST(callback('5000'))).status).toBe(200)
  expect(registrationService.fulfillRegistration).toHaveBeenCalledWith('registration')
  mock(registrationService.fulfillRegistration).mockClear()
  expect((await POST(callback('1'))).status).toBe(400)
  expect(registrationService.fulfillRegistration).not.toHaveBeenCalled()
  delete process.env.BILLPLZ_API_KEY
  delete process.env.BILLPLZ_COLLECTION_ID
  delete process.env.BILLPLZ_X_SIGNATURE_KEY
})
