import { describe, expect, it } from 'vitest'
import { AMBIENT_FPS, wantsFrame } from './renderPacing'

/** Frames drawn across one second of display ticks at a refresh rate. */
const framesInASecond = (hz: number, demand: { changed: boolean; animating: boolean }): number => {
  let drawn = 0
  let last = -Infinity

  for (let tick = 1; tick <= hz; tick++) {
    const now = (tick * 1000) / hz
    if (!wantsFrame({ ...demand, sinceLastFrame: now - last })) continue
    drawn++
    last = now
  }

  return drawn
}

describe('wantsFrame', () => {
  it('draws every tick while something changes', () => {
    expect(framesInASecond(144, { changed: true, animating: true })).toBe(144)
  })

  it('draws nothing on a still map', () => {
    expect(framesInASecond(144, { changed: false, animating: false })).toBe(0)
  })

  it('holds an ambient animation near its own rate on any display', () => {
    for (const hz of [60, 100, 144, 240]) {
      const drawn = framesInASecond(hz, { changed: false, animating: true })
      expect(drawn, `${hz} Hz`).toBeGreaterThanOrEqual(AMBIENT_FPS * 0.8)
      expect(drawn, `${hz} Hz`).toBeLessThanOrEqual(AMBIENT_FPS)
    }
  })
})
