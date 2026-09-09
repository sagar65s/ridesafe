import { NextRequest } from 'next/server'
jest.mock('jose', () => ({ jwtVerify: jest.fn(async (token: string) => ({ payload: { id: token, role: 'PARENT' } })) }))
import { proxy } from '@/proxy'
it('keeps authenticated users on a shared school IP in independent rate buckets', async () => {
  const request = (id: string) => new NextRequest('http://localhost/api/students', { headers: { cookie: `token=${id}`, 'x-forwarded-for': '192.0.2.5' } })
  for (let i = 0; i < 120; i++) expect((await proxy(request('one'))).status).toBe(200)
  expect((await proxy(request('one'))).status).toBe(429)
  expect((await proxy(request('two'))).status).toBe(200)
})
it('does not exempt private API paths containing periods or public-prefix lookalikes', async () => {
  expect((await proxy(new NextRequest('http://localhost/api/students/a.b'))).status).toBe(401)
  expect((await proxy(new NextRequest('http://localhost/api/auth/login-extra'))).status).toBe(401)
})
