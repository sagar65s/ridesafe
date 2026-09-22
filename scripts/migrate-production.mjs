import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const prismaCli = resolve(projectRoot, 'node_modules/prisma/build/index.js')
const command = process.argv[2] || 'deploy'

function fail(message) {
  console.error(message)
  process.exitCode = 1
}

if (!['deploy', 'status', '--check-url'].includes(command)) {
  fail('Use npm run db:migrate, npm run db:status, or node scripts/migrate-production.mjs --check-url.')
} else {
  // A direct URL is only needed for migrations, not for the app at runtime.
  // It takes precedence over the pooled DATABASE_URL when both are present.
  const raw = process.env.DIRECT_URL || process.env.DATABASE_URL
  if (!raw) {
    fail('Set DIRECT_URL to the direct/unpooled connection URL for the SAME production database. DATABASE_URL is also accepted if it is a direct URL.')
  } else {
    let url
    try { url = new URL(raw) } catch { fail('The database URL is invalid. Copy the complete direct connection URL from Neon; do not include placeholder brackets.') }
    if (url) {
      if (!['postgresql:', 'postgres:'].includes(url.protocol) || !url.hostname) {
        fail('The migration URL must be a complete PostgreSQL connection URL.')
      } else if (url.hostname.endsWith('.neon.tech') && /-pooler(?:\.|$)/i.test(url.hostname)) {
        fail('Neon pooled (-pooler) URL detected. Prisma migrations need the DIRECT/UNPOOLED URL for the same Neon database and branch. Copy it from the Neon dashboard, set DIRECT_URL, then retry. No migration was run.')
      } else if (command === '--check-url') {
        console.log('Migration URL format accepted. This does not prove the database is reachable or that its branch matches Vercel.')
      } else if (!existsSync(prismaCli)) {
        fail('Prisma CLI is missing. Run npm ci from the complete extracted RideSafe project folder first.')
      } else {
        const child = spawn(process.execPath, [prismaCli, 'migrate', command], {
          cwd: projectRoot,
          env: { ...process.env, DATABASE_URL: raw },
          stdio: 'inherit',
        })
        child.on('error', () => fail('Unable to start the pinned Prisma CLI. Confirm Node.js and npm ci are available.'))
        child.on('exit', (code, signal) => {
          if (signal) fail(`Prisma was interrupted (${signal}); verify migration status before retrying.`)
          else process.exitCode = code ?? 1
        })
      }
    }
  }
}
