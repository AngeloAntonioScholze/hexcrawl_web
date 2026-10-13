import { distance, neighbors, type Axial } from '../hex/coords'
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

/** How a mover gets about: on foot or hoof, or afloat. */
export type Movement = 'land' | 'sea'

export interface MovementRule {
  /** Whether open water can be entered at all. */
  water: boolean
  /** Whether land with no water beside it can be entered; coast always can. */
  inland: boolean
  /** Whether rising ground costs extra: a ship putting in under a cliff does not climb it. */
  climbs: boolean
}

/**
 * Speed is not part of the rule: a hex is ten kilometres whoever crosses it,
 * and a faster mover earns more of them a turn through its pace instead. That
 * keeps every step cost a whole number of hexes, so budgets and turn counts
 * never drift on fractions.
 */
export const MOVEMENT_RULES: Readonly<Record<Movement, MovementRule>> = {
  land: { water: false, inland: true, climbs: true },
  sea: { water: true, inland: false, climbs: false },
}

export interface RouteOptions {
  /** Land by default: parties travel on foot and cannot cross open water. */
  movement?: Movement
}

export interface Route {
  hexes: Axial[]
  /** Hexes entered, so one fewer than the hexes in the route. */
  steps: number
  km: number
}

export function stepCostKm(
  from: TerrainTile,
  to: TerrainTile,
  movement: Movement = 'land',
): number {
  const rise = to.level - from.level
  return MOVEMENT_RULES[movement].climbs && rise >= CLIMB_THRESHOLD
    ? KM_PER_HEX * CLIMB_MULTIPLIER
    : KM_PER_HEX
}

/** Land with open water on at least one side. */
export function isCoast(field: TerrainField, tile: TerrainTile): boolean {
  if (isWater(tile)) return false
  return neighbors(tile.hex).some((hex) => {
    const next = field.at(hex)
    return next !== undefined && isWater(next)
  })
}

export function canEnter(field: TerrainField, tile: TerrainTile, movement: Movement): boolean {
  const rule = MOVEMENT_RULES[movement]
  if (isWater(tile)) return rule.water
  return rule.inland || isCoast(field, tile)
}

export function findRoute(
  field: TerrainField,
  start: Axial,
  goal: Axial,
  options: RouteOptions = {},
): Route | null {
  const movement = options.movement ?? 'land'
  const tileAt = (hex: Axial): TerrainTile | undefined => field.at(hex)

  const passable = (tile: TerrainTile | undefined): tile is TerrainTile =>
    tile !== undefined && canEnter(field, tile, movement)

  const from = tileAt(start)
  const to = tileAt(goal)
  if (!passable(from) || !passable(to)) return null

  const result = findPath(start, goal, {
    cost: (a, b) => {
      const here = tileAt(a)
      const there = tileAt(b)
      return here && passable(there) ? stepCostKm(here, there, movement) : null
    },
    // The cheapest step under any movement rule is one flat hex, so this never
    // overestimates.
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
