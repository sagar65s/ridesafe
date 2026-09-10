import {NextResponse} from 'next/server'
import {getUserFromSession} from '@/lib/auth'
async function immutableRecord() {
  const user = await getUserFromSession()
  if (!user) return NextResponse.json({error:'Unauthorized'},{status:401})
  return NextResponse.json({error:'Attendance is a dated event record. Record boarding and drop-off from the assigned crew workspace.'},{status:405})
}
export const PATCH = immutableRecord
export const DELETE = immutableRecord
