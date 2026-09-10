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
it('rejects cross-origin browser writes before authentication',async()=>{
 const req=new NextRequest('http://localhost/api/messages',{method:'POST',headers:{origin:'https://unrelated.example','sec-fetch-site':'cross-site',cookie:'token=csrf-user'},body:'{}'})
 expect((await proxy(req)).status).toBe(403)
})
it('accepts same-origin authenticated writes',async()=>{
 const req=new NextRequest('http://localhost/api/messages',{method:'POST',headers:{origin:'http://localhost',cookie:'token=same-origin-user'},body:'{}'})
 expect((await proxy(req)).status).toBe(200)
})
