import {NextRequest,NextResponse} from 'next/server'
import prisma from '@/lib/prisma'
import {getCurrentUser} from '@/lib/authorization'
import {readTabularFile} from '@/lib/tabular-import'
import {writeAuditLog} from '@/lib/audit'
import type {Prisma} from '@prisma/client'

export const runtime='nodejs'

export async function POST(request:NextRequest){
  const actor=await getCurrentUser()
  if(!actor||!['SUPER_ADMIN','SCHOOL_ADMIN'].includes(actor.role))return NextResponse.json({error:'Only Super Admin and School Admin can import students'},{status:403})
  try{
    const form=await request.formData(),file=form.get('file')
    if(!(file instanceof File))return NextResponse.json({error:'Choose a student Excel or CSV file'},{status:400})
    const requested=String(form.get('organizationId')||''),organizationId=actor.role==='SUPER_ADMIN'?requested:actor.organizationId
    if(!organizationId)return NextResponse.json({error:'Select a school before importing students'},{status:400})
    if(actor.role!=='SUPER_ADMIN'&&requested&&requested!==organizationId)return NextResponse.json({error:'Forbidden'},{status:403})
    const organization=await prisma.organization.findFirst({where:{id:organizationId,isActive:true},select:{id:true}})
    if(!organization)return NextResponse.json({error:'Invalid or inactive school'},{status:400})
    const {rows}=await readTabularFile(file,{rows:3000,columns:40})
    const [routes,buses,parents,existing]=await Promise.all([
      prisma.route.findMany({where:{organizationId},include:{stops:true}}),
      prisma.bus.findMany({where:{organizationId}}),
      prisma.user.findMany({where:{organizationId,role:'PARENT',isActive:true},select:{id:true,email:true,name:true}}),
      prisma.student.findMany({where:{organizationId},select:{studentCode:true,name:true,grade:true,className:true}}),
    ])
    const seen=new Set(existing.map(item=>`${item.studentCode||''}|${item.name.toLowerCase()}|${item.grade.toLowerCase()}|${(item.className||'').toLowerCase()}`))
    const prepared:Prisma.StudentCreateManyInput[]=[]
    const errors:{row:number;error:string}[]=[]
    for(const row of rows){
      const name=row.value('Student Name','Name'),grade=row.value('Year','Grade'),className=row.value('Class','Class Name'),studentCode=row.value('Student ID','Student Code')||null
      if(!name||!grade){errors.push({row:row.row,error:'Student Name and Year/Grade are required'});continue}
      const duplicateKey=`${studentCode||''}|${name.toLowerCase()}|${grade.toLowerCase()}|${className.toLowerCase()}`
      if(seen.has(duplicateKey)){errors.push({row:row.row,error:'Duplicate student skipped'});continue}
      const product=row.value('Product'),routeName=row.value('Route','Route Name')||product.split(/\s*-\s*T\d/i)[0].trim()
      const route=routes.find(item=>item.name.toLowerCase()===routeName.toLowerCase())||routes.find(item=>routeName&&item.name.toLowerCase().includes(routeName.toLowerCase()))
      const busText=row.value('Bus','Bus Number','Bus Plate'),bus=buses.find(item=>[item.id,item.busNumber,item.plateNumber].some(value=>value?.toLowerCase()===busText.toLowerCase()))
      const parentText=row.value('Parent Email','Guardian Email','Parent'),parent=parents.find(item=>item.email.toLowerCase()===parentText.toLowerCase()||item.name.toLowerCase()===parentText.toLowerCase())
      const pickup=row.value('Pickup Stop'),dropoff=row.value('Dropoff Stop','Drop-off Stop')
      const pickupStop=route?.stops.find(item=>item.name.toLowerCase()===pickup.toLowerCase()),dropoffStop=route?.stops.find(item=>item.name.toLowerCase()===dropoff.toLowerCase())
      const pickupMode=row.value('Transport Mode','Pickup Method').toUpperCase(),selfPickupSession=['MORNING','PM','AFTER_SCHOOL'].includes(pickupMode)?pickupMode:null
      prepared.push({name:name.slice(0,100),grade:grade.slice(0,30),level:(row.value('Level')||(/year\s*(?:7|8|9|10|11|12)/i.test(grade)?'High':'Primary')).slice(0,30),className:className.slice(0,30)||null,section:row.value('Section').slice(0,10)||null,studentCode:studentCode?.slice(0,50)||null,parentContact1:(row.value('Primary Contact','Parent Contact','Contact')||'NOT_PROVIDED').slice(0,20),parentContact2:row.value('Secondary Contact').slice(0,20)||null,organizationId,parentId:parent?.id||null,routeId:route?.id||null,busId:bus?.id||null,pickupStopId:pickupStop?.id||null,dropoffStopId:dropoffStop?.id||null,pickupAddress:row.value('Pickup Address').slice(0,300)||null,dropoffAddress:row.value('Dropoff Address','Drop-off Address').slice(0,300)||null,isSelfPickup:Boolean(selfPickupSession),selfPickupSession,status:'PENDING',isActive:row.value('Active').toLowerCase()!=='no'})
      seen.add(duplicateKey)
    }
    const created=prepared.length?await prisma.student.createMany({data:prepared,skipDuplicates:true}):{count:0}
    if(created.count){
      const staff=await prisma.user.findMany({where:{organizationId,isActive:true,role:{in:['ADMIN','SCHOOL_ADMIN']}},select:{id:true}})
      await prisma.notification.createMany({data:staff.filter(item=>item.id!==actor.id).map(item=>({userId:item.id,title:'Student import completed',body:`${created.count} students were added`,type:'STUDENT_IMPORT',dedupeKey:`student-import:${actor.id}:${Date.now()}:${item.id}`}))})
      await writeAuditLog({actorId:actor.id,organizationId,action:'IMPORT',entityType:'STUDENT',details:{created:created.count,skipped:errors.length,fileName:file.name}})
    }
    return NextResponse.json({created:created.count,skipped:errors.length,errors:errors.slice(0,50)})
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Student import failed'},{status:400})}
}
