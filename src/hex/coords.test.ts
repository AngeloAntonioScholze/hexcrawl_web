import { describe, expect, it } from 'vitest'
import {
  DIAGONALS,
  DIRECTIONS,
  add,
  distance,
  equals,
  hexKey,
  line,
  neighbor,
  neighbors,
  parseKey,
  range,
  ring,
  rotate,
  round,
  spiral,
  subtract,
  toCube,
} from './coords'
import type { Axial } from './coords'

const hex = (q: number, r: number): Axial => ({ q, r })
const sortKeys = (hexes: Axial[]): string[] => hexes.map(hexKey).sort()

describe('cube conversion', () => {
  it('keeps the cube constraint q + r + s === 0', () => {
    for (const h of [hex(0, 0), hex(3, -7), hex(-4, 2), hex(11, 5)]) {
      const cube = toCube(h)
      expect(cube.q + cube.r + cube.s).toBe(0)
    }
  })
})

describe('keys', () => {
  it('round-trips through hexKey and parseKey', () => {
    for (const h of [hex(0, 0), hex(-3, 12), hex(7, -1)]) {
      expect(parseKey(hexKey(h))).toEqual(h)
    }
  })

  it('encodes negative coordinates unambiguously', () => {
    expect(hexKey(hex(-2, -5))).toBe('-2,-5')
    expect(parseKey('-2,-5')).toEqual(hex(-2, -5))
  })
})

describe('arithmetic', () => {
  it('adds and subtracts', () => {
    expect(add(hex(1, 2), hex(3, -4))).toEqual(hex(4, -2))
    expect(subtract(hex(1, 2), hex(3, -4))).toEqual(hex(-2, 6))
  })

  it('compares by value', () => {
    expect(equals(hex(1, 2), hex(1, 2))).toBe(true)
    expect(equals(hex(1, 2), hex(2, 1))).toBe(false)
  })
})

describe('neighbors', () => {
  it('returns six distinct adjacent hexes', () => {
    const result = neighbors(hex(0, 0))
    expect(result).toHaveLength(6)
    expect(new Set(result.map(hexKey)).size).toBe(6)
    for (const n of result) expect(distance(hex(0, 0), n)).toBe(1)
  })

  it('wraps direction indices', () => {
    expect(neighbor(hex(0, 0), 6)).toEqual(neighbor(hex(0, 0), 0))
    expect(neighbor(hex(0, 0), -1)).toEqual(neighbor(hex(0, 0), 5))
  })

  it('orders DIRECTIONS so consecutive entries are adjacent', () => {
    for (let i = 0; i < 6; i++) {
      expect(distance(DIRECTIONS[i], DIRECTIONS[(i + 1) % 6])).toBe(1)
    }
  })

  it('places diagonals two steps away', () => {
    for (const d of DIAGONALS) expect(distance(hex(0, 0), d)).toBe(2)
  })
})

describe('distance', () => {
  it('is zero for identical hexes', () => {
    expect(distance(hex(4, -2), hex(4, -2))).toBe(0)
  })

  it('is symmetric', () => {
    expect(distance(hex(0, 0), hex(3, -1))).toBe(distance(hex(3, -1), hex(0, 0)))
  })

  it('counts steps along a straight run', () => {
    expect(distance(hex(0, 0), hex(4, 0))).toBe(4)
    expect(distance(hex(0, 0), hex(0, -3))).toBe(3)
    expect(distance(hex(0, 0), hex(-2, -2))).toBe(4)
  })
})

