import {NextResponse} from 'next/server'
import prisma from '@/lib/prisma'
import {getCurrentUser,resolveUserOrganizationId} from '@/lib/authorization'

export const dynamic='force-dynamic'

export async function GET(){
  const actor=await getCurrentUser()
  if(!actor)return NextResponse.json({error:'Unauthorized'},{status:401})
  const select={id:true,name:true,role:true,email:true,personnelType:true} as const
  if(['PARENT','DRIVER'].includes(actor.role)){
    const organizationId=await resolveUserOrganizationId(actor.id)
    if(!organizationId)return NextResponse.json({contacts:[]})
    const team=await prisma.user.findMany({where:{organizationId,isActive:true,role:{in:['SCHOOL_ADMIN','ADMIN']}},select,orderBy:[{role:'desc'},{name:'asc'}]})
    return NextResponse.json({contacts:team.length?[{...team[0],name:'School transport team',team:true}]:[]})
  }
  if(['ADMIN','SCHOOL_ADMIN'].includes(actor.role)){
    const contacts=actor.organizationId?await prisma.user.findMany({where:{organizationId:actor.organizationId,isActive:true,role:{in:['PARENT','DRIVER']}},select,orderBy:[{role:'asc'},{name:'asc'}]}):[]
    if(actor.role==='SCHOOL_ADMIN')contacts.push(...await prisma.user.findMany({where:{role:'SUPER_ADMIN',isActive:true},select,orderBy:{name:'asc'}}))
    return NextResponse.json({contacts})
  }
  if(actor.role==='SUPER_ADMIN')return NextResponse.json({contacts:await prisma.user.findMany({where:{role:'SCHOOL_ADMIN',isActive:true},select:{...select,organization:{select:{name:true}}},orderBy:{name:'asc'}})})
  return NextResponse.json({contacts:[]})
}
