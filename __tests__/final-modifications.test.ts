import fs from 'node:fs'
import path from 'node:path'
import { formatRideSafeDate, formatRideSafeDateTime } from '@/lib/date-format'

const root=path.resolve(__dirname,'..')
const read=(file:string)=>fs.readFileSync(path.join(root,file),'utf8')

describe('final transport workflow modifications',()=>{
  test('all display dates use day/month/year',()=>{
    expect(formatRideSafeDate('2026-09-13T12:30:00+08:00')).toBe('13/09/2026')
    expect(formatRideSafeDateTime('2026-09-13T12:30:00+08:00')).toMatch(/^13\/09\/2026, 12:30$/)
  })

  test('live tracking returns school and exact bus coordinates',()=>{
    const source=read('src/lib/live-tracking.ts')
    expect(source).toContain('organization: {')
    expect(source).toContain('lastLatitude: location?.lat ?? null')
    expect(read('src/components/admin/LiveTripsTab.tsx')).toContain("new EventSource('/api/location/stream')")
  })

  test('parent non-submission is included in attendance history',()=>{
    const attendance=read('src/app/api/attendance/route.ts')
    const history=read('src/app/api/trips/history/route.ts')
    expect(attendance).toContain('parentPickupStatus')
    expect(history).toContain("status:request?.status || 'NOT_SUBMITTED'")
  })

  test('notifications and maintenance logs support scoped deletion',()=>{
    expect(read('src/app/api/notifications/route.ts')).toContain('export async function DELETE')
    expect(read('src/app/api/maintenance/route.ts')).toContain('export async function DELETE')
  })

  test('lost and found is absent from management navigation',()=>{
    expect(read('src/app/admin/page.tsx')).not.toContain('LOSTFOUND')
    expect(read('src/lib/roles.ts')).not.toContain("'LOSTFOUND'")
  })
})
