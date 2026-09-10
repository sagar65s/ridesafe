import { PrismaClient } from '@prisma/client'

// Next.js imports route modules while building; no database is queried then.
// Keep runtime configuration mandatory.
if (!process.env.DATABASE_URL && process.env.NEXT_PHASE !== 'phase-production-build') {
  throw new Error('DATABASE_URL is required and must point to PostgreSQL')
}

const prismaClientSingleton = () => {
  return new PrismaClient()
}

declare global {
  var prisma: undefined | ReturnType<typeof prismaClientSingleton>
}

const prisma = globalThis.prisma ?? prismaClientSingleton()

export default prisma

if (process.env.NODE_ENV !== 'production') globalThis.prisma = prisma
