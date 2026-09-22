import { NextRequest } from 'next/server'

jest.mock('@/lib/authorization',()=>({getCurrentUser:jest.fn()}))
jest.mock('@/lib/audit',()=>({writeAuditLog:jest.fn()}))
jest.mock('@/lib/prisma',()=>({__esModule:true,default:{
  organization:{findFirst:jest.fn()},route:{findMany:jest.fn()},bus:{findMany:jest.fn()},user:{findMany:jest.fn()},student:{findMany:jest.fn(),createMany:jest.fn(),update:jest.fn()},notification:{createMany:jest.fn()},$transaction:jest.fn(),
}}))
import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/authorization'
import {POST} from '@/app/api/students/import/route'
const mock=(value:unknown)=>value as jest.Mock

beforeEach(()=>{
  jest.resetAllMocks()
  mock(getCurrentUser).mockResolvedValue({id:'school-admin',role:'SCHOOL_ADMIN',organizationId:'school-a'})
  mock(prisma.organization.findFirst).mockResolvedValue({id:'school-a'})
  mock(prisma.route.findMany).mockResolvedValue([{id:'route-a',name:'Route A',stops:[{id:'stop-a',name:'Stop A'}]}])
  mock(prisma.bus.findMany).mockResolvedValue([{id:'bus-a',busNumber:'BUS-001',plateNumber:'SCHOOL-001'}])
  mock(prisma.user.findMany).mockResolvedValue([])
  mock(prisma.student.findMany).mockResolvedValue([{id:'student-a',studentCode:'STU-001',name:'Old Name',grade:'5',className:'5A'}])
  mock(prisma.student.createMany).mockResolvedValue({count:0})
  mock(prisma.student.update).mockResolvedValue({id:'student-a'})
  mock(prisma.$transaction).mockImplementation(async operations=>Promise.all(operations))
})

test('matching Student ID updates only an existing student in the same school',async()=>{
  const form=new FormData()
  form.set('file',new File(['Student Name,Student ID,Year,Class,Route,Bus,Pickup Stop,Primary Contact\nUpdated Name,STU-001,Year 5,5A,Route A,BUS-001,Stop A,0123456789'],'students.csv'))
  const response=await POST(new NextRequest('http://localhost/api/students/import',{method:'POST',body:form}))
  expect(response.status).toBe(200)
  expect((await response.json()).updated).toBe(1)
  expect(prisma.student.update).toHaveBeenCalledWith({where:{id:'student-a',organizationId:'school-a'},data:expect.objectContaining({name:'Updated Name',routeId:'route-a',busId:'bus-a',pickupStopId:'stop-a'})})
  expect(prisma.student.createMany).not.toHaveBeenCalled()
})
