import type { Action, ActionKind, ActionRecord } from '../entities/action'
import type { Entity, EntityKind, Owner } from '../entities/entity'
import {
  MERCHANT_LEVELS,
  MERCHANT_TYPES,
  type Merchant,
  type MerchantType,
} from '../entities/merchant'
import type { HexKey } from '../hex/coords'
import type { TerrainControls } from '../stores/hexMap'
import {
  defaultResourceChances,
  TERRAIN_RESOURCES,
  type Resource,
  type ResourceChances,
  type ResourceOrigin,
  type ResourceType,
} from '../terrain/resources'
import type { TerrainId } from '../terrain/terrain'
import type { MapSnapshot, SavedAction, SavedOrigin, SavedState } from './mapState'

export const MAP_FILE_FORMAT = 'hexcrawl-map'
export const MAP_FILE_VERSION = 1
export const MAP_FILE_EXTENSION = '.hexmap.json'

export type MapFileResult = { ok: true; snapshot: MapSnapshot } | { ok: false; error: string }

type Guard<T> = (value: unknown) => value is T

const isString: Guard<string> = (value): value is string => typeof value === 'string'

const isBoolean: Guard<boolean> = (value): value is boolean => typeof value === 'boolean'

const isNumber: Guard<number> = (value): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const isTurn: Guard<number> = (value): value is number =>
  Number.isInteger(value) && (value as number) >= 0

const isLevel: Guard<number> = (value): value is number =>
  Number.isInteger(value) &&
  (value as number) >= MERCHANT_LEVELS.min &&
  (value as number) <= MERCHANT_LEVELS.max

const isChance: Guard<number> = (value): value is number =>
  isNumber(value) && value >= 0 && value <= 1

const isHex: Guard<HexKey> = (value): value is HexKey =>
  typeof value === 'string' && /^-?\d+,-?\d+$/.test(value)

const oneOf =
  <T extends string>(...allowed: T[]): Guard<T> =>
  (value): value is T =>
    allowed.includes(value as T)

const nullable =
  <T>(guard: Guard<T>): Guard<T | null> =>
  (value): value is T | null =>
    value === null || guard(value)

const listOf =
  <T>(guard: Guard<T>): Guard<readonly T[]> =>
  (value): value is readonly T[] =>
    Array.isArray(value) && value.every(guard)

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// The mapped type makes leaving a field out of a shape a type error, so a field
// added to the snapshot cannot slip through the file unchecked.
const shape =
  <T>(fields: { [K in keyof T]-?: Guard<T[K]> }): Guard<T> =>
  (value): value is T =>
    isObject(value) &&
    Object.entries(fields).every(([key, guard]) => (guard as Guard<unknown>)(value[key]))

const isActionKind = oneOf<ActionKind>('move', 'wait', 'camp')

const isAction: Guard<Action> = (value): value is Action =>
  isObject(value) &&
  (value.kind === 'move'
    ? listOf(isHex)(value.route) && listOf(isHex)(value.waypoints)
    : value.kind === 'wait' || value.kind === 'camp')

/** One check per snapshot field; a new field is one new line here. */
const SNAPSHOT_FIELDS: { [K in keyof MapSnapshot]-?: Guard<MapSnapshot[K]> } = {
  terrain: shape<TerrainControls>({
    seed: isNumber,
    scale: isNumber,
    seaLevel: isNumber,
    relief: isNumber,
  }),
  worldRadius: isNumber,
  fog: isBoolean,
  showSight: isBoolean,
  showHistory: isBoolean,
  dmView: isBoolean,
  turn: isTurn,
  selectedId: isString,
  entities: listOf(
    shape<Entity>({
      id: isString,
      name: isString,
      kind: oneOf<EntityKind>('party', 'caravan', 'npc', 'ship'),
      owner: oneOf<Owner>('player', 'dm'),
      color: isString,
      pacePerTurn: isNumber,
      sight: isNumber,
      hidden: isBoolean,
    }),
  ),
  origins: listOf(shape<SavedOrigin>({ entityId: isString, turn: isTurn, hex: isHex })),
  record: listOf(
    shape<ActionRecord>({
      turn: isTurn,
      entityId: isString,
      kind: isActionKind,
      from: nullable(isHex),
      to: nullable(isHex),
      entered: listOf(isHex),
      spent: isNumber,
      carry: isNumber,
    }),
  ),
  states: listOf(
    shape<SavedState>({
      turn: isTurn,
      entityId: isString,
      at: nullable(isHex),
      carry: isNumber,
      pending: listOf(isHex),
      waypoints: listOf(isHex),
      riding: nullable(isString),
    }),
  ),
  queue: listOf(shape<SavedAction>({ entityId: isString, action: isAction })),
  notes: listOf(shape<MapSnapshot['notes'][number]>({ hex: isHex, text: isString })),
  events: listOf(
    shape<MapSnapshot['events'][number]>({
      hex: isHex,
      id: isString,
      title: isString,
      description: isString,
    }),
  ),
  locations: listOf(
    shape<MapSnapshot['locations'][number]>({
      hex: isHex,
      id: isString,
      name: isString,
      kind: isString,
      description: isString,
    }),
  ),
  merchants: listOf(
    shape<Merchant>({
      id: isString,
      caravanId: isString,
      name: isString,
      type: oneOf<MerchantType>(...MERCHANT_TYPES),
      level: isLevel,
    }),
  ),
  resources: listOf(
    shape<Resource>({
      id: isString,
      hex: isHex,
      type: oneOf<ResourceType>(...new Set(Object.values(TERRAIN_RESOURCES).flat())),
      origin: oneOf<ResourceOrigin>('generated', 'manual'),
    }),
  ),
  resourceChances: shape<ResourceChances>(
    Object.fromEntries(
      Object.keys(defaultResourceChances()).map((terrain) => [terrain, isChance]),
    ) as { [K in TerrainId]: Guard<number> },
  ),
  resourceSpacing: isTurn,
  fogEdits: listOf(shape<MapSnapshot['fogEdits'][number]>({ hex: isHex, revealed: isBoolean })),
}

export function serialiseMap(snapshot: MapSnapshot): string {
  return JSON.stringify(
    { format: MAP_FILE_FORMAT, version: MAP_FILE_VERSION, map: snapshot },
    null,
    2,
  )
}

const fail = (error: string): MapFileResult => ({ ok: false, error })

/** The file is somebody else's text until every field of it has been checked. */
export function parseMapFile(text: string): MapFileResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return fail('This file is not valid JSON.')
  }

  if (!isObject(parsed) || parsed.format !== MAP_FILE_FORMAT) {
    return fail('This file is not a hexcrawl map.')
  }
  if (parsed.version !== MAP_FILE_VERSION) {
    return fail(
      `This map file is version ${String(parsed.version)}; only version ${MAP_FILE_VERSION} can be read.`,
    )
  }

  const map = parsed.map
  if (!isObject(map)) return fail('This map file has no map in it.')

  const snapshot: Record<string, unknown> = {}
  for (const [key, guard] of Object.entries(SNAPSHOT_FIELDS)) {
    if (!(guard as Guard<unknown>)(map[key])) {
      return fail(`This map file is damaged: "${key}" is missing or malformed.`)
    }
    snapshot[key] = map[key]
  }
  return { ok: true, snapshot: snapshot as unknown as MapSnapshot }
}
