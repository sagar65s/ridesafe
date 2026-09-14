import { NextRequest } from 'next/server'

jest.mock('@/lib/auth',()=>({getUserFromSession:jest.fn()}))
jest.mock('@/lib/authorization',()=>({
  getCurrentUser:jest.fn(),
  canAccessOrganization:(actor:{role:string;organizationId:string|null},organizationId:string)=>actor.role==='SUPER_ADMIN'||actor.organizationId===organizationId,
}))
jest.mock('@/lib/audit',()=>({writeAuditLog:jest.fn()}))
jest.mock('@/lib/prisma',()=>({__esModule:true,default:{
  organization:{findUnique:jest.fn()},route:{findUnique:jest.fn()},user:{findUnique:jest.fn()},
  bus:{findUnique:jest.fn()},stop:{count:jest.fn()},student:{findFirst:jest.fn(),create:jest.fn()},
}}))

import prisma from '@/lib/prisma'
import { getUserFromSession } from '@/lib/auth'
import { getCurrentUser } from '@/lib/authorization'
import { POST as createStudent } from '@/app/api/students/route'

const mock=(value:unknown)=>value as jest.Mock

test('a transport Admin can add a student only to their own school',async()=>{
  mock(getUserFromSession).mockResolvedValue({id:'admin',role:'ADMIN'})
  mock(getCurrentUser).mockResolvedValue({id:'admin',role:'ADMIN',organizationId:'school-a'})
  mock(prisma.organization.findUnique).mockResolvedValue({isActive:true})
  mock(prisma.student.create).mockImplementation(({data})=>Promise.resolve({...data,id:'student'}))
  const request=new NextRequest('http://localhost/api/students',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'Student One',grade:'5',parentContact1:'0123456789',organizationId:'school-b'})})
  const response=await createStudent(request)
  expect(response.status).toBe(200)
  expect(prisma.student.create).toHaveBeenCalledWith({data:expect.objectContaining({organizationId:'school-a'})})
})
