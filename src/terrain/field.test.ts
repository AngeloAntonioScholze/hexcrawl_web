import { Color3 } from '@babylonjs/core/Maths/math.color'
import { describe, expect, it } from 'vitest'
import { hexKey, range, type Axial, type HexKey } from '../hex/coords'
import { createLayout } from '../hex/layout'
import { createTerrainField, fieldFromTiles } from './field'
import { TERRAIN_DEFAULTS, type TerrainTile } from './terrain'

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
