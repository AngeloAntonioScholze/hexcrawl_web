import { distance, neighbors, type Axial } from '../hex/coords'
import { findPath } from '../hex/pathfind'
import type { TerrainField } from './field'
import { hasRoad, type Roads } from './roads'
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

/**
 * A road cannot make a hex shorter without breaking the whole-hex costs below,
 * so what it buys is the climb: a road is graded, and the step along it costs
 * one hex however far it rises. Only feet and hooves use roads.
 */
export const ROADS_GRADED: Readonly<Record<Movement, boolean>> = {
  land: true,
  sea: false,
}

/**
 * Added to every step off the road while searching, never to what a route
 * costs: among routes of the same length the one with more road wins, and it
 * would take ten thousand steps of it to outweigh a single kilometre.
 */
const OFF_ROAD_NUDGE = 1e-4

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
  roads?: Roads
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
  road = false,
): number {
  const rise = to.level - from.level
  const graded = road && ROADS_GRADED[movement]
  return MOVEMENT_RULES[movement].climbs && !graded && rise >= CLIMB_THRESHOLD
    ? KM_PER_HEX * CLIMB_MULTIPLIER
    : KM_PER_HEX
}

/** What a step between two hexes costs, reading the road between them off the map. */
export const stepKmOn = (
  roads: Roads,
  from: TerrainTile,
  to: TerrainTile,
  movement: Movement = 'land',
): number => stepCostKm(from, to, movement, hasRoad(roads, from.hex, to.hex))

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
  const roads = options.roads ?? new Set()
  const usesRoads = ROADS_GRADED[movement] && roads.size > 0
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
      if (!here || !passable(there)) return null
      const road = hasRoad(roads, a, b)
      const nudge = usesRoads && !road ? OFF_ROAD_NUDGE : 0
      return stepCostKm(here, there, movement, road) + nudge
    },
    // The cheapest step under any movement rule is one flat hex, so this never
    // overestimates.
    heuristic: (from, to) => distance(from, to) * KM_PER_HEX,
  })

  if (!result) return null
  const hexes = result.path
  let km = 0
  for (let i = 1; i < hexes.length; i++) {
    km += stepKmOn(roads, tileAt(hexes[i - 1])!, tileAt(hexes[i])!, movement)
  }
  return { hexes, steps: hexes.length - 1, km }
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
