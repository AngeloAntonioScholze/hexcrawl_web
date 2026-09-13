import { distance, type Axial } from '../hex/coords'
import { hexToWorld, worldToHex, type Layout, type WorldPoint } from '../hex/layout'
import type { TerrainField } from '../terrain/field'
import type { HexTile } from './hexGrid'

/**
 * Hexes to a chunk. The window is only rebuilt when the view crosses one of
 * these, so the number is the trade between how often the grid is re-keyed and
 * how much ground is carried spare.
 */
export const CHUNK = 8

/** Chunks of ground kept ready beyond the edge of the view. */
export const MARGIN_CHUNKS = 2

export interface ViewRect {
  minX: number
  maxX: number
  minZ: number
  maxZ: number
}

/** The span of chunks a view covers: the window only moves when this does. */
export interface ChunkSpan {
  minQ: number
  maxQ: number
  minR: number
  maxR: number
}

export const sameSpan = (a: ChunkSpan | null, b: ChunkSpan): boolean =>
  a !== null && a.minQ === b.minQ && a.maxQ === b.maxQ && a.minR === b.minR && a.maxR === b.maxR

/**
 * The axial box that covers a world-space rectangle. The two axes are skewed
 * against world space, so every corner is converted and the extremes taken:
 * converting only two of them leaves wedges of the view uncovered.
 */
export function axialBounds(layout: Layout, rect: ViewRect): ChunkSpan {
  const corners: WorldPoint[] = [
    { x: rect.minX, z: rect.minZ },
    { x: rect.maxX, z: rect.minZ },
    { x: rect.minX, z: rect.maxZ },
    { x: rect.maxX, z: rect.maxZ },
  ]

  const hexes = corners.map((point) => worldToHex(layout, point))
  const qs = hexes.map((hex) => hex.q)
  const rs = hexes.map((hex) => hex.r)

  return {
    minQ: Math.min(...qs),
    maxQ: Math.max(...qs),
    minR: Math.min(...rs),
    maxR: Math.max(...rs),
  }
}

/**
 * The chunk span a view sits in, grown by the margin. Rounding out to whole
 * chunks is what makes a drag free: the window only changes when the view
 * leaves the chunks it was already carrying.
 */
export function chunkSpanFor(layout: Layout, rect: ViewRect): ChunkSpan {
  const bounds = axialBounds(layout, rect)
  const low = (value: number): number => Math.floor(value / CHUNK) - MARGIN_CHUNKS
  const high = (value: number): number => Math.floor(value / CHUNK) + MARGIN_CHUNKS

  return {
    minQ: low(bounds.minQ),
    maxQ: high(bounds.maxQ),
    minR: low(bounds.minR),
    maxR: high(bounds.maxR),
  }
}

/** Every hex of a chunk span that the world actually has ground for. */
export function tilesInSpan(field: TerrainField, span: ChunkSpan): HexTile[] {
  const tiles: HexTile[] = []

  for (let r = span.minR * CHUNK; r < (span.maxR + 1) * CHUNK; r++) {
    for (let q = span.minQ * CHUNK; q < (span.maxQ + 1) * CHUNK; q++) {
      const hex: Axial = { q, r }
      const tile = field.at(hex)
      if (tile) tiles.push({ hex, elevation: tile.elevation, color: tile.color })
    }
  }

  return tiles
}

/** How many hexes a span holds at most, which is what the grid must fit. */
export const spanCapacity = (span: ChunkSpan): number =>
  (span.maxQ - span.minQ + 1) * CHUNK * ((span.maxR - span.minR + 1) * CHUNK)

/** The world-space box the whole map sits in, for the camera's pan bounds. */
export function worldBounds(layout: Layout, radius: number): ViewRect {
  const rim = [
    hexToWorld(layout, { q: radius, r: 0 }),
    hexToWorld(layout, { q: -radius, r: 0 }),
    hexToWorld(layout, { q: 0, r: radius }),
    hexToWorld(layout, { q: 0, r: -radius }),
    hexToWorld(layout, { q: radius, r: -radius }),
    hexToWorld(layout, { q: -radius, r: radius }),
  ]

  return {
    minX: Math.min(...rim.map((point) => point.x)),
    maxX: Math.max(...rim.map((point) => point.x)),
    minZ: Math.min(...rim.map((point) => point.z)),
    maxZ: Math.max(...rim.map((point) => point.z)),
  }
}

/** Whether a hex is inside the world at all; the rim of a bounded map. */
export const insideWorld = (hex: Axial, radius: number): boolean =>
  distance({ q: 0, r: 0 }, hex) <= radius
