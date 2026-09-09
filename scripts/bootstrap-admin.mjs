import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

// Explicit first-install operation. Never resets an existing account or seeds data.
const prisma = new PrismaClient()
try {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase()
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || 'Super Admin'
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Set a valid BOOTSTRAP_ADMIN_EMAIL.')
  if (!password || password.length < 12 || Buffer.byteLength(password, 'utf8') > 72) throw new Error('BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters and at most 72 UTF-8 bytes.')
  const hash = await bcrypt.hash(password, 12)
  await prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('ridesafe:first-admin'))`
    if (await tx.user.findFirst({ where: { role: 'SUPER_ADMIN' }, select: { id: true } })) throw new Error('A Super Admin already exists. Sign in with that account; bootstrap does not overwrite accounts.')
    if (await tx.user.findUnique({ where: { email }, select: { id: true } })) throw new Error('This email is already registered. Choose a different email.')
    await tx.user.create({ data: { name, email, password: hash, role: 'SUPER_ADMIN', isActive: true } })
  })
  console.log('Initial Super Admin created. Sign in using the credentials you supplied.')
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Could not create initial admin')
  process.exitCode = 1
} finally { await prisma.$disconnect() }
