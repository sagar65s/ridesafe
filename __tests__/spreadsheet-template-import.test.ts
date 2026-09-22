import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readTabularFile, parseImportDate } from '@/lib/tabular-import'
import { parseCalendarFile } from '@/lib/calendar-import'

const template = (name: string) => new File([readFileSync(join(process.cwd(), 'public', 'templates', name))], name)

test.each(['students-import.xlsx', 'attendance-period.xlsx'])('bundled %s uploads with its headers and rows intact', async name => {
  const { headers, rows } = await readTabularFile(template(name))
  expect(headers).toContain(name.startsWith('students') ? 'studentname' : 'date')
  expect(rows.length).toBeGreaterThan(0)
  expect(rows[0].value(name.startsWith('students') ? 'Student Name' : 'Date')).toBeTruthy()
})

test('bundled academic calendar Excel dates upload as school-specific events', async () => {
  const events = await parseCalendarFile(template('academic-calendar.xlsx'), 'school-a')
  expect(events.length).toBeGreaterThan(0)
  expect(events[0].startDate).toBeInstanceOf(Date)
  expect(events.every(event => event.organizationId === 'school-a')).toBe(true)
})

test('rejects impossible DD/MM/YYYY dates rather than moving them into another month', () => {
  expect(() => parseImportDate('31/02/2026', 2)).toThrow('Invalid date on row 2')
})
