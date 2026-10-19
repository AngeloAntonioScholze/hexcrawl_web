import { describe, expect, it } from 'vitest'
import { distance, hexKey, neighbors, spiral, type Axial, type HexKey } from '../hex/coords'
import { createLayout, hexToWorld } from '../hex/layout'
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

interface Ranges {
  /** Mean hexes from a mountain to the nearest ground below the mountains. */
  depth: number
  /** Long axis over short axis of each mountain mass, weighted by its size. */
  elongation: number
}

/**
 * How the mountains lie, settled slopes and all. A chain is thin, so few of its
 * hexes stand far from its foot, and it is long, so its spread runs much
 * further one way than the other; a blob is neither.
 */
function surveyRanges(style: MapStyle, seed: number): Ranges {
  const field = createTerrainField(layout, { seed, radius: RADIUS, style })
  const high = new Map<HexKey, Axial>()
  for (const hex of hexes) if (field.at(hex)!.level >= 3) high.set(hexKey(hex), hex)

  const depth = new Map<HexKey, number>()
  let frontier = [...high.values()].filter((hex) =>
    neighbors(hex).some((next) => !high.has(hexKey(next))),
  )
  for (const hex of frontier) depth.set(hexKey(hex), 1)
  for (let step = 2; frontier.length > 0; step++) {
    const next: Axial[] = []
    for (const hex of frontier) {
      for (const near of neighbors(hex)) {
        const key = hexKey(near)
        if (high.has(key) && !depth.has(key)) {
          depth.set(key, step)
          next.push(near)
        }
      }
    }
    frontier = next
  }

  const seen = new Set<HexKey>()
  let stretch = 0
  let counted = 0
  for (const start of high.values()) {
    if (seen.has(hexKey(start))) continue
    seen.add(hexKey(start))
    const mass = [start]
    for (let i = 0; i < mass.length; i++) {
      for (const near of neighbors(mass[i])) {
        const key = hexKey(near)
        if (high.has(key) && !seen.has(key)) {
          seen.add(key)
          mass.push(near)
        }
      }
    }
    // A few hexes have no shape worth measuring.
    if (mass.length < 8) continue
    const points = mass.map((hex) => hexToWorld(layout, hex))
    const mx = points.reduce((sum, p) => sum + p.x, 0) / points.length
    const mz = points.reduce((sum, p) => sum + p.z, 0) / points.length
    let xx = 0
    let zz = 0
    let xz = 0
    for (const p of points) {
      xx += (p.x - mx) ** 2
      zz += (p.z - mz) ** 2
      xz += (p.x - mx) * (p.z - mz)
    }
    const half = (xx + zz) / 2
    const spread = Math.sqrt(half * half - (xx * zz - xz * xz))
    stretch += Math.sqrt((half + spread) / (half - spread)) * mass.length
    counted += mass.length
  }

  return {
    depth: [...depth.values()].reduce((sum, each) => sum + each, 0) / high.size,
    elongation: stretch / counted,
  }
}

const mean = (values: number[]): number =>
  values.reduce((sum, each) => sum + each, 0) / values.length

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

  // Before the ranges, continents and pangaea heaped their mountains into
  // blobs: a mean depth of 1.99 and 2.17 hexes, and an elongation of 1.74 and
  // 2.02, over these seeds.
  it.each(['continents', 'pangaea'] as const)('raises the mountains of %s in chains', (style) => {
    const found = SEEDS.map((seed) => surveyRanges(style, seed))
    expect(mean(found.map((each) => each.depth))).toBeLessThan(1.8)
    expect(mean(found.map((each) => each.elongation))).toBeGreaterThan(1.95)
  })
})
