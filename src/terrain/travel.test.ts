import { Color3 } from '@babylonjs/core/Maths/math.color'
import { describe, expect, it } from 'vitest'
import { hexKey, range, type Axial, type HexKey } from '../hex/coords'
import { createLayout } from '../hex/layout'
import { createTerrain, type TerrainTile } from './terrain'
import { CLIMB_MULTIPLIER, CLIMB_THRESHOLD, KM_PER_HEX, findRoute, stepCostKm } from './travel'

// The number is the mechanical level; the rendered height is derived from it so
// nothing here can lean on the rendered number by accident.
const tile = (hex: Axial, level: number): TerrainTile => ({
  hex,
  terrain: 'grass',
  height: level,
  level,
  elevation: 0.5 + level,
  color: new Color3(0, 0, 0),
})

// Water is anything below sea level: negative height, the ground floor, and a
// flat sea-floor elevation.
const water = (hex: Axial): TerrainTile => ({
  hex,
  terrain: 'water',
  height: -0.5,
  level: 0,
  elevation: 0.3,
  color: new Color3(0, 0, 0),
})

const mapOf = (entries: [Axial, number][]): Map<HexKey, TerrainTile> =>
  new Map(entries.map(([hex, level]) => [hexKey(hex), tile(hex, level)]))

const flatField = (radius: number, level = 1): Map<HexKey, TerrainTile> =>
  mapOf(range({ q: 0, r: 0 }, radius).map((hex) => [hex, level] as [Axial, number]))

describe('stepCostKm', () => {
  const step = (from: number, to: number): number =>
    stepCostKm(tile({ q: 0, r: 0 }, from), tile({ q: 1, r: 0 }, to))

  it('charges one hex for level ground', () => {
    expect(step(2, 2)).toBe(KM_PER_HEX)
  })

  it('charges plain distance for a descent', () => {
    expect(step(5, 1)).toBe(KM_PER_HEX)
  })

  it('reads the level and not the rendered height', () => {
    const low = { ...tile({ q: 0, r: 0 }, 2), elevation: 0.5 }
    const towering = { ...tile({ q: 1, r: 0 }, 2), elevation: 40 }
    expect(stepCostKm(low, towering)).toBe(KM_PER_HEX)
  })

  it('charges double once the rise reaches the threshold', () => {
    expect(step(2, 2 + CLIMB_THRESHOLD)).toBe(KM_PER_HEX * CLIMB_MULTIPLIER)
    expect(step(2, 20)).toBe(KM_PER_HEX * CLIMB_MULTIPLIER)
  })

  it('charges the same for any climb past the threshold, however steep', () => {
    expect(step(1, 1 + CLIMB_THRESHOLD)).toBe(step(1, 400))
  })

  it('lets a party wade ashore at the plain rate', () => {
    // Water and the beach share the ground floor, so coming out is not a climb.
    expect(stepCostKm(water({ q: 0, r: 0 }), tile({ q: 1, r: 0 }, 0))).toBe(KM_PER_HEX)
  })
})

