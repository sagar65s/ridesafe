import { NextRequest } from 'next/server'
jest.mock('@/lib/auth',()=>({getUserFromSession:jest.fn()}))
jest.mock('@/lib/authorization',()=>({getCurrentUser:jest.fn()}))
jest.mock('@/lib/audit',()=>({writeAuditLog:jest.fn()}))
jest.mock('@/lib/prisma',()=>({__esModule:true,default:{user:{findUnique:jest.fn(),create:jest.fn()},organization:{findUnique:jest.fn(),findMany:jest.fn()},route:{create:jest.fn()},driverAssignmentHistory:{create:jest.fn()}}}))
import prisma from '@/lib/prisma'
import { getUserFromSession } from '@/lib/auth'
import { getCurrentUser } from '@/lib/authorization'
import { POST as createUser } from '@/app/api/admin/users/route'
import { GET as listSchools } from '@/app/api/admin/organizations/route'
import { POST as createRoute } from '@/app/api/admin/routes/route'
import { POST as importCalendar } from '@/app/api/calendar/import/route'
const mock=(value:unknown)=>value as jest.Mock
const request=(body:object)=>new NextRequest('http://localhost/api/test',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)})
beforeEach(()=>{
 jest.resetAllMocks()
 mock(getUserFromSession).mockResolvedValue({id:'actor',role:'SUPER_ADMIN'})
 mock(prisma.user.findUnique).mockImplementation(({where})=>Promise.resolve(where.email?null:{organizationId:'school-a'}))
 mock(prisma.organization.findUnique).mockResolvedValue({id:'school-a',isActive:true})
 mock(prisma.user.create).mockImplementation(({data})=>Promise.resolve({...data,id:'new-user'}))
 mock(prisma.route.create).mockImplementation(({data})=>Promise.resolve({...data,id:'route'}))
})
const account={name:'New Parent',email:'parent@example.com',password:'12345678',role:'PARENT',organizationId:'school-a'}
test('Super Admin creates school-assigned user with an eight-character password',async()=>{
 expect((await createUser(request(account))).status).toBe(200)
 expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({organizationId:'school-a',role:'PARENT'})}))
})
test.each(['PARENT','SUPER_ADMIN'])('new %s requires an organization even for Super Admin actor',async role=>{
 expect((await createUser(request({...account,role,organizationId:''}))).status).toBe(400)
 expect(prisma.user.create).not.toHaveBeenCalled()
})
test('seven-character password is rejected by the actual user endpoint',async()=>{
 expect((await createUser(request({...account,password:'1234567'}))).status).toBe(400)
})
test('Admin can create a route in their own school',async()=>{
 mock(getUserFromSession).mockResolvedValue({id:'actor',role:'ADMIN'})
 expect((await createRoute(request({name:'Morning route',organizationId:'school-a'}))).status).toBe(200)
 expect(prisma.route.create).toHaveBeenCalledWith({data:expect.objectContaining({organizationId:'school-a'})})
})
test('Admin cannot target another school when creating a route',async()=>{
 mock(getUserFromSession).mockResolvedValue({id:'actor',role:'ADMIN'})
 expect((await createRoute(request({name:'Other route',organizationId:'school-b'}))).status).toBe(403)
 expect(prisma.route.create).not.toHaveBeenCalled()
})
test.each(['ADMIN','DRIVER','PARENT'])('%s cannot upload calendars',async role=>{
 mock(getCurrentUser).mockResolvedValue({id:'actor',role,organizationId:'school-a'})
 expect((await importCalendar(request({}))).status).toBe(403)
})

test('School Admin organization dropdown can load only its own school',async()=>{
 mock(getUserFromSession).mockResolvedValue({id:'actor',role:'SCHOOL_ADMIN'})
 mock(prisma.organization.findMany).mockResolvedValue([{id:'school-a',name:'School A'}])
 expect((await listSchools()).status).toBe(200)
 expect(prisma.organization.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{id:'school-a'}}))
})
