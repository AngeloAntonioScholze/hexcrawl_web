import { distance, line, range, type Axial } from './coords'

/**
 * Height of the terrain under a hex, or undefined when the hex is off the map.
 * The unit is the caller's: sight over real terrain is measured in whole steps,
 * so a hex blocks the view only when it stands a step above the line.
 */
export type ElevationLookup = (hex: Axial) => number | undefined

export interface VisionOptions {
  /** How far the party sees standing on the ground floor, in hexes. */
  radius?: number
  /** Added to the step the party stands on, so it sees over level ground. */
  eyeHeight?: number
  /** Extra hexes of sight per step of vantage the party has climbed. */
  perElevation?: number
  /**
   * Steps at or below this buy no extra sight. Rolling ground and woodland are
   * where a party walks, not where it looks out from: the horizon only opens up
   * once it is standing on something that overlooks the country around it.
   */
  vantageFloor?: number
  /** Ceiling on the sight radius, however high the party climbs. */
  maxRadius?: number
}

const DEFAULTS = {
  radius: 5,
  eyeHeight: 0.4,
  perElevation: 1.2,
  vantageFloor: 2,
  maxRadius: 14,
} as const

/** Standing on high ground carries the horizon further out. */
export function sightRadius(elevation: number, options: VisionOptions = {}): number {
  const radius = options.radius ?? DEFAULTS.radius
  const perElevation = options.perElevation ?? DEFAULTS.perElevation
  const vantageFloor = options.vantageFloor ?? DEFAULTS.vantageFloor
  const maxRadius = options.maxRadius ?? DEFAULTS.maxRadius

  const vantage = Math.max(0, elevation - vantageFloor)
  return Math.max(0, Math.min(maxRadius, Math.round(radius + perElevation * vantage)))
}

export interface Viewpoint {
  /** The step the party stands on: only ground above this can get in its way. */
  ground: number
  /** Where the party's eye sits, the step it stands on plus its own height. */
  eye: number
}

/**
 * Terrain line of sight: the eye sees a hex when nothing on the way to it rises
 * above the straight line between them. Each hex on the way stakes a claim on
 * how steeply the view must climb to clear it, and the steepest claim so far is
 * what the target has to beat — so a ridge hides the valley behind it while the
 * far mountainside over the ridge stays in view.
 *
 * Only ground standing on a step above the party gets to make that claim.
 * Looking down off a height, everything lower is below the line by definition,
 * and a party on a summit sees its whole circle.
 */
export function hasLineOfSight(
  origin: Axial,
  target: Axial,
  viewpoint: Viewpoint,
  elevationOf: ElevationLookup,
): boolean {
  const steps = distance(origin, target)
  if (steps === 0) return true

  const targetElevation = elevationOf(target)
  if (targetElevation === undefined) return false

  const path = line(origin, target)
  let blockingSlope = -Infinity

  for (let i = 1; i < steps; i++) {
    const elevation = elevationOf(path[i])
    if (elevation === undefined) return false
    if (elevation <= viewpoint.ground) continue
    blockingSlope = Math.max(blockingSlope, (elevation - viewpoint.eye) / i)
  }

  return (targetElevation - viewpoint.eye) / steps >= blockingSlope
}

export interface SightField {
  /** How far the party can see from where it stands. */
  radius: number
  /** In sight, the hex under the party included. */
  visible: Axial[]
  /** Within reach but hidden behind something in the way. */
  blocked: Axial[]
}

/**
 * Splits everything within reach into what the party can see and what the
 * terrain hides from it. Hexes off the map are in neither: nothing is standing
 * in the way of them, there is simply no ground there.
 */
export function fieldOfView(
  origin: Axial,
  elevationOf: ElevationLookup,
  options: VisionOptions = {},
): SightField {
  const standing = elevationOf(origin)
  if (standing === undefined) return { radius: 0, visible: [], blocked: [] }

  const viewpoint: Viewpoint = {
    ground: standing,
    eye: standing + (options.eyeHeight ?? DEFAULTS.eyeHeight),
  }
  const radius = sightRadius(standing, options)

  const visible: Axial[] = []
  const blocked: Axial[] = []

  for (const hex of range(origin, radius)) {
    if (elevationOf(hex) === undefined) continue
    if (hasLineOfSight(origin, hex, viewpoint, elevationOf)) visible.push(hex)
    else blocked.push(hex)
  }

  return { radius, visible, blocked }
}