describe('findRoute', () => {
  it('costs ten kilometres per hex across flat ground', () => {
    const route = findRoute(flatField(6), { q: 0, r: 0 }, { q: 4, r: 0 })!
    expect(route.steps).toBe(4)
    expect(route.km).toBe(40)
    expect(route.hexes).toHaveLength(5)
  })

  it('counts hexes entered, not hexes occupied', () => {
    const route = findRoute(flatField(4), { q: 0, r: 0 }, { q: 2, r: 0 })!
    expect(route.hexes).toHaveLength(route.steps + 1)
  })

  it('costs nothing to stand still', () => {
    const route = findRoute(flatField(3), { q: 0, r: 0 }, { q: 0, r: 0 })!
    expect(route.km).toBe(0)
    expect(route.steps).toBe(0)
  })

  it('charges double for every climbing step', () => {
    // A staircase rising a full threshold per hex along +q.
    const tiles = mapOf(
      range({ q: 0, r: 0 }, 6).map((hex) => [hex, 1 + hex.q * CLIMB_THRESHOLD] as [Axial, number]),
    )
    const uphill = findRoute(tiles, { q: 0, r: 0 }, { q: 3, r: 0 })!
    expect(uphill.km).toBe(3 * KM_PER_HEX * CLIMB_MULTIPLIER)

    const downhill = findRoute(tiles, { q: 3, r: 0 }, { q: 0, r: 0 })!
    expect(downhill.km).toBe(3 * KM_PER_HEX)
  })

  // A single ridge is cheap to cross, because only the one climbing step
  // doubles; contouring only wins against a sustained climb.
  it('contours around a sustained climb instead of going over it', () => {
    const tiles = flatField(6)
    for (const [q, elevation] of [
      [1, 3],
      [2, 6],
      [3, 9],
    ]) {
      tiles.set(hexKey({ q, r: 0 }), tile({ q, r: 0 }, elevation))
    }

    const route = findRoute(tiles, { q: 0, r: 0 }, { q: 4, r: 0 })!
    expect(route.hexes.some((h) => h.r === 0 && h.q >= 1 && h.q <= 3)).toBe(false)
    // Five level hexes at 10km beats four hexes with three climbs at 70km.
    expect(route.km).toBe(50)
    expect(route.steps).toBe(5)
  })

  it('crosses a single ridge rather than walking around it', () => {
    const tiles = flatField(8)
    for (const hex of [...tiles.values()].map((t) => t.hex).filter((h) => h.q === 2)) {
      tiles.set(hexKey(hex), tile(hex, 9))
    }
    const route = findRoute(tiles, { q: 0, r: 0 }, { q: 4, r: 0 })!
    expect(route.steps).toBe(4)
    expect(route.km).toBe(50)
  })

  it('climbs anyway when going around costs more', () => {
    // The same ridge, now sealing off every way round.
    const tiles = mapOf(
      range({ q: 0, r: 0 }, 8).map((hex) => [hex, hex.q === 2 ? 9 : 1] as [Axial, number]),
    )
    const route = findRoute(tiles, { q: 0, r: 0 }, { q: 4, r: 0 })!
    expect(route.hexes.some((h) => h.q === 2)).toBe(true)
  })

  it('never costs less than the flat distance', () => {
    const layout = createLayout(2)
    const terrain = createTerrain(layout, { seed: 5 })
    const tiles = new Map(
      range({ q: 0, r: 0 }, 12).map((hex) => [hexKey(hex), terrain(hex)] as const),
    )

    for (const goal of [
      { q: 8, r: -4 },
      { q: -6, r: 2 },
      { q: 3, r: 7 },
    ]) {
      const route = findRoute(tiles, { q: 0, r: 0 }, goal, { allowWater: true })!
      expect(route.km).toBeGreaterThanOrEqual(route.steps * KM_PER_HEX)
      expect(route.km).toBeLessThanOrEqual(route.steps * KM_PER_HEX * CLIMB_MULTIPLIER)
    }
  })

  it('returns null when an endpoint is off the map', () => {
    const tiles = flatField(3)
    expect(findRoute(tiles, { q: 0, r: 0 }, { q: 40, r: 0 })).toBeNull()
    expect(findRoute(tiles, { q: 40, r: 0 }, { q: 0, r: 0 })).toBeNull()
  })

  it('stays inside the mapped area', () => {
    const tiles = flatField(5)
    const route = findRoute(tiles, { q: -4, r: 0 }, { q: 4, r: 0 })!
    for (const hex of route.hexes) expect(tiles.has(hexKey(hex))).toBe(true)
  })
})

describe('water crossings', () => {
  // A channel along q = 2 splitting the map, with dry land either side.
  const channel = (): Map<HexKey, TerrainTile> => {
    const tiles = flatField(6)
    for (const hex of [...tiles.values()].map((t) => t.hex).filter((h) => h.q === 2)) {
      tiles.set(hexKey(hex), water(hex))
    }
    return tiles
  }

  it('refuses to cross water by default', () => {
    expect(findRoute(channel(), { q: 0, r: 0 }, { q: 4, r: 0 })).toBeNull()
  })

  it('crosses when water is allowed', () => {
    const route = findRoute(channel(), { q: 0, r: 0 }, { q: 4, r: 0 }, { allowWater: true })!
    expect(route.hexes.some((h) => h.q === 2)).toBe(true)
    expect(route.steps).toBe(4)
  })

  it('refuses a route that starts or ends in water', () => {
    const tiles = channel()
    expect(findRoute(tiles, { q: 2, r: 0 }, { q: 0, r: 0 })).toBeNull()
    expect(findRoute(tiles, { q: 0, r: 0 }, { q: 2, r: 0 })).toBeNull()
  })

  it('allows a route that starts or ends in water when water is allowed', () => {
    const tiles = channel()
    expect(findRoute(tiles, { q: 2, r: 0 }, { q: 0, r: 0 }, { allowWater: true })).not.toBeNull()
  })

  it('walks around a lake rather than through it', () => {
    // A single water hex directly between the endpoints.
    const tiles = flatField(6)
    tiles.set(hexKey({ q: 1, r: 0 }), water({ q: 1, r: 0 }))

    const route = findRoute(tiles, { q: 0, r: 0 }, { q: 2, r: 0 })!
    expect(route.hexes.some((h) => h.q === 1 && h.r === 0)).toBe(false)
    expect(route.steps).toBe(3)
  })

  it('takes the shorter wet route when water is allowed', () => {
    // Land at the sea-floor height, so crossing costs no climb either way and
    // the comparison is purely about distance.
    const tiles = flatField(6, 0.3)
    tiles.set(hexKey({ q: 1, r: 0 }), water({ q: 1, r: 0 }))

    const dry = findRoute(tiles, { q: 0, r: 0 }, { q: 2, r: 0 })!
    const wet = findRoute(tiles, { q: 0, r: 0 }, { q: 2, r: 0 }, { allowWater: true })!
    expect(wet.km).toBeLessThan(dry.km)
    expect(wet.steps).toBe(2)
  })

  it('still charges the climb out of the water', () => {
    const tiles = flatField(4, 3)
    tiles.set(hexKey({ q: 1, r: 0 }), water({ q: 1, r: 0 }))

    // Into the water is a descent, back out is a climb.
    const route = findRoute(tiles, { q: 0, r: 0 }, { q: 2, r: 0 }, { allowWater: true })!
    expect(route.km).toBe(KM_PER_HEX + KM_PER_HEX * CLIMB_MULTIPLIER)
  })
})
