import { registrationAccessToken } from '@/lib/services/registrationService'
import { BillplzAdapter } from '@/lib/adapters/billplz'

describe('registration security', () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalMockFlag = process.env.BILLPLZ_MOCK_ENABLED

  afterEach(() => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: originalNodeEnv, configurable: true, writable: true })
    process.env.BILLPLZ_MOCK_ENABLED = originalMockFlag
  })

  it('creates deterministic, registration-specific access tokens', () => {
    expect(registrationAccessToken('reg-a')).toBe(registrationAccessToken('reg-a'))
    expect(registrationAccessToken('reg-a')).not.toBe(registrationAccessToken('reg-b'))
    expect(registrationAccessToken('reg-a')).toHaveLength(64)
  })

  it('never enables mock payments in production', () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', configurable: true, writable: true })
    process.env.BILLPLZ_MOCK_ENABLED = 'true'
    expect(new BillplzAdapter().isMockEnabled()).toBe(false)
  })

  it('requires an explicit mock flag outside production', () => {
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'test', configurable: true, writable: true })
    process.env.BILLPLZ_MOCK_ENABLED = 'false'
    expect(new BillplzAdapter().isMockEnabled()).toBe(false)
    process.env.BILLPLZ_MOCK_ENABLED = 'true'
    expect(new BillplzAdapter().isMockEnabled()).toBe(true)
  })
})
