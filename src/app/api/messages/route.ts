import { NextRequest, NextResponse } from 'next/server'
import type { Prisma } from '@prisma/client'
import prisma from '@/lib/prisma'
import { pushNotification } from '@/lib/notification-delivery'
import { getUserFromSession } from '@/lib/auth'
import { resolveUserOrganizationId } from '@/lib/authorization'

export const dynamic = 'force-dynamic'
const STAFF = ['ADMIN', 'SCHOOL_ADMIN']
const SCHOOL_CONTACTS = ['PARENT', 'DRIVER']
type Actor = {id:string;role:string;organizationId?:string|null}
type MessageAccess = {id:string;senderId:string;recipientId:string;organizationId:string|null;threadUserId:string|null}

async function canSeeMessage(user:Actor,message:MessageAccess){
  if(message.senderId===user.id||message.recipientId===user.id)return true
  if(!STAFF.includes(user.role)||!message.organizationId||!message.threadUserId)return false
  return (user.organizationId||await resolveUserOrganizationId(user.id))===message.organizationId
}
function visibilityWhere(user:Actor,organizationId:string|null):Prisma.MessageWhereInput{
  const visible:Prisma.MessageWhereInput[]=[{senderId:user.id},{recipientId:user.id}]
  if(STAFF.includes(user.role)&&organizationId)visible.push({organizationId,threadUserId:{not:null}})
  return {AND:[{deletions:{none:{userId:user.id}}},{OR:visible}]}
}

export async function GET(){
  try{
    const user=await getUserFromSession();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401})
    const messages=await prisma.message.findMany({where:visibilityWhere(user,await resolveUserOrganizationId(user.id)),orderBy:{createdAt:'asc'},include:{sender:{select:{id:true,name:true,role:true}},recipient:{select:{id:true,name:true,role:true}},threadUser:{select:{id:true,name:true,role:true}},organization:{select:{id:true,name:true}}}})
    return NextResponse.json({messages})
  }catch(error){console.error('Messages GET Error:',error);return NextResponse.json({error:'Internal server error'},{status:500})}
}

export async function PATCH(request:NextRequest){
  try{
    const user=await getUserFromSession();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401})
    const {id}=await request.json().catch(()=>({}));if(typeof id!=='string')return NextResponse.json({error:'Message ID required'},{status:400})
    const message=await prisma.message.findUnique({where:{id},select:{id:true,senderId:true,recipientId:true,organizationId:true,threadUserId:true}})
    if(!message||!await canSeeMessage(user,message))return NextResponse.json({error:'Not found'},{status:404})
    await prisma.message.update({where:{id},data:{read:true}});return NextResponse.json({success:true})
  }catch(error){console.error('Messages PATCH Error:',error);return NextResponse.json({error:'Internal server error'},{status:500})}
}

export async function POST(request:NextRequest){
  try{
    const user=await getUserFromSession();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401})
    const data=await request.json().catch(()=>({})),content=typeof data.content==='string'?data.content.trim():''
    if(typeof data.recipientId!=='string'||!content||content.length>2000)return NextResponse.json({error:'Message must include a recipient and 1–2000 characters'},{status:400})
    const [senderOrganizationId,recipient,recipientOrganizationId]=await Promise.all([resolveUserOrganizationId(user.id),prisma.user.findUnique({where:{id:data.recipientId},select:{id:true,name:true,role:true,isActive:true}}),resolveUserOrganizationId(data.recipientId)])
    if(!recipient?.isActive)return NextResponse.json({error:'Invalid or inactive recipient'},{status:400})
    let organizationId:string|null=null,threadUserId:string|null=null
    if(SCHOOL_CONTACTS.includes(user.role)){
      if(!STAFF.includes(recipient.role)||!senderOrganizationId||senderOrganizationId!==recipientOrganizationId)return NextResponse.json({error:'Parents and drivers can message only their school transport team'},{status:403})
      organizationId=senderOrganizationId;threadUserId=user.id
    }else if(STAFF.includes(user.role)&&SCHOOL_CONTACTS.includes(recipient.role)){
      if(!senderOrganizationId||senderOrganizationId!==recipientOrganizationId)return NextResponse.json({error:'Recipient belongs to another school'},{status:403})
      organizationId=senderOrganizationId;threadUserId=recipient.id
    }else{
      const allowed=(user.role==='SCHOOL_ADMIN'&&recipient.role==='SUPER_ADMIN')||(user.role==='SUPER_ADMIN'&&recipient.role==='SCHOOL_ADMIN')
      if(!allowed)return NextResponse.json({error:'This conversation is not allowed'},{status:403})
    }
    const result=await prisma.$transaction(async tx=>{
      const message=await tx.message.create({data:{senderId:user.id,recipientId:recipient.id,content,organizationId,threadUserId},include:{sender:{select:{id:true,name:true,role:true}},recipient:{select:{id:true,name:true,role:true}},threadUser:{select:{id:true,name:true,role:true}},organization:{select:{id:true,name:true}}}})
      const targets=organizationId&&SCHOOL_CONTACTS.includes(user.role)?await tx.user.findMany({where:{organizationId,role:{in:STAFF},isActive:true},select:{id:true}}):[{id:recipient.id}]
      await tx.notification.createMany({data:targets.filter(target=>target.id!==user.id).map(target=>({userId:target.id,title:`Message from ${message.sender.name}`,body:content,type:'MESSAGE',dedupeKey:`message:${message.id}:${target.id}`,metadata:JSON.stringify({messageId:message.id,threadUserId})}))})
      return {message,notifications:await tx.notification.findMany({where:{dedupeKey:{startsWith:`message:${message.id}:`}}})}
    })
    await Promise.allSettled(result.notifications.map(notification=>pushNotification(notification)))
    return NextResponse.json({message:result.message},{status:201})
  }catch(error){console.error('Messages POST Error:',error);return NextResponse.json({error:'Internal server error'},{status:500})}
}

export async function DELETE(request:NextRequest){
  const user=await getUserFromSession();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401})
  const {id}=await request.json().catch(()=>({}));if(typeof id!=='string')return NextResponse.json({error:'Message ID required'},{status:400})
  const message=await prisma.message.findUnique({where:{id},select:{id:true,senderId:true,recipientId:true,organizationId:true,threadUserId:true}})
  if(!message||!await canSeeMessage(user,message))return NextResponse.json({error:'Not found'},{status:404})
  const deletion=(prisma as unknown as {messageDeletion?:{upsert:(args:unknown)=>Promise<unknown>}}).messageDeletion
  if(deletion)await deletion.upsert({where:{messageId_userId:{messageId:id,userId:user.id}},create:{messageId:id,userId:user.id},update:{}})
  else await prisma.message.update({where:{id},data:{...(message.senderId===user.id?{senderDeletedAt:new Date()}:{recipientDeletedAt:new Date()})}})
  return NextResponse.json({success:true})
}
