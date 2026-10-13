import { describe, expect, it } from 'vitest'
import {
  DEFAULT_RESOURCE_CHANCE,
  defaultResourceChances,
  nearestWithin,
  RESOURCE_LABELS,
  RESOURCE_TYPES,
  TERRAIN_RESOURCES,
  type Resource,
} from './resources'
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

describe('resource labels', () => {
  it('name every type the terrain table can hold', () => {
    for (const terrain of TERRAINS)
      for (const type of TERRAIN_RESOURCES[terrain]) expect(RESOURCE_LABELS[type]).toBeTruthy()
  })

  it('read as words, not identifiers', () => {
    expect(RESOURCE_LABELS.rareOre).toBe('Rare ore')
    expect(RESOURCE_LABELS.glassSand).toBe('Glass sand')
    for (const type of RESOURCE_TYPES) expect(RESOURCE_LABELS[type]).toMatch(/^[A-Z][a-z ]+$/)
  })
})

describe('the nearest resource within spacing', () => {
  const at = (id: string, hex: Resource['hex']): Resource => ({
    id,
    hex,
    type: 'iron',
    origin: 'manual',
  })

  it('is nothing on an empty map', () => {
    expect(nearestWithin('0,0', [], 10)).toBeNull()
  })

  it('counts one on the same hex as distance zero', () => {
    expect(nearestWithin('2,3', [at('a', '2,3')], 10)).toEqual({
      resource: at('a', '2,3'),
      distance: 0,
    })
  })

  it('picks the closest of several', () => {
    const near = nearestWithin('0,0', [at('far', '6,0'), at('near', '0,3'), at('mid', '4,0')], 10)
    expect(near?.resource.id).toBe('near')
    expect(near?.distance).toBe(3)
  })

  it('ignores resources at or beyond the spacing', () => {
    expect(nearestWithin('0,0', [at('edge', '10,0'), at('out', '0,12')], 10)).toBeNull()
    expect(nearestWithin('0,0', [at('in', '9,0')], 10)?.distance).toBe(9)
  })
})
