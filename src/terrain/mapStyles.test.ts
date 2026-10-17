import { describe, expect, it } from 'vitest'
import { distance, hexKey, neighbors, spiral, type Axial, type HexKey } from '../hex/coords'
import { createLayout } from '../hex/layout'
import { createTerrainField } from './field'
import { createShape, MAP_STYLES, type MapStyle } from './mapStyles'
import { createTerrain } from './terrain'

const layout = createLayout(2)
const RADIUS = 60
const MIDDLE: Axial = { q: 0, r: 0 }
const hexes = spiral(MIDDLE, RADIUS)
const SEEDS = [1337, 1, 42]

interface Survey {
  /** Share of the world above water. */
  land: number
  /** Landmass sizes, largest first, as shares of all the land. */
  masses: number[]
  /** Land hexes within two of the rim. */
  rimLand: number
}

function survey(style: MapStyle, seed: number): Survey {
  const field = createTerrainField(layout, { seed, radius: RADIUS, style })
  const land = new Set<HexKey>(hexes.filter((hex) => field.at(hex)!.height >= 0).map(hexKey))

  const seen = new Set<HexKey>()
  const sizes: number[] = []
  for (const start of hexes) {
    if (!land.has(hexKey(start)) || seen.has(hexKey(start))) continue
    seen.add(hexKey(start))
    const stack = [start]
    let size = 0
    while (stack.length > 0) {
      const hex = stack.pop()!
      size++
      for (const next of neighbors(hex)) {
        const key = hexKey(next)
        if (land.has(key) && !seen.has(key)) {
          seen.add(key)
          stack.push(next)
        }
      }
    }
    sizes.push(size)
  }

  return {
    land: land.size / hexes.length,
    masses: sizes.sort((a, b) => b - a).map((size) => size / land.size),
    rimLand: hexes.filter((hex) => distance(MIDDLE, hex) >= RADIUS - 2 && land.has(hexKey(hex)))
      .length,
  }
}

/** Landmasses holding at least a twentieth of the land: the ones a player would call one. */
const bigMasses = (found: Survey): number => found.masses.filter((share) => share >= 0.05).length

describe('createShape', () => {
  it('hands classic noise back untouched', () => {
    const shape = createShape('classic', { seed: 1, rim: 100 })
    for (const raw of [-0.7, -0.1, 0, 0.3, 0.9]) expect(shape(raw, 40, -20)).toBe(raw)
  })

  it('leaves a world with no rim alone, having nothing to measure against', () => {
    for (const style of MAP_STYLES) {
      expect(createShape(style, { seed: 1, rim: Infinity })(0.25, 500, 500)).toBe(0.25)
    }
  })
})

describe('map styles', () => {
  it('keeps classic on the ground the generator made before styles existed', () => {
    const before = createTerrain(layout, { seed: 99 })
    const classic = createTerrain(layout, { seed: 99, style: 'classic', radius: RADIUS })
    for (const hex of spiral(MIDDLE, 20)) expect(classic(hex).height).toBe(before(hex).height)
  })

  it('makes each style a different world from the same seed', () => {
    const heights = MAP_STYLES.map((style) => {
      const tile = createTerrain(layout, { seed: 7, style, radius: RADIUS })
      return spiral(MIDDLE, 20).map((hex) => tile(hex).height)
    })
    for (let a = 0; a < heights.length; a++) {
      for (let b = a + 1; b < heights.length; b++) expect(heights[a]).not.toEqual(heights[b])
    }
  })

  it.each(['continents', 'pangaea', 'archipelago'] as const)(
    'keeps the rim of a %s world under water',
    (style) => {
      for (const seed of SEEDS) expect(survey(style, seed).rimLand).toBe(0)
    },
  )

  it('gathers a pangaea into one mass', () => {
    for (const seed of SEEDS) {
      const found = survey('pangaea', seed)
      expect(found.masses[0]).toBeGreaterThan(0.85)
      expect(found.land).toBeGreaterThan(0.25)
    }
  })

  it('splits continents into a few big masses with ocean between', () => {
    for (const seed of SEEDS) {
      const found = survey('continents', seed)
      expect(bigMasses(found)).toBeGreaterThanOrEqual(2)
      expect(bigMasses(found)).toBeLessThanOrEqual(8)
      expect(found.masses[0]).toBeLessThan(0.8)
      expect(found.land).toBeGreaterThan(0.25)
    }
  })

  it('scatters an archipelago into many small islands', () => {
    for (const seed of SEEDS) {
      const found = survey('archipelago', seed)
      expect(found.masses.length).toBeGreaterThanOrEqual(20)
      expect(found.masses[0]).toBeLessThan(0.4)
      expect(found.land).toBeGreaterThan(0.05)
      expect(found.land).toBeLessThan(0.3)
    }
  })
})
