import { describe, expect, it } from 'vitest'
import { createLayout, corners, hexHeight, hexToWorld, hexWidth, worldToHex } from './layout'
import { hexKey, neighbors, range } from './coords'
import type { Axial } from './coords'

const hex = (q: number, r: number): Axial => ({ q, r })
const layout = createLayout(10)
const offset = createLayout(2.5, { x: -13.5, z: 7 })

describe('createLayout', () => {
  it('rejects a non-positive size', () => {
    expect(() => createLayout(0)).toThrow(RangeError)
    expect(() => createLayout(-3)).toThrow(RangeError)
  })

  it('defaults the origin to the world origin', () => {
    expect(createLayout(1).origin).toEqual({ x: 0, z: 0 })
  })
})

describe('hexToWorld', () => {
  it('places the origin hex at the layout origin', () => {
    expect(hexToWorld(layout, hex(0, 0))).toEqual({ x: 0, z: 0 })
    expect(hexToWorld(offset, hex(0, 0))).toEqual({ x: -13.5, z: 7 })
  })

  it('keeps the +q axis horizontal, as pointy-top rows require', () => {
    const east = hexToWorld(layout, hex(1, 0))
    expect(east.z).toBeCloseTo(0, 10)
    expect(east.x).toBeCloseTo(hexWidth(layout), 10)
  })

  it('offsets each row by half a hex width', () => {
    const nextRow = hexToWorld(layout, hex(0, 1))
    expect(nextRow.x).toBeCloseTo(hexWidth(layout) / 2, 10)
    expect(nextRow.z).toBeCloseTo(hexHeight(layout) * 0.75, 10)
  })

  it('spaces neighbors one hex apart in world space', () => {
    const center = hexToWorld(layout, hex(4, -2))
    for (const n of neighbors(hex(4, -2))) {
      const p = hexToWorld(layout, n)
      const d = Math.hypot(p.x - center.x, p.z - center.z)
      expect(d).toBeCloseTo(hexWidth(layout), 10)
    }
  })
})

describe('worldToHex', () => {
  it('round-trips every hex in a radius-8 map', () => {
    for (const h of range(hex(0, 0), 8)) {
      expect(worldToHex(layout, hexToWorld(layout, h))).toEqual(h)
    }
  })

  it('round-trips under a scaled, translated layout', () => {
    for (const h of range(hex(-3, 4), 5)) {
      expect(worldToHex(offset, hexToWorld(offset, h))).toEqual(h)
    }
  })

  it('resolves points inside a hex to that hex', () => {
    const target = hex(2, -1)
    const center = hexToWorld(layout, target)
    const inset = layout.size * 0.4
    const samples = [
      { x: center.x + inset, z: center.z },
      { x: center.x - inset, z: center.z },
      { x: center.x, z: center.z + inset },
      { x: center.x, z: center.z - inset },
    ]
    for (const p of samples) {
      expect(worldToHex(layout, p)).toEqual(target)
    }
  })

  it('resolves a point just past an edge to the neighbor', () => {
    const center = hexToWorld(layout, hex(0, 0))
    const justOver = { x: center.x + hexWidth(layout) * 0.55, z: center.z }
    expect(worldToHex(layout, justOver)).toEqual(hex(1, 0))
  })
})

describe('corners', () => {
  it('returns six corners at the layout size from the center', () => {
    const center = hexToWorld(layout, hex(-2, 3))
    const result = corners(layout, hex(-2, 3))
    expect(result).toHaveLength(6)
    for (const c of result) {
      expect(Math.hypot(c.x - center.x, c.z - center.z)).toBeCloseTo(layout.size, 10)
    }
  })

  it('puts a vertex at the top and bottom, not a flat edge', () => {
    const zs = corners(layout, hex(0, 0)).map((c) => c.z)
    const extremes = zs.filter((z) => Math.abs(Math.abs(z) - layout.size) < 1e-10)
    expect(extremes).toHaveLength(2)
  })

  it('shares two corners with every neighbor', () => {
    // Corners come out of cos/sin, so matching them needs a tolerance rather
    // than exact equality: the same vertex differs by ~1e-15 between hexes.
    const own = corners(layout, hex(0, 0))
    for (const n of neighbors(hex(0, 0))) {
      const shared = corners(layout, n).filter((c) =>
        own.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < 1e-9),
      )
      expect(shared, `neighbor ${hexKey(n)}`).toHaveLength(2)
    }
  })
})

describe('dimensions', () => {
  it('derives width and height from the layout size', () => {
    expect(hexWidth(layout)).toBeCloseTo(Math.sqrt(3) * 10, 10)
    expect(hexHeight(layout)).toBe(20)
  })
})
