import { NextRequest, after } from 'next/server'
import { Workbook } from 'exceljs'
jest.mock('next/server',()=>({...jest.requireActual('next/server'),after:jest.fn()}))
jest.mock('@/lib/authorization',()=>({getCurrentUser:jest.fn()}))
jest.mock('@/lib/audit',()=>({writeAuditLog:jest.fn()}))
jest.mock('@/lib/calendar-notifications',()=>({notifyCalendarPublished:jest.fn()}))
jest.mock('@/lib/prisma',()=>({__esModule:true,default:{$transaction:jest.fn(),organization:{findFirst:jest.fn()},academicEvent:{findMany:jest.fn(),createMany:jest.fn()},academicCalendarImport:{create:jest.fn()}}}))
import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/authorization'
import { POST } from '@/app/api/calendar/import/route'
const mock=(x:unknown)=>x as jest.Mock
beforeEach(()=>{
 jest.resetAllMocks()
 mock(getCurrentUser).mockResolvedValue({id:'school-admin',role:'SCHOOL_ADMIN',organizationId:'school-a'})
 mock(prisma.organization.findFirst).mockResolvedValue({id:'school-a',isActive:true})
 mock(prisma.academicEvent.findMany).mockResolvedValue([])
 mock(prisma.$transaction).mockImplementation(fn=>fn(prisma))
 mock(prisma.academicCalendarImport.create).mockImplementation(({data})=>Promise.resolve({id:'import',...data}))
})
test('real XLSX multipart upload commits events to the school and schedules parent publication',async()=>{
 const book=new Workbook();const sheet=book.addWorksheet('Calendar');sheet.addRow(['Event Name','Date','Type']);sheet.addRow(['Festival','15/09/2026','FESTIVAL'])
 const form=new FormData();form.set('file',new File([new Uint8Array(await book.xlsx.writeBuffer())],'school.xlsx'));form.set('academicYear','2026')
 const response=await POST(new NextRequest('http://localhost/api/calendar/import',{method:'POST',body:form}))
 expect(response.status).toBe(201)
 expect((await response.json()).eventCount).toBe(1)
 expect(prisma.academicEvent.createMany).toHaveBeenCalledWith({data:[expect.objectContaining({organizationId:'school-a',isPublic:true,type:'FESTIVAL'})]})
 expect(after).toHaveBeenCalledTimes(1)
})
test('re-upload skips an existing event and does not send another publication alert',async()=>{
 mock(prisma.academicEvent.findMany).mockResolvedValue([{title:'Festival',startDate:new Date('2026-09-15T00:00:00Z'),type:'FESTIVAL'}])
 const form=new FormData();form.set('file',new File(['title,startDate,type\nFestival,2026-09-15,FESTIVAL'],'calendar.csv'));form.set('academicYear','2026')
 const response=await POST(new NextRequest('http://localhost/api/calendar/import',{method:'POST',body:form}))
 expect(response.status).toBe(201);expect((await response.json()).eventCount).toBe(0)
 expect(prisma.academicEvent.createMany).not.toHaveBeenCalled();expect(after).not.toHaveBeenCalled()
})
