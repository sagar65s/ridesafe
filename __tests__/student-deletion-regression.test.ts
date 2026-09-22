import { NextRequest } from 'next/server'

jest.mock('@/lib/auth', () => ({ getUserFromSession: jest.fn() }))
jest.mock('@/lib/authorization', () => ({ getCurrentUser: jest.fn(), canAccessOrganization: (actor: {organizationId:string},id:string) => actor.organizationId===id }))
jest.mock('@/lib/audit', () => ({ writeAuditLog: jest.fn() }))
jest.mock('@/lib/prisma', () => ({__esModule:true,default:{
  student:{findUnique:jest.fn(),delete:jest.fn()},trip:{count:jest.fn()},attendance:{count:jest.fn()},attendanceRequest:{count:jest.fn()},transportIssue:{count:jest.fn()},
}}))

import prisma from '@/lib/prisma'
import {getCurrentUser} from '@/lib/authorization'
import {getUserFromSession} from '@/lib/auth'
import {DELETE} from '@/app/api/students/[id]/route'

const asMock=(method:unknown)=>method as jest.Mock
beforeEach(()=>{
  jest.resetAllMocks()
  asMock(getUserFromSession).mockResolvedValue({id:'staff',role:'SCHOOL_ADMIN'})
  asMock(getCurrentUser).mockResolvedValue({id:'staff',role:'SCHOOL_ADMIN',organizationId:'school-a'})
  asMock(prisma.student.findUnique).mockResolvedValue({id:'child',organizationId:'school-a',busId:null,studentCode:'STU-1'})
  asMock(prisma.attendance.count).mockResolvedValue(0)
  asMock(prisma.attendanceRequest.count).mockResolvedValue(0)
  asMock(prisma.transportIssue.count).mockResolvedValue(0)
  asMock(prisma.student.delete).mockResolvedValue({id:'child'})
})

const remove=()=>DELETE(new NextRequest('http://localhost/api/students/child',{method:'DELETE'}),{params:Promise.resolve({id:'child'})})

test('truly deletes a student without historical references',async()=>{
  const response=await remove()
  expect(response.status).toBe(200)
  expect(await response.json()).toEqual({success:true,deleted:true})
  expect(prisma.student.delete).toHaveBeenCalledWith({where:{id:'child'}})
})

test('protects attendance instead of silently cascading through school history',async()=>{
  asMock(prisma.attendance.count).mockResolvedValue(1)
  const response=await remove()
  expect(response.status).toBe(409)
  expect(prisma.student.delete).not.toHaveBeenCalled()
})

test('refuses to delete another school’s child',async()=>{
  asMock(prisma.student.findUnique).mockResolvedValue({id:'child',organizationId:'school-b'})
  const response=await remove()
  expect(response.status).toBe(403)
  expect(prisma.student.delete).not.toHaveBeenCalled()
})
