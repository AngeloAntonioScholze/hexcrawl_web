import { describe, expect, it } from 'vitest'
import { spiral, type Axial } from '../hex/coords'
import { createLayout } from '../hex/layout'
import {
  MAX_LEVEL,
  TERRAIN_IDS,
  TERRAIN_LABELS,
  bandFor,
  createTerrain,
  type TerrainId,
} from './terrain'

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
    const order: TerrainId[] = [
      'deepWater',
      'water',
      'sand',
      'grass',
      'forest',
      'mountains',
      'peaks',
    ]
    const seen = [-0.5, -0.1, 0.03, 0.15, 0.35, 0.6, 0.9].map((h) => bandFor(h).id)
    expect(seen).toEqual(order)
  })

  it('lists the terrain ids in the order the bands climb, each with a label', () => {
    const climb = [-0.5, -0.1, 0.03, 0.15, 0.35, 0.6, 0.9].map((h) => bandFor(h).id)
    expect(TERRAIN_IDS).toEqual(climb)
    expect(TERRAIN_LABELS.deepWater).toBe('deep water')
  })
})

describe('levels', () => {
  it('puts water and the beach together on the ground floor', () => {
    for (const height of [-1, -0.3, -0.01, 0, 0.05]) {
      expect(bandFor(height).level).toBe(0)
    }
  })

  it('climbs one step at a time through the land bands', () => {
    const steps = [0.05, 0.15, 0.35, 0.6, 0.9].map((h) => bandFor(h).level)
    expect(steps).toEqual([0, 1, 2, 3, 4])
  })

  it('never leaves a gap between the steps it reports', () => {
    expect(MAX_LEVEL).toBe(4)
  })

  it('agrees with the rendered height on which hex is higher', () => {
    const tiles = sampleAll().sort((a, b) => a.elevation - b.elevation)
    for (let i = 1; i < tiles.length; i++) {
      expect(tiles[i].level).toBeGreaterThanOrEqual(tiles[i - 1].level)
    }
  })

  it('draws every land hex on one step at one height', () => {
    const land = sampleAll().filter((tile) => tile.height >= 0)
    for (let level = 0; level <= MAX_LEVEL; level++) {
      const tiles = land.filter((tile) => tile.level === level)
      expect(tiles.length, `level ${level}`).toBeGreaterThan(1)
      expect(new Set(tiles.map((tile) => tile.elevation)).size, `level ${level}`).toBe(1)
    }
  })

  it('puts the beach at the shoreline and the peaks a full relief above it', () => {
    const options = { shore: 0.8, relief: 5, reliefCurve: 1.5 }
    const land = sampleAll(options).filter((tile) => tile.height >= 0)
    const at = (level: number): number => land.find((tile) => tile.level === level)!.elevation
    expect(at(0)).toBeCloseTo(0.8)
    expect(at(2)).toBeCloseTo(0.8 + Math.pow(0.5, 1.5) * 5)
    expect(at(MAX_LEVEL)).toBeCloseTo(5.8)
  })

  it('reaches every step at the default settings', () => {
    const seen = new Set(sampleAll().map((tile) => tile.level))
    expect([...seen].sort()).toEqual([0, 1, 2, 3, 4])
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

  it('opens a gap between the plains and the peaks', () => {
    const land = sampleAll().filter((tile) => tile.height >= 0)
    const peak = Math.max(...land.map((tile) => tile.elevation))
    const shore = Math.min(...land.map((tile) => tile.elevation))
    expect(peak - shore).toBeGreaterThan(6)
  })

  it('holds the lowlands down as the relief curve steepens', () => {
    const midpoint = (reliefCurve: number): number => {
      const tiles = sampleAll({ reliefCurve })
        .filter((tile) => tile.height >= 0)
        .sort((a, b) => a.elevation - b.elevation)
      return tiles[Math.floor(tiles.length / 2)].elevation
    }
    expect(midpoint(2)).toBeLessThan(midpoint(1))
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
    for (const id of ['deepWater', 'water', 'sand', 'grass', 'forest', 'mountains', 'peaks']) {
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
