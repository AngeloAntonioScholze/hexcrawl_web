import { distance, type Axial } from '../hex/coords'
import { findPath } from '../hex/pathfind'
import type { TerrainField } from './field'
import { isWater, type TerrainTile } from './terrain'

/** Every hex is ten kilometres across. */
export const KM_PER_HEX = 10

/** A real climb costs double; gentle rises, level ground and descents do not. */
export const CLIMB_MULTIPLIER = 2

/**
 * How many steps the next hex must stand above this one before it counts as a
 * climb. Levels are already the coarse reading of the terrain, so one step up
 * is a climb and anything within a step is undulating ground: wading ashore or
 * walking the length of a plain costs the plain distance.
 */
export const CLIMB_THRESHOLD = 1

export interface RouteOptions {
  /** Off by default: parties travel on foot and cannot cross open water. */
  allowWater?: boolean
}

export interface Route {
  hexes: Axial[]
  /** Hexes entered, so one fewer than the hexes in the route. */
  steps: number
  km: number
}

export function stepCostKm(from: TerrainTile, to: TerrainTile): number {
  const rise = to.level - from.level
  return rise >= CLIMB_THRESHOLD ? KM_PER_HEX * CLIMB_MULTIPLIER : KM_PER_HEX
}

export function findRoute(
  field: TerrainField,
  start: Axial,
  goal: Axial,
  options: RouteOptions = {},
): Route | null {
  const allowWater = options.allowWater ?? false
  const tileAt = (hex: Axial): TerrainTile | undefined => field.at(hex)

  const passable = (tile: TerrainTile | undefined): tile is TerrainTile =>
    tile !== undefined && (allowWater || !isWater(tile))

  const from = tileAt(start)
  const to = tileAt(goal)
  if (!passable(from) || !passable(to)) return null

  const result = findPath(start, goal, {
    cost: (a, b) => {
      const here = tileAt(a)
      const there = tileAt(b)
      return here && passable(there) ? stepCostKm(here, there) : null
    },
    // The cheapest possible step is one flat hex, so this never overestimates.
    heuristic: (from, to) => distance(from, to) * KM_PER_HEX,
  })

  if (!result) return null
  return { hexes: result.path, steps: result.path.length - 1, km: result.cost }
}

/**
 * One route per leg, each starting where the last one ended. A single leg that
 * cannot be walked sinks the whole chain: half a journey is not an order.
 */
export function chainRoute(
  field: TerrainField,
  start: Axial,
  waypoints: readonly Axial[],
  options: RouteOptions = {},
): Route[] | null {
  const legs: Route[] = []
  let from = start
  for (const to of waypoints) {
    const leg = findRoute(field, from, to, options)
    if (!leg) return null
    legs.push(leg)
    from = to
  }
  return legs
}

/** The legs laid end to end, the hex each one shares with the next counted once. */
export function joinLegs(start: Axial, legs: readonly Route[]): Route {
  return {
    hexes: [start, ...legs.flatMap((leg) => leg.hexes.slice(1))],
    steps: legs.reduce((total, leg) => total + leg.steps, 0),
    km: legs.reduce((total, leg) => total + leg.km, 0),
  }
}
