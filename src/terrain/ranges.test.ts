import { describe, expect, it } from 'vitest'
import { createRanges } from './ranges'

const RIM = 180
const ranges = createRanges({ seed: 42, rim: RIM })

// A grid over the whole world, close enough to cross every range a few times.
const points: [number, number][] = []
for (let x = -RIM; x <= RIM; x += 3) {
  for (let z = -RIM; z <= RIM; z += 3) points.push([x, z])
}

describe('createRanges', () => {
  it('leaves the sea alone', () => {
    for (const [x, z] of points) {
      for (const shaped of [-0.6, -0.05, 0]) expect(ranges(shaped, x, z)).toBe(shaped)
    }
  })

  it('never sinks land below sea level', () => {
    for (const [x, z] of points) {
      for (const shaped of [0.001, 0.05, 0.3, 0.9]) expect(ranges(shaped, x, z)).toBeGreaterThan(0)
    }
  })

  it('keeps the shore low even where a range runs down to it', () => {
    for (const [x, z] of points) expect(ranges(0.02, x, z)).toBeLessThan(0.06)
  })

  it('raises mountains only along the ranges, however high the ground was', () => {
    // 0.24 is where mountains start before contrast, 0.36 where peaks do.
    const lifted = points.map(([x, z]) => ranges(0.9, x, z))
    expect(Math.min(...lifted)).toBeLessThan(0.24)
    expect(Math.max(...lifted)).toBeGreaterThan(0.36)
    const high = points.filter(([x, z]) => ranges(0.3, x, z) >= 0.24)
    expect(high.length).toBeGreaterThan(points.length * 0.05)
    expect(high.length).toBeLessThan(points.length * 0.3)
  })

  it('is the same ground for the same seed', () => {
    const again = createRanges({ seed: 42, rim: RIM })
    for (const [x, z] of points.slice(0, 500)) expect(again(0.3, x, z)).toBe(ranges(0.3, x, z))
  })
})