describe('round', () => {
  it('leaves exact coordinates untouched', () => {
    expect(round(hex(2, -3))).toEqual(hex(2, -3))
  })

  it('snaps to a hex satisfying the cube constraint', () => {
    const result = round({ q: 0.4, r: -0.3 })
    const cube = toCube(result)
    expect(cube.q + cube.r + cube.s).toBe(0)
  })

  it('never returns negative zero', () => {
    for (const frac of [
      { q: -0.2, r: 0.1 },
      { q: 0.1, r: -0.2 },
      { q: -0.1, r: -0.1 },
    ]) {
      const result = round(frac)
      expect(Object.is(result.q, -0)).toBe(false)
      expect(Object.is(result.r, -0)).toBe(false)
    }
  })

  it('picks the nearest hex near a boundary', () => {
    expect(round({ q: 0.6, r: 0.1 })).toEqual(hex(1, 0))
    expect(round({ q: 0.4, r: 0.1 })).toEqual(hex(0, 0))
  })
})

describe('line', () => {
  it('returns the single hex when start equals end', () => {
    expect(line(hex(2, 2), hex(2, 2))).toEqual([hex(2, 2)])
  })

  it('spans distance + 1 hexes with matching endpoints', () => {
    const a = hex(-3, 4)
    const b = hex(2, -1)
    const path = line(a, b)
    expect(path).toHaveLength(distance(a, b) + 1)
    expect(path[0]).toEqual(a)
    expect(path[path.length - 1]).toEqual(b)
  })

  it('steps exactly one hex at a time', () => {
    const path = line(hex(0, 0), hex(5, -2))
    for (let i = 1; i < path.length; i++) {
      expect(distance(path[i - 1], path[i])).toBe(1)
    }
  })
})

describe('ring', () => {
  it('returns just the center at radius 0', () => {
    expect(ring(hex(3, 3), 0)).toEqual([hex(3, 3)])
  })

  it('returns 6 * radius hexes all at that distance', () => {
    const center = hex(-1, 2)
    for (const radius of [1, 2, 5]) {
      const result = ring(center, radius)
      expect(result).toHaveLength(6 * radius)
      expect(new Set(result.map(hexKey)).size).toBe(6 * radius)
      for (const h of result) expect(distance(center, h)).toBe(radius)
    }
  })

  it('is a closed loop of adjacent hexes', () => {
    const result = ring(hex(0, 0), 3)
    for (let i = 0; i < result.length; i++) {
      expect(distance(result[i], result[(i + 1) % result.length])).toBe(1)
    }
  })

  it('rejects a negative radius', () => {
    expect(() => ring(hex(0, 0), -1)).toThrow(RangeError)
  })
})

describe('spiral and range', () => {
  it('covers 1 + 3r(r+1) hexes', () => {
    for (const radius of [0, 1, 2, 4]) {
      expect(spiral(hex(0, 0), radius)).toHaveLength(1 + 3 * radius * (radius + 1))
    }
  })

  it('starts at the center and never repeats', () => {
    const result = spiral(hex(2, -2), 3)
    expect(result[0]).toEqual(hex(2, -2))
    expect(new Set(result.map(hexKey)).size).toBe(result.length)
  })

  it('covers the same hexes as range', () => {
    const center = hex(1, 1)
    expect(sortKeys(spiral(center, 3))).toEqual(sortKeys(range(center, 3)))
  })
})

describe('rotate', () => {
  it('advances a hex by one entry in DIRECTIONS per step', () => {
    const center = hex(0, 0)
    for (let i = 0; i < 6; i++) {
      expect(rotate(DIRECTIONS[i], center, 1)).toEqual(DIRECTIONS[(i + 1) % 6])
    }
  })

  it('returns to the start after six steps', () => {
    const h = hex(3, -1)
    expect(rotate(h, hex(0, 0), 6)).toEqual(h)
    expect(rotate(h, hex(0, 0), 0)).toEqual(h)
  })

  it('rotates around an arbitrary center and preserves distance', () => {
    const center = hex(-2, 5)
    const h = hex(1, 3)
    const rotated = rotate(h, center, 2)
    expect(distance(center, rotated)).toBe(distance(center, h))
    expect(rotate(rotated, center, -2)).toEqual(h)
  })

  it('leaves the center fixed', () => {
    expect(rotate(hex(4, 4), hex(4, 4), 3)).toEqual(hex(4, 4))
  })
})
