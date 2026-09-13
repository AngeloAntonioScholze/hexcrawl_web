import { describe, expect, it } from 'vitest'
import { distance, hexKey } from '../hex/coords'
import { createLayout, hexToWorld } from '../hex/layout'
import { createTerrainField } from '../terrain/field'
import { TERRAIN_DEFAULTS } from '../terrain/terrain'
import {
  CHUNK,
  MARGIN_CHUNKS,
  axialBounds,
  chunkSpanFor,
  insideWorld,
  sameSpan,
  spanCapacity,
  tilesInSpan,
  worldBounds,
  type ViewRect,
} from './hexWindow'

const layout = createLayout(2)

const world = (radius: number) =>
  createTerrainField(layout, { ...TERRAIN_DEFAULTS, radius, octaves: 2 })

const rectAround = (x: number, z: number, reach: number): ViewRect => ({
  minX: x - reach,
  maxX: x + reach,
  minZ: z - reach,
  maxZ: z + reach,
})

describe('axialBounds', () => {
  it('covers every hex the rectangle touches', () => {
    const rect = rectAround(0, 0, 20)
    const bounds = axialBounds(layout, rect)

    // A hex in the middle of each edge of the rectangle has to be inside it,
    // which is exactly what converting only two corners would get wrong.
    for (const point of [
      { x: rect.minX, z: 0 },
      { x: rect.maxX, z: 0 },
      { x: 0, z: rect.minZ },
      { x: 0, z: rect.maxZ },
    ]) {
      const hex = axialBounds(layout, rectAround(point.x, point.z, 0))
      expect(hex.minQ).toBeGreaterThanOrEqual(bounds.minQ)
      expect(hex.maxQ).toBeLessThanOrEqual(bounds.maxQ)
      expect(hex.minR).toBeGreaterThanOrEqual(bounds.minR)
      expect(hex.maxR).toBeLessThanOrEqual(bounds.maxR)
    }
  })
})

describe('chunkSpanFor', () => {
  it('carries two chunks of ground beyond the view on every side', () => {
    const span = chunkSpanFor(layout, rectAround(0, 0, 1))

    expect(span.minQ).toBe(-MARGIN_CHUNKS)
    expect(span.maxQ).toBe(MARGIN_CHUNKS)
    expect(span.minR).toBe(-MARGIN_CHUNKS)
    expect(span.maxR).toBe(MARGIN_CHUNKS)
  })

  it('does not move while the view stays inside the chunks it holds', () => {
    const first = chunkSpanFor(layout, rectAround(0, 0, 10))
    const nudged = chunkSpanFor(layout, rectAround(layout.size, 0, 10))

    expect(sameSpan(first, nudged)).toBe(true)
  })

  it('moves once the view crosses a chunk boundary', () => {
    const here = chunkSpanFor(layout, rectAround(0, 0, 10))
    const world = hexToWorld(layout, { q: CHUNK * 2, r: 0 })
    const away = chunkSpanFor(layout, rectAround(world.x, world.z, 10))

    expect(sameSpan(here, away)).toBe(false)
  })
})

describe('tilesInSpan', () => {
  it('builds every hex of the span the world has ground for', () => {
    const span = { minQ: 0, maxQ: 0, minR: 0, maxR: 0 }
    const tiles = tilesInSpan(world(400), span)

    expect(tiles).toHaveLength(CHUNK * CHUNK)
    expect(new Set(tiles.map((tile) => hexKey(tile.hex))).size).toBe(tiles.length)
  })

  it('stops at the rim of the world', () => {
    const span = { minQ: -1, maxQ: 1, minR: -1, maxR: 1 }
    const tiles = tilesInSpan(world(5), span)

    expect(tiles.length).toBeGreaterThan(0)
    expect(tiles.every((tile) => distance({ q: 0, r: 0 }, tile.hex) <= 5)).toBe(true)
  })

  it('never holds more hexes than the span says it can', () => {
    const span = { minQ: -2, maxQ: 2, minR: -2, maxR: 2 }
    expect(tilesInSpan(world(400), span).length).toBeLessThanOrEqual(spanCapacity(span))
  })
})

describe('the rim of the world', () => {
  it('boxes the whole map for the camera to be fenced inside', () => {
    const box = worldBounds(layout, 10)
    const east = hexToWorld(layout, { q: 10, r: 0 })

    expect(box.maxX).toBeGreaterThanOrEqual(east.x)
    expect(box.minX).toBeLessThanOrEqual(-east.x)
  })

  it('knows what is off the map', () => {
    expect(insideWorld({ q: 5, r: 0 }, 5)).toBe(true)
    expect(insideWorld({ q: 6, r: 0 }, 5)).toBe(false)
  })
})
