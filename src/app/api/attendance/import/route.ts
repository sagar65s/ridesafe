import {NextRequest,NextResponse} from 'next/server'
import prisma from '@/lib/prisma'
import {getCurrentUser} from '@/lib/authorization'
import {parseImportDate,readTabularFile} from '@/lib/tabular-import'
import {writeAuditLog} from '@/lib/audit'
import {createHash} from 'node:crypto'
import {ARCHIVE_MIGRATION_ERROR,isArchiveTableMissing} from '@/lib/attendance-archive'

export const runtime='nodejs'
const actionFor=(value:string)=>{const key=value.trim().toUpperCase().replace(/[\s-]+/g,'_');return ({PICKED:'PICKED_UP',BOARDED:'PICKED_UP',ON_BOARD:'PICKED_UP',DROPPED:'DROPPED_OFF',DROPPED_OFF:'DROPPED_OFF',ABSENT:'ABSENT',NOTMARKED:'NOT_MARKED'} as Record<string,string>)[key]||key}
const serviceFor=(value:string)=>{const key=(value||'MORNING').trim().toUpperCase().replace(/[\s-]+/g,'_');return ({AFTERNOON:'PM',AFTER_SCHOOL_ACTIVITY:'AFTER_SCHOOL',AFTERSCHOOL:'AFTER_SCHOOL'} as Record<string,string>)[key]||key}
const normalized=(value:string|null|undefined)=>(value||'').trim().toLowerCase()
const archiveIdentity=(item:{date:Date;session:string;studentCode:string|null;studentName:string;routeName:string|null;busLabel:string|null})=>JSON.stringify([
  item.date.toLocaleDateString('en-CA',{timeZone:'Asia/Kuala_Lumpur'}),item.session,
  item.studentCode?`code:${normalized(item.studentCode)}`:`name:${normalized(item.studentName)}`,
  normalized(item.routeName),normalized(item.busLabel),
])

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
    const parsedDays=new Map<number,Date>()
    for(const row of rows){if(row.value('Status','Attendance Status').trim())parsedDays.set(row.row,parseImportDate(row.value('Date'),row.row))}
    const dayValues=[...parsedDays.values()].map(day=>day.getTime())
    const firstDay=dayValues.length?new Date(Math.min(...dayValues)):null
    const afterLastDay=dayValues.length?new Date(Math.max(...dayValues)+24*60*60*1000):null
    const [trips,students]=await Promise.all([
      prisma.trip.findMany({where:{route:{organizationId},...(firstDay&&afterLastDay?{date:{gte:firstDay,lt:afterLastDay}}:{id:'__no_import_rows__'})},include:{route:true,bus:true}}),
      prisma.student.findMany({where:{organizationId},select:{id:true,name:true,studentCode:true,routeId:true,busId:true,pickupStopId:true,dropoffStopId:true}}),
    ])
    const records=new Map<string,{tripId:string;studentId:string;stopId:string|null;action:string;timestamp:Date;recordedById:string;dedupeKey:string}>()
    const archived=new Map<string,{organizationId:string;sourceKey:string;date:Date;session:string;status:string;studentName:string;studentCode:string|null;matchedStudentId:string|null;routeName:string|null;busLabel:string|null;time:string|null;sourceFile:string;importedById:string}>()
    const errors:{row:number;error:string}[]=[]
    const warnings:{row:number;error:string}[]=[]
    const affectedDates=new Set<string>()
    for(const row of rows){
      const status=actionFor(row.value('Status','Attendance Status'))
      if(!status)continue
      if(!['PICKED_UP','DROPPED_OFF','ABSENT','NOT_MARKED'].includes(status)){errors.push({row:row.row,error:'Unsupported status'});continue}
      const day=parsedDays.get(row.row)!,session=serviceFor(row.value('Session','Service Type'))
      affectedDates.add(day.toLocaleDateString('en-CA',{timeZone:'Asia/Kuala_Lumpur'}))
      if(!['MORNING','PM','AFTER_SCHOOL'].includes(session)){errors.push({row:row.row,error:'Unsupported service type'});continue}
      const routeText=row.value('Route','Route Name'),busText=row.value('Bus','Bus Number','Bus Plate'),studentCode=row.value('Student ID','Student Code'),studentText=row.value('Student','Student Name').replace(/\s+\([^)]*\)$/,'').trim()
      if(!studentText&&!studentCode){errors.push({row:row.row,error:'Student name or Student ID required'});continue}
      const trip=trips.find(item=>item.date.toLocaleDateString('en-CA',{timeZone:'Asia/Kuala_Lumpur'})===day.toLocaleDateString('en-CA',{timeZone:'Asia/Kuala_Lumpur'})&&item.serviceType===session&&(!routeText||item.route.name.toLowerCase()===routeText.toLowerCase())&&(!busText||[item.bus?.busNumber,item.bus?.plateNumber].some(value=>value?.toLowerCase()===busText.toLowerCase())))
      const candidates=students.filter(item=>studentCode?item.studentCode?.toLowerCase()===studentCode.toLowerCase():item.name.toLowerCase()===studentText.toLowerCase())
      const student=trip?candidates.find(item=>item.routeId===trip.routeId&&item.busId===trip.busId):null
      if(!trip||!student){
        const reason=!trip?'No matching recorded trip':'Student is not assigned to the matching trip'
        const date=day.toLocaleDateString('en-CA',{timeZone:'Asia/Kuala_Lumpur'})
        const time=row.value('Time').trim()
        const sourceKey=createHash('sha256').update(JSON.stringify([date,session,studentCode?`code:${studentCode.toLowerCase()}`:`name:${studentText.toLowerCase()}`,routeText.toLowerCase(),busText.toLowerCase()])).digest('hex')
        archived.set(sourceKey,{organizationId,sourceKey,date:day,session,status,studentName:studentText||studentCode,studentCode:studentCode||null,matchedStudentId:candidates.length===1?candidates[0].id:null,routeName:routeText||null,busLabel:busText||null,time:time||null,sourceFile:file.name.slice(0,200),importedById:actor.id})
        warnings.push({row:row.row,error:`${reason}; shown as imported history, not crew-confirmed bus attendance`})
        continue
      }
      const timeText=row.value('Time').trim(),parts=/^(\d{1,2}):(\d{2})$/.exec(timeText)
      if(timeText&&(!parts||Number(parts[1])>23||Number(parts[2])>59)){errors.push({row:row.row,error:'Use a valid Time in HH:mm format'});continue}
      const time=parts?`${parts[1].padStart(2,'0')}:${parts[2]}`:'12:00'
      const timestamp=new Date(`${day.toLocaleDateString('en-CA',{timeZone:'Asia/Kuala_Lumpur'})}T${time}:00+08:00`)
      const dedupeKey=`attendance-import:${trip.id}:${student.id}`
      records.set(dedupeKey,{tripId:trip.id,studentId:student.id,stopId:status==='DROPPED_OFF'?student.dropoffStopId:status==='PICKED_UP'?student.pickupStopId:null,action:status,timestamp,recordedById:actor.id,dedupeKey})
    }
    // Check the new table before writing live rows. An older Vercel database
    // must not leave a half-imported file when both row types are present.
    if(archived.size)await prisma.attendanceImportRecord.count({where:{organizationId,sourceKey:'__archive_schema_check__'}})
    const {created,updated,historical,historicalUpdated,duplicates}=await prisma.$transaction(async tx=>{
      const liveRows=[...records.values()],archiveRows=[...archived.values()]
      const archiveDates=archiveRows.map(item=>item.date.getTime())
      const archiveStart=archiveDates.length?new Date(Math.min(...archiveDates)):null
      const archiveEnd=archiveDates.length?new Date(Math.max(...archiveDates)+24*60*60*1000):null
      const [existingLive,existingArchive]=await Promise.all([
        liveRows.length?tx.attendance.findMany({where:{OR:liveRows.map(item=>({tripId:item.tripId,studentId:item.studentId,dedupeKey:{startsWith:`attendance-import:${item.tripId}:${item.studentId}`}}))},select:{id:true,tripId:true,studentId:true,dedupeKey:true,action:true,stopId:true,timestamp:true}}):[],
        archiveStart&&archiveEnd?tx.attendanceImportRecord.findMany({where:{organizationId,date:{gte:archiveStart,lt:archiveEnd}},select:{id:true,sourceKey:true,date:true,session:true,status:true,studentName:true,studentCode:true,routeName:true,busLabel:true,time:true,sourceFile:true}}):[],
      ])
      const liveByStudent=new Map(existingLive.map(item=>[`${item.tripId}:${item.studentId}`,item]))
      const archiveByIdentity=new Map(existingArchive.map(item=>[archiveIdentity(item),item]))
      let created=0,updated=0,historicalUpdated=0,duplicates=0
      const freshLive=[] as typeof liveRows
      for(const item of liveRows){
        const previous=liveByStudent.get(`${item.tripId}:${item.studentId}`)
        if(!previous){freshLive.push(item);continue}
        if(previous.action===item.action&&previous.stopId===item.stopId&&previous.timestamp.getTime()===item.timestamp.getTime()){duplicates++;continue}
        await tx.attendance.update({where:{id:previous.id},data:{action:item.action,stopId:item.stopId,timestamp:item.timestamp,recordedById:item.recordedById}})
        updated++
      }
      if(freshLive.length)created=(await tx.attendance.createMany({data:freshLive,skipDuplicates:true})).count
      duplicates+=freshLive.length-created
      const freshArchive=[] as typeof archiveRows
      for(const item of archiveRows){
        const previous=archiveByIdentity.get(archiveIdentity(item))
        if(!previous){freshArchive.push(item);continue}
        if(previous.status===item.status&&previous.time===item.time&&previous.sourceFile===item.sourceFile){duplicates++;continue}
        await tx.attendanceImportRecord.update({where:{id:previous.id},data:{status:item.status,time:item.time,studentName:item.studentName,studentCode:item.studentCode,matchedStudentId:item.matchedStudentId,routeName:item.routeName,busLabel:item.busLabel,sourceFile:item.sourceFile,importedById:item.importedById,createdAt:new Date()}})
        historicalUpdated++
      }
      const historical=freshArchive.length?(await tx.attendanceImportRecord.createMany({data:freshArchive,skipDuplicates:true})).count:0
      duplicates+=freshArchive.length-historical
      return {created,updated,historical,historicalUpdated,duplicates}
    },{timeout:30000,maxWait:10000})
    if(created||updated||historical||historicalUpdated)try{await writeAuditLog({actorId:actor.id,organizationId,action:'IMPORT',entityType:'ATTENDANCE',details:{created,updated,archived:historical,archivedUpdated:historicalUpdated,skipped:errors.length,fileName:file.name}})}catch(auditError){console.error('Attendance import succeeded but audit delivery failed:',auditError)}
    return NextResponse.json({created,updated,archived:historical,archivedUpdated:historicalUpdated,viewDate:[...affectedDates][0]||null,affectedDates:[...affectedDates],skipped:errors.length,duplicates,errors:errors.slice(0,50),warnings:warnings.slice(0,50)})
  }catch(error){
    if(isArchiveTableMissing(error))return NextResponse.json({error:ARCHIVE_MIGRATION_ERROR,code:'MIGRATION_REQUIRED'},{status:503})
    if(error instanceof Error&&(/Invalid date on row|Choose a file|Use Excel|Use one header|Formulas are not accepted|\.xlsx|\.csv|Workbook|row \d+/.test(error.message)))return NextResponse.json({error:error.message},{status:400})
    console.error('Attendance import failed:',error)
    return NextResponse.json({error:'Unable to import attendance. Check the file and the school assignments, then try again.'},{status:500})
  }
}
