import { distance, hexKey, type Axial, type HexKey } from '../hex/coords'
import type { Layout } from '../hex/layout'
import { createTerrain, type TerrainId, type TerrainOptions, type TerrainTile } from './terrain'

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
  const { radius, ...terrain } = options
  const tileAt = createTerrain(layout, terrain)
  const memo = new Map<HexKey, TerrainTile>()

  return {
    radius,

    get known() {
      return memo.size
    },

    at(hex): TerrainTile | undefined {
      if (distance(ORIGIN, hex) > radius) return undefined

      const key = hexKey(hex)
      const known = memo.get(key)
      if (known) return known

      const made = tileAt(hex)
      memo.set(key, made)
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
