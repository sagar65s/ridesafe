import { NextRequest } from 'next/server'
jest.mock('@/lib/live-tracking',()=>({readLiveTracking:jest.fn()}))
import {readLiveTracking} from '@/lib/live-tracking'
import {GET} from '@/app/api/internal/tracking/route'
const saved=process.env.TRACKING_WORKER_SECRET
beforeEach(()=>{process.env.TRACKING_WORKER_SECRET='worker-test-secret-with-at-least-32-characters';jest.clearAllMocks()})
afterAll(()=>{if(saved===undefined)delete process.env.TRACKING_WORKER_SECRET;else process.env.TRACKING_WORKER_SECRET=saved})
test('missing worker secret fails closed without loading tracking data',async()=>{delete process.env.TRACKING_WORKER_SECRET;expect((await GET(new NextRequest('http://localhost/api/internal/tracking'))).status).toBe(401);expect(readLiveTracking).not.toHaveBeenCalled()})
test('wrong bearer cannot access tracking',async()=>{expect((await GET(new NextRequest('http://localhost/api/internal/tracking',{headers:{authorization:'Bearer wrong'}}))).status).toBe(401);expect(readLiveTracking).not.toHaveBeenCalled()})
test('valid worker bearer evaluates hardware trips',async()=>{(readLiveTracking as jest.Mock).mockResolvedValue([]);const response=await GET(new NextRequest('http://localhost/api/internal/tracking',{headers:{authorization:`Bearer ${process.env.TRACKING_WORKER_SECRET}`}}));expect(response.status).toBe(200);expect(await response.json()).toEqual({checked:0})})
test('misconfigured services return a safe retryable error',async()=>{(readLiveTracking as jest.Mock).mockRejectedValue(new Error('secret database details'));const spy=jest.spyOn(console,'error').mockImplementation(()=>{});try{const response=await GET(new NextRequest('http://localhost/api/internal/tracking',{headers:{authorization:`Bearer ${process.env.TRACKING_WORKER_SECRET}`}}));expect(response.status).toBe(503);expect(JSON.stringify(await response.json())).not.toContain('secret database details')}finally{spy.mockRestore()}})
