import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()
try {
  const email = process.env.BOOTSTRAP_SANDBOX_EMAIL?.trim().toLowerCase()
  const password = process.env.BOOTSTRAP_SANDBOX_PASSWORD
  const name = process.env.BOOTSTRAP_SANDBOX_NAME?.trim() || 'RideSafe Sandbox'
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Set a valid BOOTSTRAP_SANDBOX_EMAIL.')
  if (!password || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) throw new Error('BOOTSTRAP_SANDBOX_PASSWORD must be 8-72 UTF-8 bytes.')
  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing && existing.accessProfile !== 'SANDBOX') throw new Error('That email belongs to a non-sandbox account. Choose another email.')
  const hash = await bcrypt.hash(password, 12)
  const user = existing
    ? await prisma.user.update({ where:{id:existing.id}, data:{name,password:hash,role:'SUPER_ADMIN',accessProfile:'SANDBOX',organizationId:null,isActive:true,profileCompleted:true} })
    : await prisma.user.create({ data:{name,email,password:hash,role:'SUPER_ADMIN',accessProfile:'SANDBOX',organizationId:null,isActive:true,profileCompleted:true} })
  console.log(`Sandbox account ready: ${user.email}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Could not create sandbox account')
  process.exitCode = 1
} finally { await prisma.$disconnect() }
