import { describe, expect, it } from 'vitest'
import { distance, neighbors, spiral, type Axial } from '../hex/coords'
import { createLayout } from '../hex/layout'
import { createTerrainField } from './field'
import { settledLevel } from './slopes'
import { bandFor, createTerrain, isWater, MAX_LEVEL, TERRAIN_DEFAULTS } from './terrain'

const ORIGIN: Axial = { q: 0, r: 0 }

describe('settledLevel', () => {
  it('rings summit ground with terraces down to the plain', () => {
    // A plateau of summit ground three hexes across, sheer above a plain.
    const plain = (q: number, r: number) => (distance(ORIGIN, { q, r }) >= 3 ? 1 : MAX_LEVEL)

    expect(settledLevel(ORIGIN, plain)).toBe(4)
    expect(settledLevel({ q: 1, r: 0 }, plain)).toBe(3)
    expect(settledLevel({ q: 2, r: -1 }, plain)).toBe(2)
    expect(settledLevel({ q: 3, r: 0 }, plain)).toBe(1)
  })

  it('brings a cliff down to one step over the shore', () => {
    const cliff = (q: number) => (q < 0 ? 0 : MAX_LEVEL)

    expect([0, 1, 2, 3, 4].map((q) => settledLevel({ q, r: 0 }, cliff))).toEqual([1, 2, 3, 4, 4])
    expect(settledLevel({ q: -1, r: 0 }, cliff)).toBe(0)
  })

  it('never lifts a hex above its own step', () => {
    const pit = (q: number, r: number) => (q === 0 && r === 0 ? 0 : MAX_LEVEL)
    expect(settledLevel(ORIGIN, pit)).toBe(0)
  })

  it('reads no further than the step it stands on', () => {
    const read: Axial[] = []
    settledLevel(ORIGIN, (q, r) => {
      read.push({ q, r })
      return MAX_LEVEL
    })

    expect(Math.max(...read.map((hex) => distance(ORIGIN, hex)))).toBe(MAX_LEVEL - 1)
    expect(read).toHaveLength(1 + 6 + 12 + 18)
  })
})

describe('the settled field', () => {
  const layout = createLayout(2)
  const radius = 40
  const options = { ...TERRAIN_DEFAULTS, octaves: 4 }
  const world = createTerrainField(layout, { ...options, radius })
  const noise = createTerrain(layout, options)
  const hexes = spiral(ORIGIN, radius - 1)

  it('stands no hex more than one step over a neighbour', () => {
    for (const hex of hexes) {
      const level = world.at(hex)!.level
      for (const next of neighbors(hex)) {
        expect(Math.abs(level - world.at(next)!.level)).toBeLessThanOrEqual(1)
      }
    }
  })

  it('leaves the sea where the noise put it', () => {
    for (const hex of hexes) {
      expect(isWater(world.at(hex)!)).toBe(isWater(noise(hex)))
    }
  })

  it('keeps terrain, colour and step in agreement', () => {
    for (const hex of hexes) {
      const tile = world.at(hex)!
      const band = bandFor(tile.height)
      expect(tile.terrain).toBe(band.id)
      expect(tile.level).toBe(band.level)
      expect(tile.color).toBe(band.color)
    }
  })

  it('only ever brings ground down', () => {
    const lowered = hexes.filter((hex) => world.at(hex)!.level < noise(hex).level)
    for (const hex of hexes) {
      expect(world.at(hex)!.level).toBeLessThanOrEqual(noise(hex).level)
    }
    // The default seed does have cliffs, or none of this was tested.
    expect(lowered.length).toBeGreaterThan(0)
  })
})
