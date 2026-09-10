import { NextRequest } from 'next/server'
import { Workbook } from 'exceljs'
import { parseCalendarFile } from '@/lib/calendar-import'
import { nextAttendanceAction, distanceKm } from '@/lib/transport'
import { translateLiteral } from '@/i18n/literal'
jest.mock('@/lib/authorization',()=>({getCurrentUser:jest.fn(),canAccessOrganization:(u:{role:string;organizationId:string},id:string)=>u.role==='SUPER_ADMIN'||!!u.organizationId&&u.organizationId===id}))
jest.mock('@/lib/auth',()=>({getUserFromSession:jest.fn()}))
jest.mock('@/lib/notification-delivery',()=>({pushNotification:jest.fn(),transportMessage:()=>({title:'Boarding',body:'Confirmed'})}))
jest.mock('@/lib/prisma',()=>({__esModule:true,default:{
 $transaction:jest.fn(),$queryRaw:jest.fn(),
 trip:{findUnique:jest.fn()},student:{findUnique:jest.fn(),update:jest.fn()},user:{findUnique:jest.fn()},
 attendance:{findMany:jest.fn(),create:jest.fn()},notification:{create:jest.fn()},
 message:{findUnique:jest.fn(),update:jest.fn()},academicEvent:{create:jest.fn()}
}}))
import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/authorization'
import { getUserFromSession } from '@/lib/auth'
import { POST as attendance } from '@/app/api/attendance/route'
import { DELETE as deleteMessage } from '@/app/api/messages/route'
import { POST as calendar } from '@/app/api/calendar/route'
import { pushNotification } from '@/lib/notification-delivery'
const mock=(v:unknown)=>v as jest.Mock
const request=(path:string,data:object,method='POST')=>new NextRequest(`http://localhost${path}`,{method,headers:{'content-type':'application/json'},body:JSON.stringify(data)})
const stop={id:'stop',name:'Home',routeId:'route',latitude:3,longitude:101,order:1}
const body={tripId:'trip',studentId:'child',action:'PICKED_UP',stopId:'stop',confirmStop:true}
beforeEach(()=>{
 jest.resetAllMocks();mock(prisma.$transaction).mockImplementation(fn=>fn(prisma));
 mock(getCurrentUser).mockResolvedValue({id:'maintainer',role:'DRIVER',organizationId:'school-a'});
 mock(getUserFromSession).mockResolvedValue({id:'maintainer',role:'DRIVER'});
 mock(prisma.trip.findUnique).mockResolvedValue({id:'trip',driverId:'driver',maintainerId:'maintainer',busId:'bus',routeId:'route',status:'BUS_EN_ROUTE',route:{organizationId:'school-a'}});
 mock(prisma.student.findUnique).mockResolvedValue({id:'child',name:'Child',isActive:true,isSelfPickup:false,organizationId:'school-a',busId:'bus',routeId:'route',pickupStop:stop,dropoffStop:{...stop,id:'school'},parent:{id:'parent',locale:'en'}});
 mock(prisma.attendance.findMany).mockResolvedValue([]);mock(prisma.attendance.create).mockResolvedValue({id:'a',timestamp:new Date()});
 mock(prisma.user.findUnique).mockResolvedValue({name:'Maintainer'});mock(prisma.notification.create).mockResolvedValue({id:'n',userId:'parent'});
})
describe('assigned crew attendance',()=>{
 test('maintainer boarding creates dated record and parent alert',async()=>{const res=await attendance(request('/api/attendance',body));expect(res.status).toBe(200);expect(prisma.attendance.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({recordedById:'maintainer',stopId:'stop',dedupeKey:'trip:child:PICKED_UP'})}));expect(prisma.notification.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({userId:'parent'})}));expect(pushNotification).toHaveBeenCalledTimes(1)})
 test('repeated taps do not notify twice',async()=>{mock(prisma.attendance.findMany).mockResolvedValue([{id:'a',action:'PICKED_UP'}]);const res=await attendance(request('/api/attendance',body));expect(res.status).toBe(200);expect((await res.json()).idempotent).toBe(true);expect(prisma.notification.create).not.toHaveBeenCalled()})
 test('drop-off requires boarding first',async()=>{const res=await attendance(request('/api/attendance',{...body,action:'DROPPED_OFF',stopId:'school'}));expect(res.status).toBe(409);expect(prisma.attendance.create).not.toHaveBeenCalled()})
 test('offboarding notifies the same parent after boarding',async()=>{mock(prisma.attendance.findMany).mockResolvedValue([{action:'PICKED_UP'}]);const res=await attendance(request('/api/attendance',{...body,action:'DROPPED_OFF',stopId:'school'}));expect(res.status).toBe(200);expect(prisma.notification.create).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({userId:'parent',type:'DROPPED_OFF'})}))})
 test('another school cannot record attendance',async()=>{mock(getCurrentUser).mockResolvedValue({id:'other',role:'SCHOOL_ADMIN',organizationId:'school-b'});expect((await attendance(request('/api/attendance',body))).status).toBe(403)})
 test('an unassigned driver cannot record attendance',async()=>{mock(getCurrentUser).mockResolvedValue({id:'other',role:'DRIVER',organizationId:'school-a'});expect((await attendance(request('/api/attendance',body))).status).toBe(403)})
 test('normal admin cannot record attendance',async()=>{mock(getCurrentUser).mockResolvedValue({id:'admin',role:'ADMIN',organizationId:'school-a'});expect((await attendance(request('/api/attendance',body))).status).toBe(403)})
 test.each([{stopId:'wrong'},{confirmStop:false},{latitude:4,longitude:102}])('rejects wrong stop, missing confirmation and distant GPS: %j',async changes=>{expect((await attendance(request('/api/attendance',{...body,...changes}))).status).toBe(409);expect(prisma.attendance.create).not.toHaveBeenCalled()})
 test('closed trip rejects new events',async()=>{mock(prisma.trip.findUnique).mockResolvedValue({id:'trip',driverId:'driver',maintainerId:'maintainer',busId:'bus',routeId:'route',status:'TRIP_COMPLETED',route:{organizationId:'school-a'}});expect((await attendance(request('/api/attendance',body))).status).toBe(409)})
})
describe('calendar files',()=>{
 test('CSV handles quoted commas, embedded newline and UTF-8',async()=>{const file=new File(['title,startDate,endDate,type,description,isPublic,color\n"Sports, day",2026-09-12,,EVENT,"Line one\n第二行",false,#123456'], 'calendar.csv');const rows=await parseCalendarFile(file,'school-a');expect(rows[0]).toMatchObject({title:'Sports, day',organizationId:'school-a',isPublic:false,description:'Line one\n第二行'})})
 test('XLSX accepts Excel date cells',async()=>{const wb=new Workbook(),sheet=wb.addWorksheet('Calendar');sheet.addRow(['title','startDate','type']);sheet.addRow(['Holiday',new Date('2026-09-12T00:00:00Z'),'HOLIDAY']);const bytes=await wb.xlsx.writeBuffer();const rows=await parseCalendarFile(new File([new Uint8Array(bytes)],'calendar.xlsx'),'school-a');expect(rows[0].startDate.toISOString()).toBe('2026-09-12T00:00:00.000Z')})
 test.each(['title,startDate,type\nBad,2026-02-30,EVENT','title,startDate,type\nBad,2026-09-12,UNKNOWN','title,startDate,endDate,type\nBad,2026-09-12,2026-09-10,EVENT'])('invalid rows reject entire import',async csv=>{await expect(parseCalendarFile(new File([csv],'calendar.csv'),null)).rejects.toThrow()})
 test('Excel formulas are rejected',async()=>{const wb=new Workbook(),sheet=wb.addWorksheet('Calendar');sheet.addRow(['title','startDate','type']);sheet.addRow([{formula:'1+1',result:2},'2026-09-12','EVENT']);await expect(parseCalendarFile(new File([new Uint8Array(await wb.xlsx.writeBuffer())],'calendar.xlsx'),null)).rejects.toThrow('Formulas')})
 test('legacy XLS is explicitly rejected',async()=>{await expect(parseCalendarFile(new File(['data'],'calendar.xls'),null)).rejects.toThrow('xlsx')})
 test.each(['ADMIN','DRIVER','PARENT'])('%s cannot manage calendar',async role=>{mock(getUserFromSession).mockResolvedValue({id:'u',role});expect((await calendar(request('/api/calendar',{title:'Holiday',startDate:'2026-09-12'}))).status).toBe(401);expect(prisma.academicEvent.create).not.toHaveBeenCalled()})
 test('school admin cannot create an event for another school',async()=>{mock(getUserFromSession).mockResolvedValue({id:'u',role:'SCHOOL_ADMIN'});mock(getCurrentUser).mockResolvedValue({id:'u',role:'SCHOOL_ADMIN',organizationId:'school-a'});expect((await calendar(request('/api/calendar',{title:'Holiday',startDate:'2026-09-12',organizationId:'school-b'}))).status).toBe(403)})
})
describe('message ownership',()=>{
 test('an unrelated user cannot delete a message',async()=>{mock(prisma.message.findUnique).mockResolvedValue({senderId:'a',recipientId:'b'});expect((await deleteMessage(request('/api/messages',{id:'m'},'DELETE'))).status).toBe(404);expect(prisma.message.update).not.toHaveBeenCalled()})
 test('deleting received message preserves sender copy',async()=>{mock(prisma.message.findUnique).mockResolvedValue({senderId:'a',recipientId:'maintainer'});expect((await deleteMessage(request('/api/messages',{id:'m'},'DELETE'))).status).toBe(200);expect(prisma.message.update).toHaveBeenCalledWith({where:{id:'m'},data:{recipientDeletedAt:expect.any(Date)}})})
})
test('attendance state machine and GPS distance',()=>{expect(nextAttendanceAction([])).toBe('PICKED_UP');expect(nextAttendanceAction(['PICKED_UP'])).toBe('DROPPED_OFF');expect(nextAttendanceAction(['PICKED_UP','DROPPED_OFF'])).toBeNull();expect(nextAttendanceAction(['ABSENT'])).toBeNull();expect(distanceKm(stop,stop)).toBe(0)})
test.each(['Live Tracking','School notifications','Confirm boarding','Save stops','Delete','Import Academic Calendar'])('UI language switching round trip: %s',text=>{const ms=translateLiteral(text,'ms'),zh=translateLiteral(ms,'zh');expect(ms).not.toBe(text);expect(zh).not.toBe(text);expect(translateLiteral(zh,'en')).toBe(text)})
