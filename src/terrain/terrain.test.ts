import { describe, expect, it } from 'vitest'
import { spiral, type Axial } from '../hex/coords'
import { createLayout } from '../hex/layout'
import { bandFor, createTerrain, type TerrainId } from './terrain'

const layout = createLayout(2)
const field = spiral({ q: 0, r: 0 }, 22)

const sampleAll = (options = {}): ReturnType<ReturnType<typeof createTerrain>>[] => {
  const terrain = createTerrain(layout, options)
  return field.map(terrain)
}

describe('bandFor', () => {
  it('puts everything below zero underwater', () => {
    const wet: TerrainId[] = ['deepWater', 'water']
    for (const height of [-1, -0.5, -0.3, -0.01, -1e-9]) {
      expect(wet).toContain(bandFor(height).id)
    }
  })

  it('puts zero and above on land', () => {
    const wet: TerrainId[] = ['deepWater', 'water']
    for (const height of [0, 1e-9, 0.2, 0.6, 1]) {
      expect(wet).not.toContain(bandFor(height).id)
    }
  })

  it('climbs through the bands in order', () => {
    const order: TerrainId[] = ['deepWater', 'water', 'sand', 'grass', 'forest', 'rock', 'snow']
    const seen = [-0.5, -0.1, 0.03, 0.15, 0.35, 0.6, 0.9].map((h) => bandFor(h).id)
    expect(seen).toEqual(order)
  })
})

describe('createTerrain', () => {
  it('is deterministic for a seed', () => {
    const a = sampleAll({ seed: 7 })
    const b = sampleAll({ seed: 7 })
    expect(a.map((t) => t.height)).toEqual(b.map((t) => t.height))
  })

  it('produces a different world for a different seed', () => {
    const a = sampleAll({ seed: 7 })
    const b = sampleAll({ seed: 8 })
    const differing = a.filter((tile, i) => tile.height !== b[i].height)
    expect(differing.length).toBeGreaterThan(a.length * 0.9)
  })

  it('flags every tile below sea level as water', () => {
    for (const tile of sampleAll()) {
      const wet = tile.terrain === 'water' || tile.terrain === 'deepWater'
      expect(wet, `hex ${tile.hex.q},${tile.hex.r} at ${tile.height}`).toBe(tile.height < 0)
    }
  })

  it('holds every water tile at one flat sea floor', () => {
    const water = sampleAll().filter((tile) => tile.height < 0)
    expect(water.length).toBeGreaterThan(0)
    expect(new Set(water.map((tile) => tile.elevation)).size).toBe(1)
  })

  it('raises land above the water line', () => {
    const tiles = sampleAll()
    const seaFloor = tiles.find((tile) => tile.height < 0)!.elevation
    for (const tile of tiles.filter((t) => t.height >= 0)) {
      expect(tile.elevation).toBeGreaterThan(seaFloor)
    }
  })

  it('keeps every rendered elevation positive', () => {
    for (const tile of sampleAll({ seed: 3 })) {
      expect(tile.elevation).toBeGreaterThan(0)
    }
  })

  it('climbs monotonically with height above sea level', () => {
    const land = sampleAll()
      .filter((tile) => tile.height >= 0)
      .sort((a, b) => a.height - b.height)
    for (let i = 1; i < land.length; i++) {
      expect(land[i].elevation).toBeGreaterThanOrEqual(land[i - 1].elevation)
    }
  })

  it('generates both land and water at the default settings', () => {
    const tiles = sampleAll()
    const water = tiles.filter((tile) => tile.height < 0).length
    expect(water).toBeGreaterThan(tiles.length * 0.15)
    expect(water).toBeLessThan(tiles.length * 0.85)
  })

  it('gives neighbouring hexes similar heights, not noise per tile', () => {
    const terrain = createTerrain(layout, {})
    const byKey = new Map(field.map((hex: Axial) => [`${hex.q},${hex.r}`, terrain(hex).height]))
    let compared = 0
    let close = 0
    for (const hex of field) {
      const here = byKey.get(`${hex.q},${hex.r}`)!
      const east = byKey.get(`${hex.q + 1},${hex.r}`)
      if (east === undefined) continue
      compared++
      if (Math.abs(here - east) < 0.3) close++
    }
    expect(close / compared).toBeGreaterThan(0.9)
  })

  it('uses the full height range rather than bunching near zero', () => {
    const heights = sampleAll().map((tile) => tile.height)
    expect(Math.max(...heights)).toBeGreaterThan(0.8)
    expect(Math.min(...heights)).toBeLessThan(-0.8)
  })

  it('reaches every terrain band at the default settings', () => {
    const seen = new Set(sampleAll().map((tile) => tile.terrain))
    for (const id of ['deepWater', 'water', 'sand', 'grass', 'forest', 'rock', 'snow']) {
      expect(seen, `missing ${id}`).toContain(id)
    }
  })

  it('floods the map as sea level rises', () => {
    const waterShare = (seaLevel: number): number =>
      sampleAll({ seaLevel }).filter((tile) => tile.height < 0).length / field.length
    expect(waterShare(0.3)).toBeGreaterThan(waterShare(0))
    expect(waterShare(-0.3)).toBeLessThan(waterShare(0))
  })

  it('clamps height to [-1, 1] whatever the contrast', () => {
    for (const tile of sampleAll({ contrast: 12 })) {
      expect(tile.height).toBeGreaterThanOrEqual(-1)
      expect(tile.height).toBeLessThanOrEqual(1)
    }
  })

  it('makes broader landmasses at a larger scale', () => {
    const spread = (scale: number): number => {
      const terrain = createTerrain(layout, { scale })
      let total = 0
      for (const hex of field) {
        total += Math.abs(terrain(hex).height - terrain({ q: hex.q + 1, r: hex.r }).height)
      }
      return total
    }
    expect(spread(20)).toBeGreaterThan(spread(120))
  })
})
