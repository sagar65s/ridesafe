import { NextRequest } from 'next/server'

jest.mock('@/lib/auth',()=>({getUserFromSession:jest.fn()}))
jest.mock('@/lib/authorization',()=>({getCurrentUser:jest.fn(),canAccessOrganization:()=>true}))
jest.mock('@/lib/audit',()=>({writeAuditLog:jest.fn()}))
jest.mock('@/lib/notification-delivery',()=>({pushNotification:jest.fn()}))
jest.mock('@/lib/prisma',()=>({__esModule:true,default:{
  bus:{findFirst:jest.fn(),findUnique:jest.fn()},user:{findUnique:jest.fn()},route:{findUnique:jest.fn()},student:{findMany:jest.fn()},notification:{create:jest.fn()},trip:{findFirst:jest.fn(),create:jest.fn()},$queryRaw:jest.fn(),$transaction:jest.fn(),
}}))

import prisma from '@/lib/prisma'
import { getUserFromSession } from '@/lib/auth'
import { getCurrentUser } from '@/lib/authorization'
import { POST } from '@/app/api/trips/route'
const mock=(value:unknown)=>value as jest.Mock
beforeEach(()=>jest.resetAllMocks())

test('maintainer starts an assigned service trip without being mistaken for the bus driver GPS source',async()=>{
  mock(getUserFromSession).mockResolvedValue({id:'maintainer',role:'DRIVER'})
  mock(getCurrentUser).mockResolvedValue({id:'maintainer',role:'DRIVER',organizationId:'school'})
  const bus={id:'bus',driverId:'driver',maintainerId:'maintainer',routeId:'route',organizationId:'school',status:'ACTIVE'}
  mock(prisma.bus.findFirst).mockResolvedValueOnce(bus).mockResolvedValueOnce({id:'bus'})
  mock(prisma.bus.findUnique).mockResolvedValue(bus)
  mock(prisma.user.findUnique).mockResolvedValue({role:'DRIVER',organizationId:'school',isActive:true,employmentStatus:'ACTIVE'})
  mock(prisma.route.findUnique).mockResolvedValue({organizationId:'school',isActive:true,_count:{stops:2}})
  mock(prisma.student.findMany).mockResolvedValueOnce([{id:'student',organizationId:'school',routeId:'route',parentId:'parent',pickupStopId:'pickup',dropoffStopId:'dropoff',isSelfPickup:false,selfPickupSession:null,pickupStop:{routeId:'route'},dropoffStop:{routeId:'route'},parent:{organizationId:'school'}}]).mockResolvedValueOnce([])
  mock(prisma.$transaction).mockImplementation((work:unknown)=>typeof work==='function'?(work as (tx:typeof prisma)=>unknown)(prisma):Promise.resolve([]))
  mock(prisma.trip.findFirst).mockResolvedValue(null)
  mock(prisma.trip.create).mockResolvedValue({id:'trip',serviceType:'PM'})
  const response=await POST(new NextRequest('http://localhost/api/trips',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({busId:'bus',routeId:'route',serviceType:'PM'})}))
  expect(response.status).toBe(200)
  expect(prisma.trip.findFirst).toHaveBeenCalledWith(expect.objectContaining({where:expect.objectContaining({status:{in:['DRIVER_STARTED_ROUTE','BUS_EN_ROUTE']}})}))
  expect(prisma.trip.create).toHaveBeenCalledWith({data:expect.objectContaining({driverId:'driver',maintainerId:'maintainer',serviceType:'PM',status:'DRIVER_STARTED_ROUTE'})})
})

test('a maintainer-only bus cannot start a trip with misleading driver location',async()=>{
  mock(getUserFromSession).mockResolvedValue({id:'maintainer',role:'DRIVER'})
  mock(prisma.bus.findFirst).mockResolvedValue({id:'bus',driverId:null,maintainerId:'maintainer',routeId:'route',status:'ACTIVE'})
  const response=await POST(new NextRequest('http://localhost/api/trips',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({busId:'bus',serviceType:'MORNING'})}))
  expect(response.status).toBe(409)
  expect(prisma.trip.create).not.toHaveBeenCalled()
})
