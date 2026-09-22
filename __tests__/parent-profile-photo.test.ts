import {NextRequest} from 'next/server'

jest.mock('@/lib/auth',()=>({getUserFromSession:jest.fn()}))
jest.mock('@/lib/prisma',()=>({__esModule:true,default:{user:{findUnique:jest.fn(),update:jest.fn()}}}))
import prisma from '@/lib/prisma'
import {getUserFromSession} from '@/lib/auth'
import {PATCH} from '@/app/api/account/profile/route'

const mock=(value:unknown)=>value as jest.Mock
const base={id:'parent',role:'PARENT',name:'Parent User',phone:'+60123456789',address:'Home address',emergencyContactName:'Emergency User',emergencyContactPhone:'+60111222333',relationship:'Mother',photoUrl:null}
beforeEach(()=>{jest.resetAllMocks();mock(getUserFromSession).mockResolvedValue({id:'parent',role:'PARENT'});mock(prisma.user.findUnique).mockResolvedValue(base);mock(prisma.user.update).mockImplementation(({data})=>Promise.resolve({...base,...data,profileCompleted:true}))})
const request=(photoUrl:unknown)=>new NextRequest('http://localhost/api/account/profile',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({...base,photoUrl})})

test('parent onboarding stores a validated compressed profile photo',async()=>{
 const photoUrl=`data:image/webp;base64,${Buffer.from('valid-image-bytes').toString('base64')}`
 const response=await PATCH(request(photoUrl))
 expect(response.status).toBe(200)
 expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({photoUrl,profileCompleted:true})}))
})

test.each(['https://example.com/photo.jpg','data:image/svg+xml;base64,PHN2Zz4=','not-an-image'])('parent onboarding rejects unsafe photo value %s',async photoUrl=>{
 const response=await PATCH(request(photoUrl))
 expect(response.status).toBe(400)
 expect(prisma.user.update).not.toHaveBeenCalled()
})
