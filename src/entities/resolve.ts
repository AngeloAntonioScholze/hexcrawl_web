import { parseKey, type HexKey } from '../hex/coords'
import type { TerrainField } from '../terrain/field'
import { hasRiver, type Rivers } from '../terrain/rivers'
import { hasRoad, type Roads } from '../terrain/roads'
import {
  CLIMB_MULTIPLIER,
  KM_PER_HEX,
  RIVER_CROSSING_KM,
  stepCostKm,
  type Movement,
} from '../terrain/travel'
import { isWater, type TerrainTile } from '../terrain/terrain'
import type { Action, ActionKind, ActionRecord } from './action'
import { idleState, isCarrier, KIND_MOVEMENT, type Entity, type EntityState } from './entity'

/** One for a flat step or a road, two for a climb, one more to ford: the km table read in turns. */
export const stepCostTurns = (
  from: TerrainTile,
  to: TerrainTile,
  movement: Movement = 'land',
  road = false,
  river = false,
): number => stepCostKm(from, to, movement, road, river) / KM_PER_HEX

/**
 * The most an entity can carry into the next turn: the cost of the dearest step
 * there is. Without a ceiling a party that stood about for a week would cross a
 * week's worth of hexes on the turn it finally set off.
 */
export const MAX_CARRY = CLIMB_MULTIPLIER + RIVER_CROSSING_KM / KM_PER_HEX

export interface TurnOutcome {
  states: ReadonlyMap<string, EntityState>
  records: readonly ActionRecord[]
}

/**
 * What the queued action does to the route an entity was already walking. A
 * move replaces it — a new order is the only thing that calls off an old one —
 * while camp drops what it was carrying, so a night in camp is not a running
 * start on the morning.
 */
function intent(
  state: EntityState,
  action: Action | undefined,
): EntityState & { kind: ActionKind } {
  if (!action) return { ...state, kind: state.pending.length > 0 ? 'move' : 'wait' }

  if (action.kind === 'move') {
    // The route is given from where the entity stands, so the hex under it is
    // not a hex it has to enter.
    const ahead = action.route[0] === state.at ? action.route.slice(1) : action.route
    return { ...state, pending: ahead, waypoints: action.waypoints, kind: 'move' }
  }

  if (action.kind === 'camp') {
    return { ...state, carry: 0, pending: [], waypoints: [], kind: 'camp' }
  }
  return { ...state, kind: 'wait' }
}

function walk(
  entity: Entity,
  field: TerrainField,
  roads: Roads,
  rivers: Rivers,
  from: EntityState,
): EntityState & { entered: HexKey[] } {
  const entered: HexKey[] = []
  let at = from.at
  let budget = from.carry + entity.pacePerTurn
  let pending = from.pending
  let waypoints = from.waypoints

  // A leg is only over once its own end is reached: the next leg's end may lie
  // on this one, and passing through it early does not count.
  const enter = (hex: HexKey): void => {
    at = hex
    pending = pending.slice(1)
    if (waypoints[0] === hex) waypoints = waypoints.slice(1)
    entered.push(hex)
  }

  const riding = from.riding

  // Nowhere yet: the first hex of a route is where the entity is put down, not
  // ground it has to cross to reach, so it costs nothing to stand on.
  if (at === null) {
    if (pending.length === 0) return { at, carry: budget, pending, waypoints, riding, entered }
    enter(pending[0])
  }

  while (at !== null && pending.length > 0) {
    const here = field.at(parseKey(at))
    const next = field.at(parseKey(pending[0]))
    if (!here || !next) break

    const road = hasRoad(roads, here.hex, next.hex)
    const river = hasRiver(rivers, here.hex, next.hex)
    const cost = stepCostTurns(here, next, KIND_MOVEMENT[entity.kind], road, river)
    if (budget < cost) break

    budget -= cost
    enter(pending[0])
  }

  return { at, carry: Math.min(budget, MAX_CARRY), pending, waypoints, riding, entered }
}

