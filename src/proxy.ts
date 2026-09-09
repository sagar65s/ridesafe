import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { isUserRole } from '@/lib/roles'

// ─── Rate Limiter (in-memory, per IP) ───────────────────────────────────────
const rateLimitStore = new Map<string, { count: number; resetTime: number }>()
const RATE_LIMIT_WINDOW_MS = 60_000 // 1 minute
const RATE_LIMIT_MAX = 120          // 120 requests per minute per IP

function checkRateLimit(key: string, maxRequests: number): { allowed: boolean; remaining: number } {
  const now = Date.now()
  const record = rateLimitStore.get(key)

  if (!record || now > record.resetTime) {
    rateLimitStore.set(key, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS })
    if (rateLimitStore.size > 10_000) {
      for (const [storedKey, value] of rateLimitStore) if (now > value.resetTime) rateLimitStore.delete(storedKey)
    }
    return { allowed: true, remaining: maxRequests - 1 }
  }

  record.count++
  if (record.count > maxRequests) {
    return { allowed: false, remaining: 0 }
  }
  return { allowed: true, remaining: maxRequests - record.count }
}

// ─── JWT Secret ─────────────────────────────────────────────────────────────
const getJwtSecretKey = () => {
  const secret = process.env.JWT_SECRET
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET must contain at least 32 characters')
  return new TextEncoder().encode(secret)
}

// ─── Public Paths (no auth required) ────────────────────────────────────────
const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/auth/me',        // Used for logout POST
  '/api/health',
  '/api/public/',        // Public forms (e.g. student self-registration)
]

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some(p => p.endsWith('/') ? pathname.startsWith(p) : pathname === p)
}

// ─── Static / Non-API paths (skip entirely) ─────────────────────────────────
function isNonApiPath(pathname: string): boolean {
  return (
    !pathname.startsWith('/api/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon')
  )
}

// ─── Middleware ──────────────────────────────────────────────────────────────
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip non-API routes (pages, static assets)
  if (isNonApiPath(pathname)) {
    return NextResponse.next()
  }

  // Verify before assigning a user bucket so shared school Wi-Fi does not
  // combine every authenticated user's polling into one IP limit.
  const token = request.cookies.get('token')?.value
  let identity: { id: string; role: string } | null = null
  if (token) {
    try {
      const { payload } = await jwtVerify(token, getJwtSecretKey(), { algorithms: ['HS256'] })
      if (typeof payload.id === 'string' && payload.id && isUserRole(payload.role)) identity = { id: payload.id, role: payload.role }
    } catch { /* Invalid sessions are rejected below or by the public auth handler. */ }
  }
  // ── Rate Limiting ──
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || '127.0.0.1'

  const requestLimit = pathname === '/api/auth/login' ? 10 : RATE_LIMIT_MAX
  const bucket = pathname === '/api/auth/login' ? `login:${ip}` : identity ? `user:${identity.id}` : `public:${ip}`
  const { allowed, remaining } = checkRateLimit(bucket, requestLimit)

  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please slow down.' },
      {
        status: 429,
        headers: {
          'Retry-After': '60',
          'X-RateLimit-Limit': String(requestLimit),
          'X-RateLimit-Remaining': '0',
        }
      }
    )
  }

  // ── Public path bypass ──
  if (isPublicPath(pathname)) {
    const response = NextResponse.next()
    response.headers.set('X-RateLimit-Remaining', String(remaining))
    return response
  }

  if (!identity) return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  const response = NextResponse.next()
  response.headers.set('X-RateLimit-Remaining', String(remaining))
  return response
}

export const config = {
  matcher: ['/api/:path*'],
}
