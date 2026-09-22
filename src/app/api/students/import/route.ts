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
      prisma.student.findMany({where:{organizationId},select:{id:true,studentCode:true,name:true,grade:true,className:true}}),
    ])
    const seen=new Set(existing.map(item=>`${item.studentCode||''}|${item.name.toLowerCase()}|${item.grade.toLowerCase()}|${(item.className||'').toLowerCase()}`))
    const prepared:Prisma.StudentCreateManyInput[]=[]
    const updates:{id:string;data:Prisma.StudentUncheckedUpdateInput}[]=[]
    const importedCodes=new Set<string>()
    const errors:{row:number;error:string}[]=[]
    const warnings:{row:number;error:string}[]=[]
    for(const row of rows){
      const name=row.value('Student Name','Name'),grade=row.value('Year','Grade'),className=row.value('Class','Class Name'),studentCode=row.value('Student ID','Student Code')||null
      if(!name||!grade){errors.push({row:row.row,error:'Student Name and Year/Grade are required'});continue}
      if(studentCode&&importedCodes.has(studentCode.toLowerCase())){errors.push({row:row.row,error:'Student ID occurs more than once in this file'});continue}
      if(studentCode)importedCodes.add(studentCode.toLowerCase())
      const duplicateKey=`${studentCode||''}|${name.toLowerCase()}|${grade.toLowerCase()}|${className.toLowerCase()}`
      const matchingStudent=studentCode?existing.find(item=>item.studentCode?.toLowerCase()===studentCode.toLowerCase()):undefined
      if(!matchingStudent&&seen.has(duplicateKey)){errors.push({row:row.row,error:'Duplicate student skipped; supply a Student ID to update an existing record'});continue}
      const product=row.value('Product'),routeName=row.value('Route','Route Name')||product.split(/\s*-\s*T\d/i)[0].trim()
      const route=routes.find(item=>item.name.toLowerCase()===routeName.toLowerCase())||routes.find(item=>routeName&&item.name.toLowerCase().includes(routeName.toLowerCase()))
      const busText=row.value('Bus','Bus Number','Bus Plate'),bus=buses.find(item=>[item.id,item.busNumber,item.plateNumber].some(value=>value?.toLowerCase()===busText.toLowerCase()))
      const parentText=row.value('Parent Email','Guardian Email','Parent'),parent=parents.find(item=>item.email.toLowerCase()===parentText.toLowerCase()||item.name.toLowerCase()===parentText.toLowerCase())
      const pickup=row.value('Pickup Stop'),dropoff=row.value('Dropoff Stop','Drop-off Stop')
      const pickupStop=route?.stops.find(item=>item.name.toLowerCase()===pickup.toLowerCase()),dropoffStop=route?.stops.find(item=>item.name.toLowerCase()===dropoff.toLowerCase())
      if(route&&bus&&bus.routeId&&bus.routeId!==route.id){errors.push({row:row.row,error:'Bus belongs to another route in this school'});continue}
      if(routeName&&!route)warnings.push({row:row.row,error:`Route "${routeName}" was not found; assign it before the trip`})
      if(busText&&!bus)warnings.push({row:row.row,error:`Bus "${busText}" was not found; assign it before the trip`})
      if(parentText&&!parent)warnings.push({row:row.row,error:`Parent "${parentText}" was not found; assign a school parent before the trip`})
      if(pickup&&!pickupStop)warnings.push({row:row.row,error:`Pickup stop "${pickup}" was not found on the route`})
      if(dropoff&&!dropoffStop)warnings.push({row:row.row,error:`Drop-off stop "${dropoff}" was not found on the route`})
      const pickupMode=row.value('Transport Mode','Pickup Method').toUpperCase(),selfPickupSession=['MORNING','PM','AFTER_SCHOOL'].includes(pickupMode)?pickupMode:null
      const data:Prisma.StudentCreateManyInput={name:name.slice(0,100),grade:grade.slice(0,30),level:(row.value('Level')||(/year\s*(?:7|8|9|10|11|12)/i.test(grade)?'High':'Primary')).slice(0,30),className:className.slice(0,30)||null,section:row.value('Section').slice(0,10)||null,studentCode:studentCode?.slice(0,50)||null,parentContact1:(row.value('Primary Contact','Parent Contact','Contact')||'NOT_PROVIDED').slice(0,20),parentContact2:row.value('Secondary Contact').slice(0,20)||null,organizationId,parentId:parent?.id||null,routeId:route?.id||null,busId:bus?.id||null,pickupStopId:pickupStop?.id||null,dropoffStopId:dropoffStop?.id||null,pickupAddress:row.value('Pickup Address').slice(0,300)||null,dropoffAddress:row.value('Dropoff Address','Drop-off Address').slice(0,300)||null,isSelfPickup:Boolean(selfPickupSession),selfPickupSession,status:'PENDING',isActive:row.value('Active').toLowerCase()!=='no'}
      if(matchingStudent){
        const {status: _initialStatus, organizationId: _school, ...values}=data
        void _initialStatus;void _school
        updates.push({id:matchingStudent.id,data:{...values,
          // Blank import cells must not erase existing verified assignments.
          parentContact1:row.value('Primary Contact','Parent Contact','Contact')?data.parentContact1:undefined,
          parentId:parentText&&parent?parent.id:undefined,
          routeId:routeName&&route?route.id:undefined,
          busId:busText&&bus?bus.id:undefined,
          pickupStopId:pickup&&pickupStop?pickupStop.id:undefined,
          dropoffStopId:dropoff&&dropoffStop?dropoffStop.id:undefined,
          isActive:row.value('Active')?data.isActive:undefined,
          isSelfPickup:row.value('Transport Mode','Pickup Method')?data.isSelfPickup:undefined,
          selfPickupSession:row.value('Transport Mode','Pickup Method')?data.selfPickupSession:undefined,
        }})
      }else prepared.push(data)
      seen.add(duplicateKey)
    }
    const created=prepared.length?await prisma.student.createMany({data:prepared,skipDuplicates:true}):{count:0}
    for(let index=0;index<updates.length;index+=50){
      await prisma.$transaction(updates.slice(index,index+50).map(item=>prisma.student.update({where:{id:item.id,organizationId},data:item.data})))
    }
    if(created.count||updates.length){
      const staff=await prisma.user.findMany({where:{organizationId,isActive:true,role:{in:['ADMIN','SCHOOL_ADMIN']}},select:{id:true}})
      await prisma.notification.createMany({data:staff.filter(item=>item.id!==actor.id).map(item=>({userId:item.id,title:'Student import completed',body:`${created.count} students added; ${updates.length} updated`,type:'STUDENT_IMPORT',dedupeKey:`student-import:${actor.id}:${Date.now()}:${item.id}`}))})
      await writeAuditLog({actorId:actor.id,organizationId,action:'IMPORT',entityType:'STUDENT',details:{created:created.count,updated:updates.length,skipped:errors.length+(prepared.length-created.count),warnings:warnings.length,fileName:file.name}})
    }
    return NextResponse.json({created:created.count,updated:updates.length,skipped:errors.length+(prepared.length-created.count),errors:errors.slice(0,50),warnings:warnings.slice(0,50)})
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Student import failed'},{status:400})}
}
