import { Color3 } from '@babylonjs/core/Maths/math.color'
import type { Axial } from '../hex/coords'
import { hexToWorld, type Layout } from '../hex/layout'
import { createFbm, type FbmOptions } from './perlin'

export type TerrainId = 'deepWater' | 'water' | 'sand' | 'grass' | 'forest' | 'rock' | 'snow'

export interface TerrainTile {
  hex: Axial
  terrain: TerrainId
  /** Raw noise value: negative is below sea level. */
  height: number
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
  /** Stretches the noise toward its extremes; fbm alone rarely leaves the middle. */
  contrast?: number
  /** Shifts the waterline: positive floods the map, negative drains it. */
  seaLevel?: number
}

interface Band {
  id: TerrainId
  /** Upper bound of the noise value for this band. */
  limit: number
  color: Color3
}

// Sea level is 0, so the sign of the noise decides land or water.
const BANDS: readonly Band[] = [
  { id: 'deepWater', limit: -0.3, color: new Color3(0.09, 0.16, 0.29) },
  { id: 'water', limit: 0, color: new Color3(0.16, 0.3, 0.46) },
  { id: 'sand', limit: 0.06, color: new Color3(0.63, 0.58, 0.4) },
  { id: 'grass', limit: 0.24, color: new Color3(0.31, 0.45, 0.26) },
  { id: 'forest', limit: 0.48, color: new Color3(0.2, 0.33, 0.21) },
  { id: 'rock', limit: 0.72, color: new Color3(0.37, 0.35, 0.31) },
  { id: 'snow', limit: Infinity, color: new Color3(0.78, 0.79, 0.81) },
]

const DEFAULTS = {
  seed: 1337,
  scale: 55,
  seaFloor: 0.3,
  shore: 0.5,
  relief: 5.2,
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
  const seed = options.seed ?? DEFAULTS.seed
  const scale = options.scale ?? DEFAULTS.scale
  const seaFloor = options.seaFloor ?? DEFAULTS.seaFloor
  const shore = options.shore ?? DEFAULTS.shore
  const relief = options.relief ?? DEFAULTS.relief
  const contrast = options.contrast ?? DEFAULTS.contrast
  const seaLevel = options.seaLevel ?? DEFAULTS.seaLevel

  const noise = createFbm(seed, options)

  return (hex: Axial): TerrainTile => {
    // Sampled in world space rather than axial space, or the skew between the
    // two axes stretches the noise along one diagonal.
    const world = hexToWorld(layout, hex)
    const raw = noise(world.x / scale, world.z / scale)
    const height = clamp((raw - seaLevel) * contrast, -1, 1)
    const band = bandFor(height)

    // Water sits flat at one sea floor height so it reads as a surface; land
    // climbs from the shoreline with the noise above sea level.
    const elevation = height < 0 ? seaFloor : shore + height * relief

    return { hex, terrain: band.id, height, elevation, color: band.color }
  }
}
