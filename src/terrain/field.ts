import { distance, hexKey, type Axial, type HexKey } from '../hex/coords'
import type { Layout } from '../hex/layout'
import { settledLevel } from './slopes'
import {
  createPainter,
  createTerrain,
  landAt,
  MAX_LEVEL,
  type TerrainId,
  type TerrainOptions,
  type TerrainTile,
} from './terrain'

const ORIGIN: Axial = { q: 0, r: 0 }

/**
 * The world as a function rather than as a stored map. Terrain is a pure
 * function of the seed, so a hex can be worked out whenever it is wanted: only
 * the ground near the view is ever built, and a map a hundred times the size of
 * the window costs nothing until somebody looks at it.
 */
export interface TerrainField {
  /** The tile at a hex, or undefined beyond the rim of the world. */
  at(hex: Axial): TerrainTile | undefined
  /** How far the world runs from the middle, in hexes. */
  radius: number
  /** How many hexes have been worked out so far; the memo's size. */
  readonly known: number
}

export interface TerrainFieldOptions extends TerrainOptions {
  /** Hexes from the middle to the rim. */
  radius: number
}

export function createTerrainField(layout: Layout, options: TerrainFieldOptions): TerrainField {
  const { radius } = options
  const tileAt = createTerrain(layout, options)
  const lower = createPainter(options)
  // Everything the field knows sits in flat arrays over the square round the
  // world, indexed alike, rather than in maps: these lookups are most of what a
  // cold window costs, and hashing a key for each cost more than the noise.
  // Ground just past the rim is read too, so the rim does not shape the slopes;
  // no hex inside the rim reads further out than MAX_LEVEL, which is what
  // bounds the square.
  const reach = radius + MAX_LEVEL
  const side = 2 * reach + 1
  // The tile at each hex: the noise's own ground until the hex is settled, and
  // the settled ground after. Only the levels are read for the slopes.
  const tiles: (TerrainTile | undefined)[] = new Array(side * side)
  // The noise's own step at each hex, or -1 while it is still unknown.
  // Settling a hex reads a few rings round it and neighbours share most of
  // those rings, so keeping them holds a whole window to about one noise sample
  // a hex, and a typed array keeps those reads off the tiles.
  const levels = new Int8Array(side * side).fill(-1)
  const settled = new Uint8Array(side * side)
  let known = 0

  const indexOf = (q: number, r: number): number => (q + reach) * side + r + reach
  const rawLevel = (q: number, r: number): number => {
    const index = indexOf(q, r)
    const level = levels[index]
    if (level >= 0) return level
    const made = tileAt({ q, r })
    tiles[index] = made
    levels[index] = made.level
    return made.level
  }

  return {
    radius,

    get known() {
      return known
    },

    at(hex): TerrainTile | undefined {
      if (distance(ORIGIN, hex) > radius) return undefined

      const index = indexOf(hex.q, hex.r)
      if (settled[index]) return tiles[index]

      // Only dry ground is ever brought down, and never below the first step
      // above the beach, so the sea and the coastline stay where the noise put them.
      const rawStep = rawLevel(hex.q, hex.r)
      const ground = tiles[index]!
      const level = settledLevel(hex, rawLevel)
      const made = level === rawStep ? ground : lower(ground, landAt(level))
      tiles[index] = made
      settled[index] = 1
      known++
      return made
    },
  }
}

/**
 * A field over ground somebody has already laid out. Fixtures and saved terrain
 * come as whole maps, and nothing that reads the world should have to know
 * which of the two it was handed.
 */
export function fieldFromTiles(tiles: ReadonlyMap<HexKey, TerrainTile>): TerrainField {
  let rim = 0
  for (const tile of tiles.values()) rim = Math.max(rim, distance(ORIGIN, tile.hex))

  return {
    radius: rim,
    known: tiles.size,
    at: (hex) => tiles.get(hexKey(hex)),
  }
}

/** The hexes whose paint differs between two sets of overrides. */
export function repainted(
  before: ReadonlyMap<HexKey, TerrainId>,
  after: ReadonlyMap<HexKey, TerrainId>,
): HexKey[] {
  const changed = [...after].filter(([hex, terrain]) => before.get(hex) !== terrain)
  const wiped = [...before.keys()].filter((hex) => !after.has(hex))
  return [...changed.map(([hex]) => hex), ...wiped]
}

/**
 * The world with the DM's brushwork laid over it. Everything that reads terrain
 * reads the field, so painting here is what a path, a line of sight and the
 * map itself all see, without any of them knowing the ground was painted.
 */
export function withOverrides(
  field: TerrainField,
  overrides: ReadonlyMap<HexKey, TerrainId>,
  paint: (tile: TerrainTile, terrain: TerrainId) => TerrainTile,
): TerrainField {
  if (overrides.size === 0) return field
  const memo = new Map<HexKey, TerrainTile>()

  return {
    radius: field.radius,

    get known() {
      return field.known
    },

    at(hex): TerrainTile | undefined {
      const tile = field.at(hex)
      if (!tile) return undefined

      const key = hexKey(hex)
      const terrain = overrides.get(key)
      if (!terrain) return tile

      const known = memo.get(key)
      if (known) return known

      const made = paint(tile, terrain)
      memo.set(key, made)
      return made
    },
  }
}
