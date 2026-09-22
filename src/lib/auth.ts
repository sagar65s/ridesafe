import { jwtVerify, SignJWT } from 'jose'
import { cookies } from 'next/headers'
import { isUserRole } from '@/lib/roles'

const getJwtSecretKey = () => {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters')
  return new TextEncoder().encode(secret)
}

export async function signToken(payload: { id: string; role: string }) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('1d') // 1 day
    .sign(getJwtSecretKey())
}

export async function verifyToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey(), { algorithms: ['HS256'] })
    if (typeof payload.id !== 'string' || !payload.id || !isUserRole(payload.role)) return null
    return payload as { id: string; role: string }
  } catch {
    return null
  }
}

export async function getUserFromSession() {
  const cookieStore = await cookies()
  const token = cookieStore.get('token')?.value
  
  if (!token) return null
  
  const session = await verifyToken(token)
  if (!session) return null
  const { default: prisma } = await import('@/lib/prisma')
  const user = await prisma.user.findUnique({
    where: { id: session.id },
    select: { id: true, role: true, accessProfile: true, isActive: true, organization: { select: { isActive: true } } },
  })
  if (!user || !isUserRole(user.role) || !user.isActive || user.role !== 'SUPER_ADMIN' && user.organization?.isActive === false) return null
  // SANDBOX is intentionally represented by the mature SUPER_ADMIN permission
  // path internally. The UI exposes it as a distinct sixth account type.
  return { id: user.id, role: user.accessProfile === 'SANDBOX' || user.role === 'SANDBOX' ? 'SUPER_ADMIN' : user.role }
}

export async function clearSession() {
  const cookieStore = await cookies()
  cookieStore.delete('token')
}
