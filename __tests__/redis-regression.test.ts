import { MockRedis } from '@/lib/redis'

describe('development Redis behavior', () => {
  it('shares refreshed values between clients without expiring the replacement early', async () => {
    jest.useFakeTimers()
    const writer = new MockRedis(), reader = writer.duplicate()
    await writer.set('refresh', 'old', 'EX', 1)
    jest.advanceTimersByTime(500)
    await writer.set('refresh', 'new', 'EX', 2)
    jest.advanceTimersByTime(600)
    expect(await reader.get('refresh')).toBe('new')
    jest.advanceTimersByTime(1500)
    expect(await reader.get('refresh')).toBeNull()
    writer.disconnect(); reader.disconnect(); jest.useRealTimers()
  })
  it('isolates channels and detaches disconnected subscribers', async () => {
    const publisher = new MockRedis(), a = publisher.duplicate(), b = publisher.duplicate()
    const receiveA = jest.fn(), receiveB = jest.fn()
    a.on('message', receiveA); b.on('message', receiveB)
    await a.subscribe('school-a'); await b.subscribe('school-b')
    await publisher.publish('school-a', 'first')
    expect(receiveA).toHaveBeenCalledTimes(1)
    expect(receiveB).not.toHaveBeenCalled()
    a.disconnect()
    await publisher.publish('school-a', 'second')
    expect(receiveA).toHaveBeenCalledTimes(1)
    publisher.disconnect(); b.disconnect()
  })
})
