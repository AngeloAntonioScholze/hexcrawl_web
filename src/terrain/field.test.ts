import { Color3 } from '@babylonjs/core/Maths/math.color'
import { describe, expect, it } from 'vitest'
import { hexKey, range, type Axial, type HexKey } from '../hex/coords'
import { createLayout } from '../hex/layout'
import { createTerrainField, fieldFromTiles, repainted, withOverrides } from './field'
import { MAP_STYLES } from './mapStyles'
import { settledLevel } from './slopes'
import {
  bandFor,
  createPainter,
  createTerrain,
  landAt,
  TERRAIN_DEFAULTS,
  TERRAIN_IDS,
  type TerrainId,
  type TerrainTile,
} from './terrain'

const layout = createLayout(2)

const field = (radius: number) =>
  createTerrainField(layout, { ...TERRAIN_DEFAULTS, radius, octaves: 4 })

const tile = (hex: Axial): TerrainTile => ({
  hex,
  terrain: 'grass',
  height: 1,
  level: 1,
  elevation: 1.5,
  color: new Color3(0, 0, 0),
})

describe('createTerrainField', () => {
  it('works a hex out once and hands the same tile back after', () => {
    const world = field(10)

    const first = world.at({ q: 1, r: 2 })
    const second = world.at({ q: 1, r: 2 })

    expect(first).toBeDefined()
    expect(second).toBe(first)
    expect(world.known).toBe(1)
  })

  it('builds nothing until it is asked', () => {
    expect(field(300).known).toBe(0)
  })

  it('has no ground beyond the rim', () => {
    const world = field(5)

    expect(world.at({ q: 5, r: 0 })).toBeDefined()
    expect(world.at({ q: 6, r: 0 })).toBeUndefined()
    expect(world.at({ q: -3, r: -3 })).toBeUndefined()
    expect(world.known).toBe(1)
  })

  it('lays the same ground as the terrain function it wraps', () => {
    const a = field(8).at({ q: 2, r: -1 })!
    const b = field(8).at({ q: 2, r: -1 })!

    expect(b.terrain).toBe(a.terrain)
    expect(b.level).toBe(a.level)
    expect(b.elevation).toBeCloseTo(a.elevation)
  })

  it('settles every hex the way settling one hex alone would', () => {
    const radius = 45
    for (const style of MAP_STYLES) {
      const options = { ...TERRAIN_DEFAULTS, octaves: 4, style, radius }
      // The plain reading of the slopes, with nothing kept between hexes.
      const noise = createTerrain(layout, options)
      const lower = createPainter(options)
      const expected = (hex: Axial): TerrainTile => {
        const ground = noise(hex)
        const level = settledLevel(hex, (q, r) => noise({ q, r }).level)
        return level === ground.level ? ground : lower(ground, landAt(level))
      }

      const world = createTerrainField(layout, options)
      // Read out of order, so no answer leans on its neighbours being read first.
      const hexes = range({ q: 0, r: 0 }, radius).sort(
        (a, b) => ((a.q * 7919 + a.r * 104729) % 97) - ((b.q * 7919 + b.r * 104729) % 97),
      )
      for (const hex of hexes) expect(world.at(hex)).toEqual(expected(hex))
      expect(world.known).toBe(hexes.length)
      expect(world.at({ q: radius + 1, r: 0 })).toBeUndefined()
    }
  })
})

describe('fieldFromTiles', () => {
  it('reads ground somebody else laid out', () => {
    const tiles = new Map<HexKey, TerrainTile>(
      range({ q: 0, r: 0 }, 2).map((hex) => [hexKey(hex), tile(hex)]),
    )
    const world = fieldFromTiles(tiles)

    expect(world.at({ q: 1, r: 0 })).toBe(tiles.get('1,0'))
    expect(world.at({ q: 9, r: 0 })).toBeUndefined()
    expect(world.radius).toBe(2)
    expect(world.known).toBe(tiles.size)
  })

  it('has no rim at all when it was handed nothing', () => {
    const world = fieldFromTiles(new Map())

    expect(world.radius).toBe(0)
    expect(world.at({ q: 0, r: 0 })).toBeUndefined()
  })
})

describe('repainted', () => {
  it('names every hex painted, painted differently or wiped', () => {
    const before = new Map<HexKey, TerrainId>([
      ['0,0', 'peaks'],
      ['1,0', 'water'],
      ['2,0', 'sand'],
    ])
    const after = new Map<HexKey, TerrainId>([
      ['0,0', 'peaks'],
      ['1,0', 'forest'],
      ['3,0', 'grass'],
    ])

    expect(repainted(before, after).sort()).toEqual(['1,0', '2,0', '3,0'])
    expect(repainted(after, after)).toEqual([])
  })
})

describe('withOverrides', () => {
  const paint = createPainter(TERRAIN_DEFAULTS)
  const painted = (overrides: Record<string, TerrainId>) =>
    withOverrides(field(10), new Map(Object.entries(overrides) as [HexKey, TerrainId][]), paint)

  it('hands back the world itself when nothing is painted', () => {
    const world = field(10)
    expect(withOverrides(world, new Map(), paint)).toBe(world)
  })

  it('lays the painted terrain over the hexes named and nowhere else', () => {
    const world = painted({ '1,0': 'peaks' })

    expect(world.at({ q: 1, r: 0 })?.terrain).toBe('peaks')
    expect(world.at({ q: 0, r: 1 })).toEqual(field(10).at({ q: 0, r: 1 }))
  })

  it('stands painted ground where its band stands', () => {
    for (const terrain of TERRAIN_IDS) {
      const tile = painted({ '0,0': terrain }).at({ q: 0, r: 0 })!
      const band = bandFor(tile.height)

      expect(band.id).toBe(terrain)
      expect(tile.level).toBe(band.level)
      expect(tile.color).toBe(band.color)
    }
  })

  it('draws higher bands taller', () => {
    const heights = TERRAIN_IDS.map(
      (terrain) => painted({ '0,0': terrain }).at({ q: 0, r: 0 })!.elevation,
    )
    for (let index = 2; index < heights.length; index++) {
      expect(heights[index]).toBeGreaterThan(heights[index - 1])
    }
    expect(heights[0]).toBe(TERRAIN_DEFAULTS.seaFloor)
    expect(heights[1]).toBe(TERRAIN_DEFAULTS.seaFloor)
  })

  it('paints nothing past the rim', () => {
    expect(painted({ '20,0': 'peaks' }).at({ q: 20, r: 0 })).toBeUndefined()
  })

  it('works a painted hex out once', () => {
    const world = painted({ '1,0': 'forest' })
    expect(world.at({ q: 1, r: 0 })).toBe(world.at({ q: 1, r: 0 }))
  })
})
