import {NextRequest} from 'next/server'

jest.mock('@/lib/auth',()=>({getUserFromSession:jest.fn()}))
jest.mock('@/lib/authorization',()=>({resolveUserOrganizationId:jest.fn()}))
jest.mock('@/lib/audit',()=>({writeAuditLog:jest.fn()}))
jest.mock('@/lib/notification-delivery',()=>({pushNotification:jest.fn()}))
jest.mock('@/lib/prisma',()=>({__esModule:true,default:{
  user:{findMany:jest.fn(),findUnique:jest.fn()},
  announcement:{create:jest.fn()},notification:{createMany:jest.fn(),findMany:jest.fn()},
  systemSetting:{upsert:jest.fn()},$transaction:jest.fn(),
}}))
import prisma from '@/lib/prisma'
import {getUserFromSession} from '@/lib/auth'
import {resolveUserOrganizationId} from '@/lib/authorization'
import {writeAuditLog} from '@/lib/audit'
import {POST as announce} from '@/app/api/announcements/route'
import {POST as saveSettings} from '@/app/api/admin/settings/route'

const mock=(value:unknown)=>value as jest.Mock
beforeEach(()=>{
  jest.resetAllMocks()
  mock(getUserFromSession).mockResolvedValue({id:'school-admin',role:'SCHOOL_ADMIN'})
  mock(resolveUserOrganizationId).mockResolvedValue('school-a')
  mock(prisma.user.findMany).mockResolvedValue([{id:'school-admin'},{id:'parent-direct'},{id:'parent-via-student'}])
  mock(prisma.user.findUnique).mockResolvedValue({accessProfile:null})
  mock(prisma.$transaction).mockImplementation(work=>work(prisma))
  mock(prisma.announcement.create).mockResolvedValue({id:'announcement-a',organizationId:'school-a',sentCount:2})
  mock(prisma.notification.createMany).mockResolvedValue({count:2})
  mock(prisma.notification.findMany).mockResolvedValue([])
  mock(writeAuditLog).mockResolvedValue(undefined)
})

test('school announcement reaches direct and student-mapped parents atomically',async()=>{
  const response=await announce(new NextRequest('http://localhost/api/announcements',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:'School update',body:'Transport operates normally',targetRole:'ALL',type:'INFO'})}))
  expect(response.status).toBe(200)
  expect(await response.json()).toMatchObject({sent:2,targetRole:'ALL'})
  expect(prisma.user.findMany).toHaveBeenCalledWith({where:expect.objectContaining({AND:[{OR:[{organizationId:'school-a'},{role:'PARENT',parentStudents:{some:{organizationId:'school-a'}}}]}]}),select:{id:true}})
  expect(prisma.notification.createMany).toHaveBeenCalledWith({data:expect.arrayContaining([expect.objectContaining({userId:'parent-direct'}),expect.objectContaining({userId:'parent-via-student'})])})
  expect(prisma.notification.createMany).not.toHaveBeenCalledWith({data:expect.arrayContaining([expect.objectContaining({userId:'school-admin'})])})
  expect(writeAuditLog).toHaveBeenCalledWith(expect.objectContaining({action:'BROADCAST',entityType:'ANNOUNCEMENT'}))
})

test('sandbox profile cannot change global settings through the API',async()=>{
  mock(getUserFromSession).mockResolvedValue({id:'sandbox',role:'SUPER_ADMIN'})
  mock(prisma.user.findUnique).mockResolvedValue({accessProfile:'SANDBOX'})
  const response=await saveSettings(new NextRequest('http://localhost/api/admin/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({geofenceRadius:'600'})}))
  expect(response.status).toBe(403)
  expect(prisma.systemSetting.upsert).not.toHaveBeenCalled()
})
