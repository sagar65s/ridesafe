import {NextRequest} from 'next/server'

jest.mock('@/lib/auth',()=>({getUserFromSession:jest.fn()}))
jest.mock('@/lib/authorization',()=>({resolveUserOrganizationId:jest.fn()}))
jest.mock('@/lib/notification-delivery',()=>({pushNotification:jest.fn()}))
jest.mock('@/lib/prisma',()=>({__esModule:true,default:{message:{findMany:jest.fn(),findUnique:jest.fn(),update:jest.fn()},notification:{findMany:jest.fn(),updateMany:jest.fn()}}}))
import prisma from '@/lib/prisma'
import {getUserFromSession} from '@/lib/auth'
import {resolveUserOrganizationId} from '@/lib/authorization'
import {GET,PATCH} from '@/app/api/messages/route'
const asMock=(value:unknown)=>value as jest.Mock
beforeEach(()=>{
  jest.resetAllMocks()
  asMock(getUserFromSession).mockResolvedValue({id:'admin',role:'ADMIN',organizationId:'school-a'})
  asMock(resolveUserOrganizationId).mockResolvedValue('school-a')
  asMock(prisma.message.findMany).mockResolvedValue([{id:'message-a',senderId:'parent',recipientId:'school-admin',organizationId:'school-a',threadUserId:'parent',read:true}])
  asMock(prisma.notification.findMany).mockResolvedValue([{dedupeKey:'message:message-a:admin',read:false}])
  asMock(prisma.message.findUnique).mockResolvedValue({id:'message-a',senderId:'parent',recipientId:'school-admin',organizationId:'school-a',threadUserId:'parent'})
})

test('Admin sees their own unread receipt even if School Admin has already read the shared message',async()=>{
  expect((await (await GET()).json()).messages[0].read).toBe(false)
})
test('Admin marking shared chat read only updates their own notification, not School Admin or the global message flag',async()=>{
  const request=new NextRequest('http://localhost/api/messages',{method:'PATCH',body:JSON.stringify({id:'message-a'})})
  expect((await PATCH(request)).status).toBe(200)
  expect(prisma.notification.updateMany).toHaveBeenCalledWith({where:{userId:'admin',type:'MESSAGE',dedupeKey:'message:message-a:admin'},data:{read:true}})
  expect(prisma.message.update).not.toHaveBeenCalled()
})
