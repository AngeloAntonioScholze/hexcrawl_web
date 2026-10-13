import { Color3 } from '@babylonjs/core/Maths/math.color'
import { describe, expect, it } from 'vitest'
import { distance, hexKey, parseKey, range, type Axial, type HexKey } from '../hex/coords'
import { fieldFromTiles } from './field'
import { scatterResources } from './resourceGen'
import {
  defaultResourceChances,
  TERRAIN_RESOURCES,
  type Resource,
  type ResourceChances,
} from './resources'
import type { TerrainId, TerrainTile } from './terrain'

const tile = (hex: Axial, terrain: TerrainId): TerrainTile => ({
  hex,
  terrain,
  height: 1,
  level: 1,
  elevation: 1.5,
  color: new Color3(0, 0, 0),
})

const world = (radius: number, terrainOf: (hex: Axial) => TerrainId = () => 'grass') =>
  fieldFromTiles(
    new Map(range({ q: 0, r: 0 }, radius).map((hex) => [hexKey(hex), tile(hex, terrainOf(hex))])),
  )

const everywhere = (chance: number): ResourceChances => {
  const chances = defaultResourceChances()
  return Object.fromEntries(Object.keys(chances).map((id) => [id, chance])) as ResourceChances
}

const placed = (resources: readonly Resource[]) => resources.map(({ hex, type }) => ({ hex, type }))

const closestPair = (hexes: readonly HexKey[]): number => {
  let closest = Infinity
  const points = hexes.map(parseKey)
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      closest = Math.min(closest, distance(points[i], points[j]))
    }
  }
  return closest
}

describe('scatterResources', () => {
  const options = { chances: defaultResourceChances(), spacing: 10, seed: 42 }

  it('lays the same resources down for the same seed', () => {
    const first = scatterResources(world(60), options)
    const second = scatterResources(world(60), options)
    const other = scatterResources(world(60), { ...options, seed: 43 })

    expect(first.length).toBeGreaterThan(0)
    expect(placed(second)).toEqual(placed(first))
    expect(placed(other)).not.toEqual(placed(first))
  })

  it('marks everything it makes as generated, with an id of its own', () => {
    const made = scatterResources(world(30), options)

    expect(made.every((one) => one.origin === 'generated')).toBe(true)
    expect(new Set(made.map((one) => one.id)).size).toBe(made.length)
  })

  it('keeps every resource the spacing apart', () => {
    for (const spacing of [3, 10, 17]) {
      const made = scatterResources(world(60), { ...options, chances: everywhere(1), spacing })

      expect(made.length).toBeGreaterThan(1)
      expect(closestPair(made.map((one) => one.hex))).toBeGreaterThanOrEqual(spacing)
    }
  })

  it('keeps clear of the resources already on the map', () => {
    const existing: Resource[] = [
      { id: 'a', hex: '0,0', type: 'iron', origin: 'manual' },
      { id: 'b', hex: '-20,5', type: 'timber', origin: 'manual' },
    ]

    const made = scatterResources(world(40), {
      ...options,
      chances: everywhere(1),
      existing,
    })

    expect(closestPair([...existing, ...made].map((one) => one.hex))).toBeGreaterThanOrEqual(10)
    expect(made.some((one) => one.id === 'a' || one.id === 'b')).toBe(false)
  })

  it('fills every hex when the odds are certain and nothing has to keep apart', () => {
    const made = scatterResources(world(8), { ...options, chances: everywhere(1), spacing: 0 })

    expect(made.map((one) => one.hex).sort()).toEqual(range({ q: 0, r: 0 }, 8).map(hexKey).sort())
  })

  it('puts nothing on terrain whose odds are nil', () => {
    const field = world(40, (hex) => (hex.q < 0 ? 'forest' : 'mountains'))
    const chances = { ...everywhere(0), forest: 1 }

    const made = scatterResources(field, { ...options, chances, spacing: 0 })

    expect(made.length).toBe(range({ q: 0, r: 0 }, 40).filter((hex) => hex.q < 0).length)
    for (const one of made) {
      expect(parseKey(one.hex).q).toBeLessThan(0)
      expect(TERRAIN_RESOURCES.forest).toContain(one.type)
    }
  })

  it('hits about as often as the odds say', () => {
    const field = world(80)
    const hexes = range({ q: 0, r: 0 }, 80).length

    for (const chance of [0.05, 0.3]) {
      const made = scatterResources(field, { ...options, chances: everywhere(chance), spacing: 0 })
      expect(Math.abs(made.length / hexes - chance)).toBeLessThan(chance * 0.1)
    }
  })

  it('draws the type from what the terrain can hold', () => {
    const made = scatterResources(
      world(40, () => 'sand'),
      {
        ...options,
        chances: everywhere(1),
        spacing: 0,
      },
    )

    expect(new Set(made.map((one) => one.type))).toEqual(new Set(TERRAIN_RESOURCES.sand))
  })
})
