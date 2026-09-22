import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'

const projectRoot=resolve(__dirname,'..')
const pooled='postgresql://sample:secret@ep-example-pooler.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'
const direct='postgresql://sample:secret@ep-example.c-4.ap-southeast-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require'

function check(databaseUrl:string,directUrl=''){
  return spawnSync(process.execPath,['scripts/migrate-production.mjs','--check-url'],{
    cwd:projectRoot,encoding:'utf8',env:{...process.env,DATABASE_URL:databaseUrl,DIRECT_URL:directUrl},
  })
}

describe('production migration URL safety',()=>{
  test('rejects Neon pooled connection before any migration is attempted',()=>{
    const result=check(pooled)
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('DIRECT/UNPOOLED')
    expect(result.stderr).not.toContain('sample:secret')
  })
  test('deploy command also refuses pooled URL before spawning Prisma',()=>{
    const result=spawnSync(process.execPath,['scripts/migrate-production.mjs','deploy'],{
      cwd:projectRoot,encoding:'utf8',env:{...process.env,DATABASE_URL:pooled,DIRECT_URL:''},
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('No migration was run')
    expect(result.stdout).not.toContain('Prisma schema loaded')
  })
  test('accepts direct Neon URL without connecting or leaking credentials',()=>{
    const result=check(direct)
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('does not prove the database is reachable')
    expect(result.stdout).not.toContain('sample:secret')
  })
  test('uses direct URL even when runtime database URL is pooled',()=>{
    expect(check(pooled,direct).status).toBe(0)
  })
  test('requires an explicit URL and rejects malformed input',()=>{
    expect(check('').stderr).toContain('Set DIRECT_URL')
    expect(check('not a connection URL').status).toBe(1)
  })
})
