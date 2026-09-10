import { PrismaClient } from '@prisma/client'
const prisma=new PrismaClient()
try {
 const students=await prisma.student.findMany({where:{isActive:true,isSelfPickup:false},include:{parent:{select:{organizationId:true,role:true,isActive:true}},bus:{select:{organizationId:true,routeId:true}},route:{select:{organizationId:true}},pickupStop:{select:{routeId:true}},dropoffStop:{select:{routeId:true}}}})
 let count=0
 for(const s of students){const issues=[]
  if(!s.organizationId)issues.push('school missing')
  if(!s.bus || !s.route || s.bus.routeId!==s.routeId)issues.push('bus/route missing or mismatched')
  if(!s.parent?.isActive || s.parent.role!=='PARENT' || s.parent.organizationId!==s.organizationId)issues.push('parent missing, inactive or wrong school')
  if(!s.pickupStop || !s.dropoffStop || s.pickupStop.routeId!==s.routeId || s.dropoffStop.routeId!==s.routeId)issues.push('pickup/drop-off stop missing or wrong route')
  if(s.bus && s.bus.organizationId!==s.organizationId || s.route && s.route.organizationId!==s.organizationId)issues.push('bus/route school mismatch')
  if(issues.length){count++;console.log(`${s.id}: ${issues.join('; ')}`)}
 }
 console.log(`${students.length} active bus students checked; ${count} need assignment updates. No data changed.`)
 if(count)process.exitCode=1
}catch{console.error('Cannot check transport assignments. Verify DATABASE_URL and apply migrations first.');process.exitCode=1}finally{await prisma.$disconnect()}
