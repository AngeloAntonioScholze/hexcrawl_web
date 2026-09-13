import { describe, expect, it } from 'vitest'
import { clockAt, isNight, nextPhaseTurn, TURNS_PER_DAY, TURNS_PER_PHASE } from './clock'

describe('the clock', () => {
  it('starts at first light on the first day', () => {
    expect(clockAt(0)).toEqual({ turn: 0, phase: 'day', index: 0, day: 1 })
  })

  it('runs the day out before the night begins', () => {
    expect(clockAt(TURNS_PER_PHASE - 1).phase).toBe('day')
    expect(clockAt(TURNS_PER_PHASE).phase).toBe('night')
    expect(clockAt(TURNS_PER_PHASE).index).toBe(0)
  })

  it('turns the day over at the end of the night, not at the end of the light', () => {
    expect(clockAt(TURNS_PER_DAY - 1).day).toBe(1)
    expect(clockAt(TURNS_PER_DAY)).toEqual({
      turn: TURNS_PER_DAY,
      phase: 'day',
      index: 0,
      day: 2,
    })
  })

  it('reads any turn of any later day', () => {
    expect(clockAt(TURNS_PER_DAY * 3 + TURNS_PER_PHASE + 2)).toEqual({
      turn: 30,
      phase: 'night',
      index: 2,
      day: 4,
    })
  })

  it('never runs backwards or lands between turns', () => {
    expect(clockAt(-8).turn).toBe(0)
    expect(clockAt(2.7).index).toBe(2)
  })

  it('tells the dark from the light', () => {
    expect(isNight(0)).toBe(false)
    expect(isNight(TURNS_PER_PHASE)).toBe(true)
    expect(isNight(TURNS_PER_DAY)).toBe(false)
  })

  it('skips to the opening of the next phase, never staying where it is', () => {
    expect(nextPhaseTurn(0)).toBe(TURNS_PER_PHASE)
    expect(nextPhaseTurn(TURNS_PER_PHASE - 1)).toBe(TURNS_PER_PHASE)
    expect(nextPhaseTurn(TURNS_PER_PHASE)).toBe(TURNS_PER_DAY)
    expect(clockAt(nextPhaseTurn(1)).index).toBe(0)
  })
})
