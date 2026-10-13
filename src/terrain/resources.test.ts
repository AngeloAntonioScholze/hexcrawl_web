import { describe, expect, it } from 'vitest'
import { DEFAULT_RESOURCE_CHANCE, defaultResourceChances, TERRAIN_RESOURCES } from './resources'
import type { TerrainId } from './terrain'

const TERRAINS: readonly TerrainId[] = [
  'deepWater',
  'water',
  'sand',
  'grass',
  'forest',
  'mountains',
  'peaks',
]

describe('the resource table', () => {
  it('gives every terrain, land and water, something to hold', () => {
    expect(Object.keys(TERRAIN_RESOURCES).sort()).toEqual([...TERRAINS].sort())
    for (const terrain of TERRAINS) expect(TERRAIN_RESOURCES[terrain].length).toBeGreaterThan(0)
  })

  it('starts every terrain at the same default odds', () => {
    const chances = defaultResourceChances()
    for (const terrain of TERRAINS) expect(chances[terrain]).toBe(DEFAULT_RESOURCE_CHANCE)
  })
})
