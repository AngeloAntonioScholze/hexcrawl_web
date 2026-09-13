import type { HexKey } from '../hex/coords'

/**
 * What an entity intends to do on the next turn. A move stands: the entity
 * keeps walking the route on the turns after it, so crossing four hexes is one
 * order rather than four. The route is every leg chained end to end; the
 * waypoints are where each leg ends, the last of them the goal.
 */
export type Action =
  | { kind: 'move'; route: readonly HexKey[]; waypoints: readonly HexKey[] }
  | { kind: 'wait' }
  | { kind: 'camp' }

export type ActionKind = Action['kind']

/** One entity's share of one turn already spent: a row of the record. */
export interface ActionRecord {
  turn: number
  entityId: string
  kind: ActionKind
  from: HexKey | null
  to: HexKey | null
  /** Hexes crossed on this turn, in the order they were entered. */
  entered: readonly HexKey[]
  spent: number
  carry: number
}
