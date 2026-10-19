import type { HexKey } from '../hex/coords'
import type { Movement } from '../terrain/travel'
import { isNight } from '../time/clock'

export type EntityKind = 'party' | 'caravan' | 'npc' | 'ship'

/** Who gives it its orders. The DM's own entities are also the hidden ones. */
export type Owner = 'player' | 'dm'

/**
 * Anything on the map the clock governs. Stats are the whole of what an entity
 * is allowed to do in a turn: how much ground it covers and how far it sees.
 */
export interface Entity {
  id: string
  name: string
  kind: EntityKind
  owner: Owner
  color: string
  /** Hex-costs of movement earned per turn: 1 is a flat hex a turn. */
  pacePerTurn: number
  /** Daylight sight radius, in hexes; the dark cuts it down. */
  sight: number
  /** Sees as far by night as by day. */
  darkvision: boolean
  /** Kept off the players' map. */
  hidden: boolean
  /** A caravan's picture, one of the bundled portraits; none until the DM picks one. */
  portrait?: string
}

/** What an entity is standing on, and what it carries into the next turn. */
export interface EntityState {
  at: HexKey | null
  /** Unspent budget: half a hex walked is not half a hex lost. */
  carry: number
  /** The route left to walk, standing until it runs out or is replaced. */
  pending: readonly HexKey[]
  /** The leg ends still ahead on that route, in the order they are reached. */
  waypoints: readonly HexKey[]
  /** The carrier it is travelling inside, which does its walking for it. */
  riding: string | null
}

// Enough to tell a handful of entities apart on the map and in the list; it
// wraps rather than running out.
export const ENTITY_COLORS: readonly string[] = [
  '#e0b25a',
  '#6fa8dc',
  '#8fbc6a',
  '#c17f9e',
  '#d98b5f',
  '#7fc4bd',
]

/** What the dark leaves of an entity's sight, and the least it can ever see. */
export const NIGHT_SIGHT = 0.3
export const MIN_NIGHT_SIGHT = 1

/**
 * Dark does not slow anybody down, it blinds them: an entity keeps its pace
 * after nightfall and loses most of its horizon, unless it has darkvision.
 */
export const sightAt = (entity: Entity, turn: number): number =>
  isNight(turn) && !entity.darkvision
    ? Math.max(MIN_NIGHT_SIGHT, Math.round(entity.sight * NIGHT_SIGHT))
    : entity.sight

/** What each kind is worth before anyone edits it: pace, then daylight sight. */
export const KIND_DEFAULTS: Readonly<Record<EntityKind, { pacePerTurn: number; sight: number }>> = {
  party: { pacePerTurn: 1, sight: 5 },
  caravan: { pacePerTurn: 0.5, sight: 4 },
  npc: { pacePerTurn: 1, sight: 4 },
  ship: { pacePerTurn: 3, sight: 7 },
}

/** Which ground each kind can cross; fixed by the kind, not edited per entity. */
export const KIND_MOVEMENT: Readonly<Record<EntityKind, Movement>> = {
  party: 'land',
  caravan: 'land',
  npc: 'land',
  ship: 'sea',
}

/** Kinds that carry riders. A carrier never rides another, so nesting never arises. */
export const isCarrier = (kind: EntityKind): boolean => kind === 'caravan' || kind === 'ship'

export const idleState = (): EntityState => ({
  at: null,
  carry: 0,
  pending: [],
  waypoints: [],
  riding: null,
})

export function newEntity(
  name: string,
  index: number,
  kind: EntityKind = 'party',
  owner: Owner = 'player',
): Entity {
  return {
    id: crypto.randomUUID(),
    name,
    kind,
    owner,
    color: ENTITY_COLORS[index % ENTITY_COLORS.length],
    ...KIND_DEFAULTS[kind],
    darkvision: false,
    hidden: owner === 'dm',
  }
}
