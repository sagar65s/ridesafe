import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const path = resolve(process.argv[2] || '.env.production')
if (!existsSync(path)) throw new Error(`Environment file not found: ${path}`)
const original = readFileSync(path,'utf8')
const pairs = new Map()
for (const line of original.split(/\r?\n/)) {
  const match=line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/)
  if(match)pairs.set(match[1],match[2].trim().replace(/^['"]|['"]$/g,''))
}
const additions=[]
const put=(key,value)=>{if(value&&!pairs.has(key)){additions.push(`${key}=${JSON.stringify(value)}`);pairs.set(key,value)}}
const databaseUrl=pairs.get('DATABASE_URL')
if(databaseUrl){
  const url=new URL(databaseUrl)
  put('POSTGRES_USER',decodeURIComponent(url.username)||'ridesafe')
  put('POSTGRES_PASSWORD',decodeURIComponent(url.password))
  put('POSTGRES_DB',url.pathname.replace(/^\//,'')||'ridesafe_db')
}
put('APP_URL',pairs.get('NEXT_PUBLIC_APP_URL')||pairs.get('NEXTAUTH_URL'))
put('NEXT_PUBLIC_APP_URL',pairs.get('APP_URL')||pairs.get('NEXTAUTH_URL'))
if(!additions.length){console.log('Environment file is already compatible.');process.exit(0)}
writeFileSync(path,`${original.trimEnd()}\n\n# Added automatically for current RideSafe compatibility\n${additions.join('\n')}\n`,{mode:0o600})
console.log(`Added ${additions.length} missing compatibility variables without changing existing secrets.`)
