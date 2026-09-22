import {Readable} from 'node:stream'
import {Workbook} from 'exceljs'
import {validateWorkbookArchive,excelSerialDate} from '@/lib/calendar-import'
import {excelJsCompatibleXlsx} from '@/lib/xlsx-compat'

export type ImportRow={row:number;value:(...aliases:string[])=>string}
const key=(value:string)=>value.trim().toLowerCase().replace(/[\s_#()\/-]+/g,'')

export async function readTabularFile(file:File,limits={rows:5000,columns:40}){
  if(!file.size||file.size>5*1024*1024)throw new Error('Choose a file up to 5 MB')
  const bytes=Buffer.from(await file.arrayBuffer()),workbook=new Workbook()
  if(/\.xlsx$/i.test(file.name)){validateWorkbookArchive(bytes);await workbook.xlsx.load(await excelJsCompatibleXlsx(bytes) as unknown as Parameters<typeof workbook.xlsx.load>[0])}
  else if(/\.csv$/i.test(file.name))await workbook.csv.read(Readable.from(bytes.toString('utf8').replace(/^\uFEFF/,'')),{map:value=>value})
  else throw new Error('Use Excel (.xlsx) or CSV (.csv)')
  const sheet=workbook.worksheets[0]
  if(!sheet||sheet.rowCount<2||sheet.rowCount>limits.rows+1||sheet.columnCount>limits.columns)throw new Error(`Use one header and 1–${limits.rows} rows, at most ${limits.columns} columns`)
  const headers:string[]=[]
  sheet.getRow(1).eachCell((cell,column)=>{headers[column-1]=key(cell.text)})
  const rows:ImportRow[]=[]
  for(let index=2;index<=sheet.rowCount;index++){
    const row=sheet.getRow(index);if(!row.hasValues)continue
    rows.push({row:index,value:(...aliases)=>{
      const position=aliases.map(key).map(alias=>headers.indexOf(alias)).find(item=>item>=0)
      if(position===undefined||position<0)return ''
      const cell=row.getCell(position+1)
      if(cell.type===6||cell.formula)throw new Error(`Formulas are not accepted (row ${index})`)
      if(cell.value instanceof Date)return cell.value.toISOString()
      if(aliases.some(alias=>key(alias)==='date')&&typeof cell.value==='number')return excelSerialDate(cell.value,!!workbook.properties.date1904)
      return cell.text.trim()
    }})
  }
  return {headers,rows}
}

export function parseImportDate(value:string,row:number){
  const normalized=value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)?.slice(1)
  const iso=normalized?`${normalized[2]}-${normalized[1].padStart(2,'0')}-${normalized[0].padStart(2,'0')}`:value.slice(0,10)
  if(!/^\d{4}-\d{2}-\d{2}$/.test(iso))throw new Error(`Invalid date on row ${row}; use DD/MM/YYYY or YYYY-MM-DD`)
  const date=new Date(`${iso}T00:00:00+08:00`)
  if(!Number.isFinite(date.getTime())||new Date(`${iso}T00:00:00Z`).toISOString().slice(0,10)!==iso)throw new Error(`Invalid date on row ${row}`)
  return date
}
