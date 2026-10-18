import { describe, expect, it } from 'vitest'
import { createRetry, RETRY_EVERY_MS, RETRY_WITHIN_MS, type RetryClock } from './retry'

/** A clock that only moves when told to, firing whatever falls due on the way. */
const fakeClock = (): RetryClock & { advance: (ms: number) => void; booked: () => number } => {
  let time = 0
  let next = 0
  const timers = new Map<number, { at: number; run: () => void }>()
  return {
    now: () => time,
    setTimeout: (run, ms) => {
      timers.set(++next, { at: time + ms, run })
      return next
    },
    clearTimeout: (handle) => {
      timers.delete(handle as number)
    },
    advance: (ms) => {
      const until = time + ms
      for (;;) {
        const due = [...timers]
          .filter(([, timer]) => timer.at <= until)
          .sort((a, b) => a[1].at - b[1].at)[0]
        if (!due) break
        timers.delete(due[0])
        time = due[1].at
        due[1].run()
      }
      time = until
    },
    booked: () => timers.size,
  }
}

describe('a retry', () => {
  it('tries again after the wait, not before', () => {
    const clock = fakeClock()
    let tries = 0
    const retry = createRetry(() => tries++, { clock })

    expect(retry.schedule()).toBe(true)
    clock.advance(RETRY_EVERY_MS - 1)
    expect(tries).toBe(0)
    clock.advance(1)
    expect(tries).toBe(1)
    expect(retry.attempts).toBe(1)
  })

  it('keeps one try booked however often it is scheduled', () => {
    const clock = fakeClock()
    let tries = 0
    const retry = createRetry(() => tries++, { clock })

    retry.schedule()
    retry.schedule()
    expect(clock.booked()).toBe(1)
    clock.advance(RETRY_EVERY_MS)
    expect(tries).toBe(1)
  })

  it('keeps trying at a steady pace while each try fails', () => {
    const clock = fakeClock()
    const at: number[] = []
    const retry = createRetry(
      () => {
        at.push(clock.now())
        retry.schedule()
      },
      { clock, every: 3000, within: 10_000 },
    )

    retry.schedule()
    clock.advance(60_000)
    expect(at).toEqual([3000, 6000, 9000])
  })

  it('gives up once the next try would land past the window', () => {
    const clock = fakeClock()
    const retry = createRetry(() => {}, { clock })

    clock.advance(RETRY_WITHIN_MS - RETRY_EVERY_MS)
    expect(retry.schedule()).toBe(true)
    clock.advance(1)
    expect(retry.schedule()).toBe(false)
    expect(clock.booked()).toBe(0)
  })

  it('calls off what is booked when stopped, and books nothing after', () => {
    const clock = fakeClock()
    let tries = 0
    const retry = createRetry(() => tries++, { clock })

    retry.schedule()
    retry.stop()
    clock.advance(RETRY_EVERY_MS * 2)
    expect(tries).toBe(0)
    expect(retry.schedule()).toBe(false)
  })
})
