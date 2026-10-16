import {
  isHex,
  isNumber,
  isObject,
  isString,
  isSupply,
  isTurn,
  listOf,
  nullable,
  oneOf,
  shape,
  SNAPSHOT_FIELDS,
  type Guard,
} from '../persistence/mapFile'
import { RESOURCE_TYPES, type ResourceType } from '../terrain/resources'
import { TERRAIN_IDS, type TerrainId } from '../terrain/terrain'
import { PHASES, type Clock, type Phase } from '../time/clock'
import type { PlayerProjection, PlayerState, PlayerSupplies, PlayerTile } from './projection'

const isHexes = listOf(isHex)

// The map file's guards check lists as readonly ones.
type Checked<T> = T extends (infer Row)[] ? readonly Row[] : T

/**
 * One check per field a player receives. The fields a map file carries too are
 * checked the way the file is; the mapped type makes a field added to the
 * projection without a check here a type error.
 */
export const PROJECTION_FIELDS: {
  [K in keyof PlayerProjection]-?: Guard<Checked<PlayerProjection[K]>>
} = {
  turn: SNAPSHOT_FIELDS.turn,
  clock: shape<Clock>({
    turn: isTurn,
    phase: oneOf<Phase>(...PHASES),
    index: isTurn,
    day: isTurn,
  }),
  worldRadius: SNAPSHOT_FIELDS.worldRadius,
  explored: isHexes,
  visible: isHexes,
  tiles: listOf(
    shape<PlayerTile>({
      hex: isHex,
      terrain: oneOf<TerrainId>(...TERRAIN_IDS),
      height: isNumber,
      level: isNumber,
      elevation: isNumber,
    }),
  ),
  entities: SNAPSHOT_FIELDS.entities,
  states: listOf(
    shape<PlayerState>({
      entityId: isString,
      at: nullable(isHex),
      carry: isNumber,
      pending: isHexes,
      waypoints: isHexes,
      riding: nullable(isString),
    }),
  ),
  origins: SNAPSHOT_FIELDS.origins,
  record: SNAPSHOT_FIELDS.record,
  queue: SNAPSHOT_FIELDS.queue,
  supplies: listOf(
    shape<PlayerSupplies>({
      entityId: isString,
      food: isSupply('food'),
      gold: isSupply('gold'),
    }),
  ),
  merchants: SNAPSHOT_FIELDS.merchants,
  items: SNAPSHOT_FIELDS.items,
  catalogOverrides: SNAPSHOT_FIELDS.catalogOverrides,
  resources: listOf(
    shape<PlayerProjection['resources'][number]>({
      id: isString,
      hex: isHex,
      type: oneOf<ResourceType>(...RESOURCE_TYPES),
    }),
  ),
  locations: SNAPSHOT_FIELDS.locations,
  events: SNAPSHOT_FIELDS.events,
  roads: SNAPSHOT_FIELDS.roads,
  rivers: SNAPSHOT_FIELDS.rivers,
}

export const PROJECTION_KEYS = Object.keys(PROJECTION_FIELDS) as (keyof PlayerProjection)[]

export const encodeState = (projection: PlayerProjection): string => JSON.stringify(projection)

/** The host's word for what the players see, or null unless every field of it checks out. */
export function decodeState(text: string): PlayerProjection | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (!isObject(parsed) || Object.keys(parsed).length !== PROJECTION_KEYS.length) return null
  const valid = PROJECTION_KEYS.every(
    (key) => Object.hasOwn(parsed, key) && (PROJECTION_FIELDS[key] as Guard<unknown>)(parsed[key]),
  )
  return valid ? (parsed as unknown as PlayerProjection) : null
}
