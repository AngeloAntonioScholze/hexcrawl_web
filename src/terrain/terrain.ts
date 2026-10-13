import { Color3 } from '@babylonjs/core/Maths/math.color'
import type { Axial } from '../hex/coords'
import { hexToWorld, type Layout } from '../hex/layout'
import { createFbm, type FbmOptions } from './perlin'

export type TerrainId = 'deepWater' | 'water' | 'sand' | 'grass' | 'forest' | 'mountains' | 'peaks'

/** Lowest to highest, the order the bands climb in. */
export const TERRAIN_LABELS: Readonly<Record<TerrainId, string>> = {
  deepWater: 'deep water',
  water: 'water',
  sand: 'sand',
  grass: 'grass',
  forest: 'forest',
  mountains: 'mountains',
  peaks: 'peaks',
}

export const TERRAIN_IDS = Object.keys(TERRAIN_LABELS) as readonly TerrainId[]

export interface TerrainTile {
  hex: Axial
  terrain: TerrainId
  /** Raw noise value: negative is below sea level. */
  height: number
  /**
   * Mechanical height in whole steps. Line of sight and climbs read this, never
   * the rendered elevation: a hex either stands a step over its neighbour or it
   * does not, and the difference has to be one a player can read off the map.
   */
  level: number
  /** Rendered tile height, always positive. */
  elevation: number
  color: Color3
}

export interface TerrainOptions extends FbmOptions {
  seed?: number
  /** World units spanned by one unit of noise; larger means broader landmasses. */
  scale?: number
  /** Tile height at and below sea level. */
  seaFloor?: number
  /** Tile height right at the shoreline. */
  shore?: number
  /** Extra height at the highest peaks. */
  relief?: number
  /** Above 1 this holds the lowlands down and lets the peaks run away. */
  reliefCurve?: number
  /** Stretches the noise toward its extremes; fbm alone rarely leaves the middle. */
  contrast?: number
  /** Shifts the waterline: positive floods the map, negative drains it. */
  seaLevel?: number
}

interface Band {
  id: TerrainId
  /** Upper bound of the noise value for this band. */
  limit: number
  /** The mechanical step this band stands on. */
  level: number
  color: Color3
}

// Sea level is 0, so the sign of the noise decides land or water. Levels are
// pinned to the bands rather than to a separate set of thresholds, so a player
// can read blocking straight off the colours: same colour, same step. Water and
// the beach share the ground floor, which is what lets a party wade ashore
// without being charged for a climb.
const BANDS: readonly Band[] = [
  { id: 'deepWater', limit: -0.3, level: 0, color: new Color3(0.09, 0.16, 0.29) },
  { id: 'water', limit: 0, level: 0, color: new Color3(0.16, 0.3, 0.46) },
  { id: 'sand', limit: 0.06, level: 0, color: new Color3(0.63, 0.58, 0.4) },
  { id: 'grass', limit: 0.24, level: 1, color: new Color3(0.31, 0.45, 0.26) },
  { id: 'forest', limit: 0.48, level: 2, color: new Color3(0.2, 0.33, 0.21) },
  { id: 'mountains', limit: 0.72, level: 3, color: new Color3(0.37, 0.35, 0.31) },
  { id: 'peaks', limit: Infinity, level: 4, color: new Color3(0.78, 0.79, 0.81) },
]

/** The highest step the terrain reaches. */
export const MAX_LEVEL = BANDS[BANDS.length - 1].level

export const TERRAIN_DEFAULTS = {
  seed: 1337,
  scale: 55,
  seaFloor: 0.3,
  shore: 0.5,
  relief: 7.2,
  reliefCurve: 1.3,
  contrast: 2,
  seaLevel: 0,
} as const

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value))

/** Sea level is zero, so the sign of the noise decides land from water. */
export const isWater = (tile: TerrainTile): boolean => tile.height < 0

export function bandFor(height: number): Band {
  return BANDS.find((band) => height < band.limit) ?? BANDS[BANDS.length - 1]
}

export function createTerrain(
  layout: Layout,
  options: TerrainOptions = {},
): (hex: Axial) => TerrainTile {
  const seed = options.seed ?? TERRAIN_DEFAULTS.seed
  const scale = options.scale ?? TERRAIN_DEFAULTS.scale
  const seaFloor = options.seaFloor ?? TERRAIN_DEFAULTS.seaFloor
  const shore = options.shore ?? TERRAIN_DEFAULTS.shore
  const relief = options.relief ?? TERRAIN_DEFAULTS.relief
  const reliefCurve = options.reliefCurve ?? TERRAIN_DEFAULTS.reliefCurve
  const contrast = options.contrast ?? TERRAIN_DEFAULTS.contrast
  const seaLevel = options.seaLevel ?? TERRAIN_DEFAULTS.seaLevel

  const noise = createFbm(seed, options)

  return (hex: Axial): TerrainTile => {
    // Sampled in world space rather than axial space, or the skew between the
    // two axes stretches the noise along one diagonal.
    const world = hexToWorld(layout, hex)
    const raw = noise(world.x / scale, world.z / scale)
    const height = clamp((raw - seaLevel) * contrast, -1, 1)
    const band = bandFor(height)

    // Water sits flat at one sea floor height so it reads as a surface; land
    // climbs from the shoreline with the noise above sea level. The curve is
    // what puts air between a plain and a peak: without it every rise reads as
    // the same gentle ramp.
    const elevation = height < 0 ? seaFloor : shore + Math.pow(height, reliefCurve) * relief

    return { hex, terrain: band.id, height, level: band.level, elevation, color: band.color }
  }
}
