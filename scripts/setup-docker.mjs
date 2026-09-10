import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { randomBytes, createECDH } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const target = new URL('../.env.production', import.meta.url)
if (existsSync(target)) {
  console.log('Existing .env.production preserved. No credentials or database settings changed.')
  process.exit(0)
}
const secret = () => randomBytes(32).toString('hex')
const password = secret()
const vapid = createECDH('prime256v1')
vapid.generateKeys()
const values = {
  POSTGRES_USER: 'ridesafe', POSTGRES_PASSWORD: password, POSTGRES_DB: 'ridesafe_db',
  DATABASE_URL: `postgresql://ridesafe:${password}@postgres:5432/ridesafe_db?schema=public`,
  REDIS_URL: 'redis://redis:6379', JWT_SECRET: secret(), APP_URL: 'http://localhost:3500',
  TRACKING_WORKER_SECRET: secret(), RESEND_API_KEY: '', WIALON_TOKEN: '',
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: vapid.getPublicKey().toString('base64url'),
  VAPID_PRIVATE_KEY: vapid.getPrivateKey().toString('base64url'),
}
let text = readFileSync(new URL('../.env.production.example', import.meta.url), 'utf8')
for (const [key, value] of Object.entries(values)) {
  text = text.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}="${value}"`)
}
// 'wx' also protects against concurrent setup overwriting credentials.
writeFileSync(target, text, { flag: 'wx', mode: 0o600 })
console.log(`Created ${fileURLToPath(target)} with random local credentials and VAPID keys. Secrets are not printed.`)
console.log('For an existing database, restore its original .env.production before starting. New passwords do not change an existing database.')
