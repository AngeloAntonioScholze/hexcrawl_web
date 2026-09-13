import { Color3 } from '@babylonjs/core/Maths/math.color'
import { describe, expect, it } from 'vitest'
import { hexKey, range, type Axial, type HexKey } from '../hex/coords'
import { sightFrom } from './sight'
import type { TerrainTile } from './terrain'
import { fieldFromTiles } from './field'

const tile = (hex: Axial, level: number): TerrainTile => ({
  hex,
  terrain: 'grass',
  height: level,
  level,
  elevation: 0.5 + level,
  color: new Color3(0, 0, 0),
})

const field = (radius: number, peaks: Record<string, number> = {}) =>
  new Map<HexKey, TerrainTile>(
    range({ q: 0, r: 0 }, radius).map((hex) => [hexKey(hex), tile(hex, peaks[hexKey(hex)] ?? 1)]),
  )

describe('sightFrom', () => {
  it('keys every hex the party can see', () => {
    const { visible } = sightFrom(
      fieldFromTiles(field(8)),
      { q: 0, r: 0 },
      { radius: 3, perElevation: 0 },
    )
    expect(visible.has('0,0')).toBe(true)
    expect(visible.has('3,0')).toBe(true)
    expect(visible.has('4,0')).toBe(false)
  })

  it('hides what a mountain of terrain stands in front of, and says where', () => {
    const origin = { q: 0, r: 0 }
    const { visible, blocked } = sightFrom(fieldFromTiles(field(8, { '2,0': 30 })), origin, {
      radius: 5,
      perElevation: 0,
    })

    expect(visible.has('2,0')).toBe(true)
    expect(visible.has('4,0')).toBe(false)
    expect(blocked.has('4,0')).toBe(true)
  })

  it('reports the reach it worked out from the ground underfoot', () => {
    const low = sightFrom(fieldFromTiles(field(8)), { q: 0, r: 0 }, { radius: 3 })
    const high = sightFrom(fieldFromTiles(field(8, { '0,0': 4 })), { q: 0, r: 0 }, { radius: 3 })
    expect(high.radius).toBeGreaterThan(low.radius)
  })

  it('reads the level and not the rendered height', () => {
    const tiles = field(8)
    const spike = tiles.get('2,0')!
    tiles.set('2,0', { ...spike, elevation: 90 })

    // A tile rendered as a spire blocks nothing while it stands on the same step.
    const { visible } = sightFrom(
      fieldFromTiles(tiles),
      { q: 0, r: 0 },
      { radius: 5, perElevation: 0 },
    )
    expect(visible.has('4,0')).toBe(true)
  })

  it('sees nothing when the party is standing off the map', () => {
    const sight = sightFrom(fieldFromTiles(field(3)), { q: 40, r: 0 })
    expect(sight.visible.size).toBe(0)
    expect(sight.blocked.size).toBe(0)
  })
})
