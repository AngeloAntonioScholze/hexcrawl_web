import { describe, expect, it } from 'vitest'
import { createFbm, createPerlin } from './perlin'

const SEED = 42
const samples = (count: number, step = 0.37): [number, number][] =>
  Array.from({ length: count }, (_, i) => [i * step, i * step * 1.7] as [number, number])

describe('createPerlin', () => {
  const noise = createPerlin(SEED)

  it('is deterministic for a seed', () => {
    const again = createPerlin(SEED)
    for (const [x, y] of samples(50)) {
      expect(noise(x, y)).toBe(again(x, y))
    }
  })

  it('differs between seeds', () => {
    const other = createPerlin(SEED + 1)
    const different = samples(50).filter(([x, y]) => noise(x, y) !== other(x, y))
    expect(different.length).toBeGreaterThan(40)
  })

  it('stays within [-1, 1]', () => {
    for (const [x, y] of samples(2000, 0.013)) {
      const value = noise(x, y)
      expect(value).toBeGreaterThanOrEqual(-1)
      expect(value).toBeLessThanOrEqual(1)
    }
  })

  it('is zero at lattice points, as gradient noise must be', () => {
    for (let x = -8; x <= 8; x++) {
      for (let y = -8; y <= 8; y++) {
        expect(noise(x, y)).toBeCloseTo(0, 10)
      }
    }
  })

  it('is continuous: small steps make small changes', () => {
    for (const [x, y] of samples(200, 0.61)) {
      expect(Math.abs(noise(x, y) - noise(x + 0.001, y))).toBeLessThan(0.02)
      expect(Math.abs(noise(x, y) - noise(x, y + 0.001))).toBeLessThan(0.02)
    }
  })

  it('varies rather than returning a constant', () => {
    const values = samples(300, 0.21).map(([x, y]) => noise(x, y))
    expect(new Set(values.map((v) => v.toFixed(4))).size).toBeGreaterThan(200)
    expect(Math.max(...values)).toBeGreaterThan(0.2)
    expect(Math.min(...values)).toBeLessThan(-0.2)
  })

  it('spans both sides of zero roughly evenly', () => {
    const values = samples(2000, 0.093).map(([x, y]) => noise(x, y))
    const positive = values.filter((v) => v > 0).length
    expect(positive).toBeGreaterThan(values.length * 0.35)
    expect(positive).toBeLessThan(values.length * 0.65)
  })
})

describe('createFbm', () => {
  it('stays within [-1, 1] across octave counts', () => {
    for (const octaves of [1, 2, 4, 6]) {
      const fbm = createFbm(SEED, { octaves })
      for (const [x, y] of samples(500, 0.041)) {
        const value = fbm(x, y)
        expect(value).toBeGreaterThanOrEqual(-1)
        expect(value).toBeLessThanOrEqual(1)
      }
    }
  })

  it('is deterministic for a seed', () => {
    const a = createFbm(SEED, { octaves: 3 })
    const b = createFbm(SEED, { octaves: 3 })
    for (const [x, y] of samples(50)) expect(a(x, y)).toBe(b(x, y))
  })

  it('adds detail with more octaves', () => {
    const roughness = (octaves: number): number => {
      const fbm = createFbm(SEED, { octaves })
      let total = 0
      for (const [x, y] of samples(400, 0.05)) total += Math.abs(fbm(x, y) - fbm(x + 0.01, y))
      return total
    }
    expect(roughness(5)).toBeGreaterThan(roughness(1))
  })

  it('matches single-octave Perlin when given one octave', () => {
    const fbm = createFbm(SEED, { octaves: 1 })
    const perlin = createPerlin(SEED)
    for (const [x, y] of samples(50)) expect(fbm(x, y)).toBeCloseTo(perlin(x, y), 12)
  })
})