interface Step {
  kind: ActionKind
  state: EntityState
  entered: readonly HexKey[]
  spent: number
}

function step(
  entity: Entity,
  field: TerrainField,
  roads: Roads,
  rivers: Rivers,
  before: EntityState,
  action: Action | undefined,
): Step {
  const { kind, ...ordered } = intent(before, action)

  // Only a turn spent travelling earns its pace. Standing about does not bank
  // ground to cross later, and a camped entity starts the next turn from a
  // standstill, whatever it had left over.
  const after =
    kind === 'move'
      ? walk(entity, field, roads, rivers, ordered)
      : { ...ordered, carry: kind === 'camp' ? 0 : ordered.carry, entered: [] as HexKey[] }

  const { entered, ...state } = after
  const gained = kind === 'move' ? entity.pacePerTurn : 0
  return { kind, state, entered, spent: before.carry + gained - state.carry }
}

/** A rider goes where its carrier goes and spends nothing getting there. */
const ride = (carrierId: string, carrier: Step): Step => ({
  kind: carrier.kind,
  state: { ...idleState(), at: carrier.state.at, riding: carrierId },
  entered: carrier.entered,
  spent: 0,
})

const atSea = (field: TerrainField, at: HexKey | null): boolean => {
  const tile = at === null ? undefined : field.at(parseKey(at))
  return tile !== undefined && isWater(tile)
}

/**
 * Spends one turn. Every entity resolves, whether it was given an order or not:
 * the record has a row per entity per turn, so the past is complete and a
 * rewind has something to read for everybody.
 *
 * Carriers resolve first, so the entities riding inside them can follow. A
 * rider given a move order climbs out and walks it at its own pace from where
 * the carrier stood, at no extra cost; any other order leaves it aboard, and so
 * does a move order given at sea, where there is nowhere to step off to.
 */
export function resolveTurn(
  turn: number,
  field: TerrainField,
  entities: readonly Entity[],
  states: ReadonlyMap<string, EntityState>,
  queued: ReadonlyMap<string, Action>,
  roads: Roads = new Set(),
  rivers: Rivers = new Set(),
): TurnOutcome {
  const before = (id: string): EntityState => states.get(id) ?? idleState()
  const carriers = entities.filter((one) => isCarrier(one.kind))
  const steps = new Map<string, Step>()

  for (const carrier of carriers) {
    const own = { ...before(carrier.id), riding: null }
    steps.set(carrier.id, step(carrier, field, roads, rivers, own, queued.get(carrier.id)))
  }

  for (const entity of entities) {
    if (isCarrier(entity.kind)) continue

    const was = before(entity.id)
    const action = queued.get(entity.id)
    const stays = action?.kind !== 'move' || atSea(field, was.at)
    const carrier = was.riding && stays ? steps.get(was.riding) : undefined

    steps.set(
      entity.id,
      carrier && was.riding
        ? ride(was.riding, carrier)
        : step(entity, field, roads, rivers, { ...was, riding: null }, action),
    )
  }

  // Whoever ends the turn arrived and standing on a carrier climbs in. One still
  // on its way is only passing, and a carrier never rides another.
  for (const entity of entities) {
    const done = steps.get(entity.id)!
    const { at, riding, pending } = done.state
    if (isCarrier(entity.kind) || riding || at === null || pending.length > 0) continue

    const host = carriers.find((carrier) => steps.get(carrier.id)!.state.at === at)
    if (host) done.state = { ...done.state, carry: 0, waypoints: [], riding: host.id }
  }

  const next = new Map<string, EntityState>()
  const records: ActionRecord[] = []

  for (const entity of entities) {
    const { kind, state, entered, spent } = steps.get(entity.id)!
    next.set(entity.id, state)
    records.push({
      turn,
      entityId: entity.id,
      kind,
      from: before(entity.id).at,
      to: state.at,
      entered,
      spent,
      carry: state.carry,
    })
  }

  return { states: next, records }
}
