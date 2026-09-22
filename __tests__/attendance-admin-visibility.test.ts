import {NextRequest} from 'next/server'

jest.mock('@/lib/auth',()=>({getUserFromSession:jest.fn()}))
jest.mock('@/lib/authorization',()=>({getCurrentUser:jest.fn(),canAccessOrganization:jest.fn()}))
jest.mock('@/lib/prisma',()=>({__esModule:true,default:{
  route:{findFirst:jest.fn()},trip:{findMany:jest.fn()},student:{findMany:jest.fn()},attendanceImportRecord:{findMany:jest.fn()},
}}))

import prisma from '@/lib/prisma'
import {getCurrentUser} from '@/lib/authorization'
import {getUserFromSession} from '@/lib/auth'
import {GET} from '@/app/api/attendance/route'

const mock=(value:unknown)=>value as jest.Mock
beforeEach(()=>{
  jest.resetAllMocks()
  mock(getUserFromSession).mockResolvedValue({id:'school-staff',role:'SCHOOL_ADMIN'})
  mock(getCurrentUser).mockResolvedValue({id:'school-staff',role:'SCHOOL_ADMIN',organizationId:'school-a'})
  mock(prisma.route.findFirst).mockResolvedValue({name:'Route A'})
  mock(prisma.trip.findMany).mockResolvedValue([{
    id:'trip-1',date:new Date('2026-09-15T02:00:00+08:00'),serviceType:'MORNING',status:'BUS_EN_ROUTE',routeId:'route-a',busId:'bus-a',
    route:{id:'route-a',name:'Route A'},driver:{id:'driver-1',name:'Bus Driver'},bus:{plateNumber:'BUS-001'},attendanceRequests:[],
    attendances:[{id:'attendance-1',studentId:'child',action:'PICKED_UP',timestamp:new Date('2026-09-15T02:30:00+08:00'),student:{id:'child',name:'Amy Student',grade:'Year 2',studentCode:'STU-1'}}],
  }])
  mock(prisma.student.findMany).mockResolvedValue([{id:'child',studentCode:'STU-1',name:'Amy Student',grade:'Year 2',routeId:'route-a',busId:'bus-a',isSelfPickup:false,selfPickupSession:null}])
  mock(prisma.attendanceImportRecord.findMany).mockResolvedValue([])
})

test('school admin sees the driver trip and live boarding even if the historical archive table is missing',async()=>{
  mock(prisma.attendanceImportRecord.findMany).mockRejectedValue({code:'P2021',meta:{modelName:'AttendanceImportRecord',table:'public.AttendanceImportRecord'}})
  const response=await GET(new NextRequest('http://localhost/api/attendance?date=2026-09-15&routeId=route-a'))
  const body=await response.json()
  expect(response.status).toBe(200)
  expect(body.archiveAvailable).toBe(false)
  expect(body.archiveError).toContain('npm run db:migrate')
  expect(body.trips[0]).toMatchObject({tripId:'trip-1',routeName:'Route A',roster:[{studentId:'child',status:'PICKED_UP'}]})
  expect(prisma.trip.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({routeId:'route-a',route:{organizationId:'school-a'}})}))
})

test('genuine archive query failures are not hidden as an empty trip page',async()=>{
  mock(prisma.attendanceImportRecord.findMany).mockRejectedValue({code:'P2021',meta:{modelName:'DifferentModel',table:'public.OtherTable'}})
  const response=await GET(new NextRequest('http://localhost/api/attendance?date=2026-09-15'))
  expect(response.status).toBe(500)
})

test('crew-verified boarding takes precedence over a later spreadsheet correction',async()=>{
  mock(prisma.trip.findMany).mockResolvedValue([{
    id:'trip-1',date:new Date('2026-09-15T02:00:00+08:00'),serviceType:'MORNING',status:'TRIP_COMPLETED',routeId:'route-a',busId:'bus-a',
    route:{id:'route-a',name:'Route A'},driver:{id:'driver-1',name:'Bus Driver'},bus:{plateNumber:'BUS-001'},attendanceRequests:[],
    attendances:[
      {id:'crew-1',studentId:'child',dedupeKey:'trip-1:child:PICKED_UP',action:'PICKED_UP',timestamp:new Date('2026-09-15T02:30:00+08:00'),student:{id:'child',name:'Amy Student',grade:'Year 2',studentCode:'STU-1'}},
      {id:'import-1',studentId:'child',dedupeKey:'attendance-import:trip-1:child',action:'ABSENT',timestamp:new Date('2026-09-15T05:00:00+08:00'),student:{id:'child',name:'Amy Student',grade:'Year 2',studentCode:'STU-1'}},
    ],
  }])
  const response=await GET(new NextRequest('http://localhost/api/attendance?date=2026-09-15'))
  const body=await response.json()
  expect(body.trips[0].roster[0]).toMatchObject({status:'PICKED_UP',source:'CREW_VERIFIED'})
})

test('uploaded school history remains visible on its date even with no recorded trip',async()=>{
  mock(prisma.trip.findMany).mockResolvedValue([])
  mock(prisma.attendanceImportRecord.findMany).mockResolvedValue([{id:'archive-1',studentName:'Amy Student',status:'ABSENT',date:new Date('2026-09-15T00:00:00+08:00')}])
  const response=await GET(new NextRequest('http://localhost/api/attendance?date=2026-09-15'))
  const body=await response.json()
  expect(body).toMatchObject({trips:[],archived:[{id:'archive-1',status:'ABSENT'}]})
  expect(prisma.attendanceImportRecord.findMany).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({organizationId:'school-a'})}))
})
