jest.mock('@/lib/prisma',()=>({__esModule:true,default:{trip:{findMany:jest.fn()},notification:{create:jest.fn()}}}))
jest.mock('@/lib/services/trackingService',()=>({trackingService:{getLiveLocation:jest.fn()}}))
jest.mock('@/lib/notification-delivery',()=>({transportMessage:()=>({title:'Arriving',body:'Be ready'}),pushNotification:jest.fn()}))
import prisma from '@/lib/prisma'
import {trackingService} from '@/lib/services/trackingService'
import {readLiveTracking} from '@/lib/live-tracking'
import {pushNotification} from '@/lib/notification-delivery'
const mock=(v:unknown)=>v as jest.Mock
const stop={id:'home',name:'Home',latitude:3.01,longitude:101,order:1}
beforeEach(()=>{
 jest.resetAllMocks()
 mock(prisma.trip.findMany).mockResolvedValue([{id:'trip',busId:'bus',driverId:'driver',driver:{id:'driver',name:'Driver'},bus:{id:'bus',plateNumber:'ABC'},route:{name:'Route',stops:[stop],students:[{id:'child',name:'My Child',busId:'bus',parentId:'parent',parent:{id:'parent',locale:'en'},pickupStop:stop,dropoffStop:stop},{id:'other',name:'Other Child',busId:'other-bus',parentId:'other-parent',parent:{id:'other-parent',locale:'en'},pickupStop:stop,dropoffStop:stop}]},attendances:[]}])
 mock(trackingService.getLiveLocation).mockResolvedValue({lat:3,lng:101,speed_kmh:30,timestamp:new Date().toISOString(),source:'MOBILE'})
 mock(prisma.notification.create).mockResolvedValue({id:'notice',userId:'parent'})
})
test('five-minute alert is scoped to the child bus and parent',async()=>{const result=await readLiveTracking({busId:'bus'},'parent');expect(result[0].targets).toHaveLength(1);expect(result[0].targets[0].studentId).toBe('child');expect(result[0].targets[0].etaMins).toBe(3);expect(prisma.notification.create).toHaveBeenCalledWith({data:expect.objectContaining({userId:'parent',type:'BUS_ETA_5_MIN',dedupeKey:'eta5:trip:child:PICKED_UP'})});expect(pushNotification).toHaveBeenCalledTimes(1)})
test('unique dedupe key absorbs simultaneous poll/worker delivery',async()=>{mock(prisma.notification.create).mockRejectedValue({code:'P2002'});await expect(readLiveTracking({},'parent')).resolves.toHaveLength(1);expect(pushNotification).not.toHaveBeenCalled()})
test('stale GPS cannot trigger an arrival alert',async()=>{mock(trackingService.getLiveLocation).mockResolvedValue({lat:3,lng:101,speed_kmh:30,timestamp:new Date(Date.now()-120000).toISOString()});const result=await readLiveTracking({},'parent');expect(result[0].fresh).toBe(false);expect(result[0].targets[0].etaMins).toBeNull();expect(prisma.notification.create).not.toHaveBeenCalled()})
test('stationary bus does not invent a moving ETA',async()=>{mock(trackingService.getLiveLocation).mockResolvedValue({lat:3,lng:101,speed_kmh:0,timestamp:new Date().toISOString()});const result=await readLiveTracking({},'parent');expect(result[0].targets[0].etaMins).toBeNull();expect(prisma.notification.create).not.toHaveBeenCalled()})
test('a different parent receives no student target or notification',async()=>{const result=await readLiveTracking({},'unrelated');expect(result[0].targets).toEqual([]);expect(prisma.notification.create).not.toHaveBeenCalled()})
