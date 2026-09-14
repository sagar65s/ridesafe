import {NextRequest,NextResponse} from 'next/server'
import prisma from '@/lib/prisma'
import {getCurrentUser} from '@/lib/authorization'
import {parseImportDate,readTabularFile} from '@/lib/tabular-import'
import {writeAuditLog} from '@/lib/audit'

export const runtime='nodejs'
const actionFor=(value:string)=>{const key=value.trim().toUpperCase().replace(/[\s-]+/g,'_');return ({PICKED:'PICKED_UP',BOARDED:'PICKED_UP',ON_BOARD:'PICKED_UP',DROPPED:'DROPPED_OFF',DROPPED_OFF:'DROPPED_OFF',ABSENT:'ABSENT'} as Record<string,string>)[key]||key}

export async function POST(request:NextRequest){
  const actor=await getCurrentUser()
  if(!actor||!['SUPER_ADMIN','SCHOOL_ADMIN'].includes(actor.role))return NextResponse.json({error:'Only Super Admin and School Admin can import attendance'},{status:403})
  try{
    const form=await request.formData(),file=form.get('file')
    if(!(file instanceof File))return NextResponse.json({error:'Choose an attendance Excel or CSV file'},{status:400})
    const requested=String(form.get('organizationId')||''),organizationId=actor.role==='SUPER_ADMIN'?requested:actor.organizationId
    if(!organizationId)return NextResponse.json({error:'Select a school before importing attendance'},{status:400})
    if(actor.role!=='SUPER_ADMIN'&&requested&&requested!==organizationId)return NextResponse.json({error:'Forbidden'},{status:403})
    const {rows}=await readTabularFile(file,{rows:5000,columns:40})
    const [trips,students]=await Promise.all([
      prisma.trip.findMany({where:{route:{organizationId}},include:{route:true,bus:true}}),
      prisma.student.findMany({where:{organizationId},select:{id:true,name:true,routeId:true,busId:true,pickupStopId:true,dropoffStopId:true}}),
    ])
    const records:{tripId:string;studentId:string;stopId:string|null;action:string;timestamp:Date;recordedById:string;dedupeKey:string}[]=[]
    const errors:{row:number;error:string}[]=[]
    for(const row of rows){
      const status=actionFor(row.value('Status','Attendance Status'))
      if(!status||['NOT_MARKED','NOTMARKED',''].includes(status))continue
      if(!['PICKED_UP','DROPPED_OFF','ABSENT'].includes(status)){errors.push({row:row.row,error:'Unsupported status'});continue}
      const day=parseImportDate(row.value('Date'),row.row),session=(row.value('Session','Service Type')||'MORNING').toUpperCase().replace('AFTERNOON','PM')
      const routeText=row.value('Route','Route Name'),busText=row.value('Bus','Bus Number','Bus Plate'),studentText=row.value('Student','Student Name').replace(/\s+\([^)]*\)$/,'').trim()
      const trip=trips.find(item=>item.date.toLocaleDateString('en-CA',{timeZone:'Asia/Kuala_Lumpur'})===day.toLocaleDateString('en-CA',{timeZone:'Asia/Kuala_Lumpur'})&&item.serviceType===session&&(!routeText||item.route.name.toLowerCase()===routeText.toLowerCase())&&(!busText||[item.bus?.busNumber,item.bus?.plateNumber].some(value=>value?.toLowerCase()===busText.toLowerCase())))
      if(!trip){errors.push({row:row.row,error:'Matching trip was not found'});continue}
      const student=students.find(item=>item.name.toLowerCase()===studentText.toLowerCase()&&item.routeId===trip.routeId&&item.busId===trip.busId)
      if(!student){errors.push({row:row.row,error:'Assigned student was not found'});continue}
      const time=/^\d{1,2}:\d{2}$/.test(row.value('Time'))?row.value('Time'):'12:00',timestamp=new Date(`${day.toLocaleDateString('en-CA',{timeZone:'Asia/Kuala_Lumpur'})}T${time}:00+08:00`)
      const actions=status==='DROPPED_OFF'?['PICKED_UP','DROPPED_OFF']:[status]
      for(const action of actions)records.push({tripId:trip.id,studentId:student.id,stopId:action==='DROPPED_OFF'?student.dropoffStopId:student.pickupStopId,action,timestamp,recordedById:actor.id,dedupeKey:`attendance-import:${trip.id}:${student.id}:${action}`})
    }
    const created=records.length?await prisma.attendance.createMany({data:records,skipDuplicates:true}):{count:0}
    if(created.count)await writeAuditLog({actorId:actor.id,organizationId,action:'IMPORT',entityType:'ATTENDANCE',details:{created:created.count,skipped:errors.length,fileName:file.name}})
    return NextResponse.json({created:created.count,skipped:errors.length,errors:errors.slice(0,50)})
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Attendance import failed'},{status:400})}
}
