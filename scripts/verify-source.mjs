import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, dirname, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = resolve(root, 'SOURCE-MANIFEST.json')
if (!existsSync(manifestPath)) {
  console.error('SOURCE-MANIFEST.json is missing. Extract the complete RideSafe ZIP into a fresh folder.')
  process.exit(1)
}
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
const strict = process.argv.includes('--strict')
const errors = []
// The production environment template is release documentation, not an input to
// the application build. Keep checking it in strict release verification, while
// allowing a user who has already copied/renamed it to `.env.production` to
// rebuild the application safely.
const releaseOnlyFiles = new Set(['.env.production.example'])
const entries = Object.entries(manifest.files).filter(
  ([name]) => strict || (manifest.buildFiles.includes(name) && !releaseOnlyFiles.has(name)),
)
for (const [name, expected] of entries) {
  const path = resolve(root, name)
  if (relative(root, path).startsWith('..') || name.includes('\\')) { errors.push(`Invalid manifest path: ${name}`); continue }
  // Check spelling on Windows too, where a wrong-case filename can otherwise pass.
  let parent = root
  let valid = true
  for (const part of name.split('/')) {
    if (!existsSync(parent) || !readdirSync(parent).includes(part)) { valid = false; break }
    parent += sep + part
  }
  if (!valid) { errors.push(`Missing file / wrong case: ${name}`); continue }
  if (strict && createHash('sha256').update(readFileSync(path)).digest('hex') !== expected) errors.push(`Modified file: ${name}`)
}
if (errors.length) {
  console.error(errors.join('\n'))
  console.error('Use the complete ZIP, preserving folders. Do not copy only a patch into an empty directory.')
  process.exit(1)
}
console.log(`RideSafe source check: ${entries.length} files present with correct casing${strict ? ' and matching SHA-256 hashes' : ''}.`)
