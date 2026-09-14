import { isServiceType, studentUsesBus, transportModeLabel } from '@/lib/transport'

describe('transport service modes', () => {
  test.each(['MORNING','PM','AFTER_SCHOOL'])('%s is a valid trip service', value => expect(isServiceType(value)).toBe(true))
  test('bus transport students use every service', () => {
    for (const service of ['MORNING','PM','AFTER_SCHOOL'] as const) expect(studentUsesBus({ isSelfPickup:false },service)).toBe(true)
    expect(transportModeLabel({isSelfPickup:false})).toBe('Bus Transport (no self-pickup)')
  })
  test.each([
    ['MORNING','Morning Self-Pickup'],
    ['PM','PM Self-Pickup'],
    ['AFTER_SCHOOL','After School Activity'],
  ] as const)('%s self-pickup skips only that service', (session,label) => {
    expect(transportModeLabel({isSelfPickup:true,selfPickupSession:session})).toBe(label)
    for (const service of ['MORNING','PM','AFTER_SCHOOL'] as const) expect(studentUsesBus({isSelfPickup:true,selfPickupSession:session},service)).toBe(service!==session)
  })
})
