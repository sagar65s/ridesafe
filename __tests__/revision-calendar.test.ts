import { Workbook } from 'exceljs'
import { parseCalendarFile } from '@/lib/calendar-import'
import { createUserSchema } from '@/lib/validation'
jest.mock('@/lib/prisma', () => ({__esModule:true,default:{user:{findFirst:jest.fn(),findMany:jest.fn()},academicEvent:{findMany:jest.fn()},notification:{createMany:jest.fn(),findMany:jest.fn()}}}))
jest.mock('@/lib/notification-delivery', () => ({pushNotification:jest.fn()}))
import prisma from '@/lib/prisma'
import { sendCalendarReminders, schoolCalendarWindow } from '@/lib/calendar-notifications'
import { pushNotification } from '@/lib/notification-delivery'
const mock = (value: unknown) => value as jest.Mock
beforeEach(() => jest.resetAllMocks())
test('eight-character account passwords pass and seven-character passwords fail', () => {
 const user={name:'Parent',email:'parent@example.com',role:'PARENT'}
 expect(createUserSchema.safeParse({...user,password:'12345678'}).success).toBe(true)
 expect(createUserSchema.safeParse({...user,password:'1234567'}).success).toBe(false)
})
test('Excel cover sheet, user-friendly headings and DD/MM/YYYY are supported', async () => {
 const book=new Workbook();book.addWorksheet('Read me').addRow(['Instructions']);const sheet=book.addWorksheet('School calendar')
 sheet.addRow(['Event Name','Start Date','End Date','Event Type','Visible'])
 sheet.addRow(['Festival','15/09/2026','16/09/2026','Festival','Yes'])
 const rows=await parseCalendarFile(new File([new Uint8Array(await book.xlsx.writeBuffer())],'school.xlsx'),'school-a')
 expect(rows[0]).toMatchObject({title:'Festival',type:'FESTIVAL',isPublic:true,organizationId:'school-a'})
 expect(rows[0].startDate.toISOString()).toBe('2026-09-15T00:00:00.000Z')
})
test('CSV allows basic event name/date columns without type',async()=>{
 const rows=await parseCalendarFile(new File(['Event Name,Date\nSchool concert,15/09/2026'],'calendar.csv'),'school-a')
 expect(rows[0].type).toBe('EVENT')
})
test('daily operations calendar skips normal/weekend days and merges repeated closure dates',async()=>{
 const csv='Date,Weekday,Buses running,Reason,Event\n2026-03-19,Thursday,Yes,,\n2026-03-20,Friday,No,Closure,Hari Raya Aidilfitri\n2026-03-21,Saturday,No,Weekend,\n2026-03-23,Monday,No,Closure,Hari Raya Aidilfitri\n2026-03-24,Tuesday,No,Closure,Hari Raya Aidilfitri'
 const rows=await parseCalendarFile(new File([csv],'calendar-all-days.csv'),'school-a')
 expect(rows).toHaveLength(1)
 expect(rows[0]).toMatchObject({title:'Hari Raya Aidilfitri',type:'HOLIDAY',organizationId:'school-a'})
 expect(rows[0].startDate.toISOString().slice(0,10)).toBe('2026-03-20')
 expect(rows[0].endDate?.toISOString().slice(0,10)).toBe('2026-03-24')
})
test('invalid calendar day is not silently normalised',async()=>{
 await expect(parseCalendarFile(new File(['Event Name,Date\nBad,31/02/2026'],'calendar.csv'),'school-a')).rejects.toThrow('Invalid date')
})
test('Malaysia midnight controls reminder day',()=>{
 expect(schoolCalendarWindow(new Date('2026-09-10T16:01:00Z')).day).toBe('2026-09-11')
})
test('parent reminders scope events and recipients to the assigned school and dedupe delivery',async()=>{
 mock(prisma.user.findFirst).mockResolvedValue({organizationId:'school-a'})
 mock(prisma.academicEvent.findMany).mockResolvedValue([{id:'event',organizationId:'school-a',title:'Holiday',startDate:new Date(),isPublic:true}])
 mock(prisma.user.findMany).mockResolvedValue([{id:'parent-a',locale:'en'}])
 mock(prisma.notification.createMany).mockResolvedValue({count:0})
 mock(prisma.notification.findMany).mockResolvedValue([])
 expect(await sendCalendarReminders('parent-a')).toBe(0)
 expect(prisma.academicEvent.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({isPublic:true,organizationId:'school-a'})}))
 expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({id:'parent-a',organizationId:'school-a',role:'PARENT'})}))
 expect(prisma.notification.createMany).toHaveBeenCalledWith(expect.objectContaining({skipDuplicates:true}))
 expect(pushNotification).not.toHaveBeenCalled()
})
test('unassigned parents do not receive global school reminders',async()=>{
 mock(prisma.user.findFirst).mockResolvedValue({organizationId:null})
 expect(await sendCalendarReminders('unassigned')).toBe(0)
 expect(prisma.academicEvent.findMany).not.toHaveBeenCalled()
})
