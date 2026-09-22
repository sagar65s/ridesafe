import { Workbook } from 'exceljs'
import { Readable } from 'node:stream'
import { excelJsCompatibleXlsx } from '@/lib/xlsx-compat'

export const EVENT_TYPES = ['HOLIDAY', 'FESTIVAL', 'WORKING_DAY', 'SPECIAL_HOLIDAY', 'EXAM', 'EVENT', 'TERM_START', 'TERM_END', 'ASSEMBLY']
// Inspect the ZIP directory before expanding an XLSX. Compressed size alone is insufficient.
export function validateWorkbookArchive(bytes: Buffer) {
  let end = -1
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) if (bytes.readUInt32LE(i) === 0x06054b50) { end = i; break }
  if (end < 0) throw new Error('Invalid Excel workbook')
  const entries = bytes.readUInt16LE(end + 10), directorySize = bytes.readUInt32LE(end + 12)
  let offset = bytes.readUInt32LE(end + 16), expanded = 0
  if (entries > 500 || offset + directorySize > bytes.length) throw new Error('Workbook is too complex')
  for (let i = 0; i < entries; i++) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid workbook directory')
    expanded += bytes.readUInt32LE(offset + 24)
    if (expanded > 20 * 1024 * 1024) throw new Error('Expanded workbook exceeds 20 MB')
    offset += 46 + bytes.readUInt16LE(offset + 28) + bytes.readUInt16LE(offset + 30) + bytes.readUInt16LE(offset + 32)
  }
}
export async function parseCalendarFile(file: File, organizationId: string | null) {
  if (file.size === 0 || file.size > 2 * 1024 * 1024) throw new Error('Choose a file up to 2 MB')
  const workbook = new Workbook()
  const bytes = Buffer.from(await file.arrayBuffer())
  if (/\.xlsx$/i.test(file.name)) {
    validateWorkbookArchive(bytes)
    await workbook.xlsx.load(await excelJsCompatibleXlsx(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0])
  } else if (/\.csv$/i.test(file.name)) {
    await workbook.csv.read(Readable.from(bytes.toString('utf8').replace(/^\uFEFF/, '')), { map: value => value })
  } else throw new Error('Use Excel (.xlsx) or CSV (.csv)')
  const sheet = workbook.worksheets.find(sheet => { const headers: string[] = []; sheet.getRow(1).eachCell(cell => headers.push(normalizeCalendarHeader(cell.text))); return headers.includes('title') && headers.includes('startdate') }) || workbook.worksheets[0]
  if (!sheet || sheet.rowCount < 2 || sheet.rowCount > 2001 || sheet.columnCount > 20) throw new Error('Use one header and 1–2000 event rows, at most 20 columns')
  const headers: string[] = []
  sheet.getRow(1).eachCell((cell, column) => { headers[column - 1] = normalizeCalendarHeader(cell.text) })
  for (const name of ['title', 'startdate']) if (!headers.includes(name)) throw new Error('Headers must include title and startDate (or Event Name and Date)')
  const events = []
  for (let index = 2; index <= sheet.rowCount; index++) {
    const row = sheet.getRow(index)
    if (!row.hasValues) continue
    const value = (key: string) => {
      const position = headers.indexOf(key)
      if (position < 0) return ''
      const cell = row.getCell(position + 1)
      if (cell.type === 6 || cell.formula) throw new Error(`Formulas are not accepted (row ${index})`)
      if (cell.value instanceof Date) return cell.value.toISOString().slice(0, 10)
      if (['startdate', 'enddate'].includes(key) && typeof cell.value === 'number') return excelSerialDate(cell.value, !!workbook.properties.date1904)
      return cell.text.trim()
    }
    const date = (key: string, required = false) => {
      const raw = normalizeCalendarDate(value(key))
      if (!raw && !required) return null
      if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error(`Use YYYY-MM-DD dates on row ${index}`)
      const parsed = new Date(`${raw}T00:00:00.000Z`)
      if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) throw new Error(`Invalid date on row ${index}`)
      return parsed
    }
    let title = value('title')
    const busesRunning=value('busesrunning').toLowerCase(),reason=value('reason')
    if(!title){
      if(['no','false','0'].includes(busesRunning)&&reason&&reason.toLowerCase()!=='weekend')title=reason
      else continue
    }
    const type = normalizeCalendarType(value('type') || (['no','false','0'].includes(busesRunning)?'HOLIDAY':'EVENT')), startDate = date('startdate', true)!, endDate = date('enddate')
    const color = value('color') || '#2563eb', visibility = value('ispublic').toLowerCase().replace(/^(yes|1)$/, 'true').replace(/^(no|0)$/, 'false')
    if (!title || title.length > 160 || !EVENT_TYPES.includes(type) || endDate && endDate < startDate || !/^#[0-9a-f]{6}$/i.test(color) || !['', 'true', 'false'].includes(visibility)) throw new Error(`Invalid event on row ${index}`)
    events.push({ title, type, startDate, endDate, color, isPublic: visibility !== 'false', description: value('description').slice(0, 1000) || null, organizationId })
  }
  if (!events.length) throw new Error('No events found')
  // Daily-operation exports often repeat one closure/event on multiple nearby
  // dates. Collapse those rows into one visible calendar range.
  const merged:typeof events=[]
  for(const event of events.sort((a,b)=>+a.startDate-+b.startDate)){
    const previous=merged.at(-1),previousEnd=previous?.endDate||previous?.startDate
    if(previous&&previous.title.toLowerCase()===event.title.toLowerCase()&&previous.type===event.type&&event.startDate.getTime()-previousEnd!.getTime()<=4*86400000){previous.endDate=event.endDate||event.startDate;continue}
    merged.push(event)
  }
  return merged
}

export function normalizeCalendarHeader(value: string) {
  const key = value.trim().toLowerCase().replace(/[\s_-]+/g, '')
  const aliases: Record<string,string> = {eventname:'title',eventtitle:'title',name:'title',event:'title',date:'startdate',start:'startdate',end:'enddate',eventtype:'type',category:'type',notes:'description',details:'description',visible:'ispublic',visibility:'ispublic',visibletoparents:'ispublic',colour:'color'}
  return aliases[key] || key
}
export function normalizeCalendarType(value: string) {
  const type = value.trim().toUpperCase().replace(/[\s-]+/g, '_')
  return ({PUBLIC_HOLIDAY:'HOLIDAY',SCHOOL_HOLIDAY:'HOLIDAY',FESTIVEL:'FESTIVAL',FESTIVALS:'FESTIVAL'} as Record<string,string>)[type] || type || 'EVENT'
}
export function normalizeCalendarDate(value: string) {
  const match = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value)
  if (match) return `${match[3]}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}`
  return value.replace(/^(\d{4})\/(\d{2})\/(\d{2})$/, '$1-$2-$3')
}
export function excelSerialDate(value: number, date1904 = false) {
  if (!Number.isFinite(value) || value < 1 || value > 2958465) throw new Error('Invalid Excel date')
  return new Date(Date.UTC(date1904 ? 1904 : 1899, date1904 ? 0 : 11, date1904 ? 1 : 30) + Math.floor(value) * 86400000).toISOString().slice(0,10)
}
