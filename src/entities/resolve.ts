import { parseKey, type HexKey } from '../hex/coords'
import type { TerrainField } from '../terrain/field'
import { CLIMB_MULTIPLIER, KM_PER_HEX, stepCostKm } from '../terrain/travel'
import type { TerrainTile } from '../terrain/terrain'
import type { Action, ActionKind, ActionRecord } from './action'
import { idleState, type Entity, type EntityState } from './entity'

/** One for a flat step, two for a climb: the km table read in turns. */
export const stepCostTurns = (from: TerrainTile, to: TerrainTile): number =>
  stepCostKm(from, to) / KM_PER_HEX

/**
 * The most an entity can carry into the next turn: the cost of the dearest step
 * there is. Without a ceiling a party that stood about for a week would cross a
 * week's worth of hexes on the turn it finally set off.
 */
export const MAX_CARRY = CLIMB_MULTIPLIER

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
    return { ...state, pending: ahead, kind: 'move' }
  }

  if (action.kind === 'camp') return { ...state, carry: 0, pending: [], kind: 'camp' }
  return { ...state, kind: 'wait' }
}

function walk(
  entity: Entity,
  field: TerrainField,
  from: EntityState,
): EntityState & { entered: HexKey[] } {
  const entered: HexKey[] = []
  let at = from.at
  let budget = from.carry + entity.pacePerTurn
  let pending = from.pending

  // Nowhere yet: the first hex of a route is where the entity is put down, not
  // ground it has to cross to reach, so it costs nothing to stand on.
  if (at === null) {
    if (pending.length === 0) return { at, carry: budget, pending, entered }
    at = pending[0]
    pending = pending.slice(1)
    entered.push(at)
  }

  while (pending.length > 0) {
    const here = field.at(parseKey(at))
    const next = field.at(parseKey(pending[0]))
    if (!here || !next) break

    const cost = stepCostTurns(here, next)
    if (budget < cost) break

    budget -= cost
    at = pending[0]
    pending = pending.slice(1)
    entered.push(at)
  }

  return { at, carry: Math.min(budget, MAX_CARRY), pending, entered }
}

/**
 * Spends one turn. Every entity resolves, whether it was given an order or not:
 * the record has a row per entity per turn, so the past is complete and a
 * rewind has something to read for everybody.
 */
export function resolveTurn(
  turn: number,
  field: TerrainField,
  entities: readonly Entity[],
  states: ReadonlyMap<string, EntityState>,
  queued: ReadonlyMap<string, Action>,
): TurnOutcome {
  const next = new Map<string, EntityState>()
  const records: ActionRecord[] = []

  for (const entity of entities) {
    const before = states.get(entity.id) ?? idleState()
    const { kind, ...ordered } = intent(before, queued.get(entity.id))

    // Only a turn spent travelling earns its pace. Standing about does not bank
    // ground to cross later, and a camped entity starts the next turn from a
    // standstill, whatever it had left over.
    const after =
      kind === 'move'
        ? walk(entity, field, ordered)
        : { ...ordered, carry: kind === 'camp' ? 0 : ordered.carry, entered: [] as HexKey[] }

    const { entered, ...state } = after
    const gained = kind === 'move' ? entity.pacePerTurn : 0
    next.set(entity.id, state)
    records.push({
      turn,
      entityId: entity.id,
      kind,
      from: before.at,
      to: state.at,
      entered,
      spent: before.carry + gained - state.carry,
      carry: state.carry,
    })
  }

  return { states: next, records }
}
