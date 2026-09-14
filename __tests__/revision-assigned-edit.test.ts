import { NextRequest } from 'next/server'

jest.mock('@/lib/auth', () => ({ getUserFromSession: jest.fn() }))
jest.mock('@/lib/authorization', () => ({
  getCurrentUser: jest.fn(),
  canAccessOrganization: (actor: { role:string; organizationId:string|null }, organizationId:string|null) => actor.role === 'SUPER_ADMIN' || actor.organizationId === organizationId,
}))
jest.mock('@/lib/audit', () => ({ writeAuditLog: jest.fn() }))
jest.mock('@/lib/prisma', () => ({ __esModule:true, default:{
  $transaction:jest.fn(),
  user:{findUnique:jest.fn(),update:jest.fn()},
  organization:{findUnique:jest.fn()},
  bus:{count:jest.fn(),findMany:jest.fn(),updateMany:jest.fn()},
  student:{count:jest.fn()},
  trip:{count:jest.fn()},
  driverAssignmentHistory:{create:jest.fn()},
} }))

import prisma from '@/lib/prisma'
import { getUserFromSession } from '@/lib/auth'
import { getCurrentUser } from '@/lib/authorization'
import { PATCH as updateUser } from '@/app/api/admin/users/[id]/route'

const mock=(value:unknown)=>value as jest.Mock
const request=(body:object)=>new NextRequest('http://localhost/api/admin/users/parent',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify(body)})

beforeEach(()=>{
  jest.resetAllMocks()
  mock(getUserFromSession).mockResolvedValue({id:'school-admin',role:'SCHOOL_ADMIN'})
  mock(getCurrentUser).mockResolvedValue({id:'school-admin',role:'SCHOOL_ADMIN',organizationId:'school-a'})
  mock(prisma.user.findUnique).mockResolvedValue({id:'parent',name:'Old Name',email:'parent@example.com',phone:null,role:'PARENT',organizationId:'school-a',isActive:true,personnelType:null,employmentStatus:null})
  mock(prisma.organization.findUnique).mockResolvedValue({id:'school-a',isActive:true})
  mock(prisma.$transaction).mockImplementation((fn)=>fn(prisma))
  mock(prisma.user.update).mockImplementation(({data})=>Promise.resolve({id:'parent',name:data.name,email:'parent@example.com',phone:null,role:'PARENT',organizationId:'school-a',isActive:true,personnelType:null,licenseNumber:null,licenseExpiry:null,onboardingDate:null,offboardingDate:null,offboardingReason:null,employmentStatus:null}))
})

test('an assigned parent profile can be edited without false driver reassignment checks',async()=>{
  const response=await updateUser(request({name:'Updated Parent',role:'PARENT',organizationId:'school-a',personnelType:'DRIVER'}),{params:Promise.resolve({id:'parent'})})
  expect(response.status).toBe(200)
  expect(prisma.bus.count).not.toHaveBeenCalled()
  expect(prisma.student.count).not.toHaveBeenCalled()
  expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.not.objectContaining({personnelType:expect.anything()})}))
})
