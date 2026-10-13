import {
  ENCOUNTER_WHENS,
  type EncounterChange,
  type EncounterEntry,
  type EncounterOverride,
  type EncounterWhen,
} from '../encounters/tables'
import type { Action, ActionKind, ActionRecord } from '../entities/action'
import type { CatalogEntry, CatalogKind, CatalogOverride, CatalogPatch } from '../entities/catalog'
import type { Entity, EntityKind, Owner } from '../entities/entity'
import {
  MERCHANT_LEVELS,
  MERCHANT_TYPES,
  type Merchant,
  type MerchantType,
} from '../entities/merchant'
import { SUPPLY_LIMITS, type Supply } from '../entities/supplies'
import type { HexKey } from '../hex/coords'
import type { TerrainControls } from '../stores/hexMap'
import { isRiverEdge, type RiverEdge } from '../terrain/rivers'
import { isRoadEdge, type RoadEdge } from '../terrain/roads'
import {
  defaultResourceChances,
  RESOURCE_TYPES,
  TERRAIN_RESOURCES,
  type Resource,
  type ResourceChances,
  type ResourceOrigin,
  type ResourceType,
} from '../terrain/resources'
import { TERRAIN_IDS, type TerrainId } from '../terrain/terrain'
import type { MapSnapshot, SavedAction, SavedOrigin, SavedState, SavedSupply } from './mapState'

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

const isSupply =
  (supply: Supply): Guard<number> =>
  (value): value is number =>
    Number.isInteger(value) &&
    (value as number) >= 0 &&
    (value as number) <= SUPPLY_LIMITS[supply].max

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

const isWeight: Guard<number> = (value): value is number => isNumber(value) && value >= 0

const ENCOUNTER_FIELDS: { [K in keyof EncounterChange]-?: Guard<EncounterEntry[K]> } = {
  terrain: oneOf<TerrainId>(...TERRAIN_IDS),
  when: oneOf<EncounterWhen>(...ENCOUNTER_WHENS),
  weight: isWeight,
  title: isString,
  description: isString,
}

const isEncounterEntry = shape<EncounterEntry>({ id: isString, ...ENCOUNTER_FIELDS })

// A change names only the fields it touches, but nothing it names may be
// unknown or malformed, or the merge would carry the junk into the table.
const isEncounterChange: Guard<EncounterChange> = (value): value is EncounterChange =>
  isObject(value) &&
  Object.entries(value).every(
    ([key, field]) =>
      Object.hasOwn(ENCOUNTER_FIELDS, key) &&
      (ENCOUNTER_FIELDS[key as keyof EncounterChange] as Guard<unknown>)(field),
  )

const isEncounterOverride: Guard<EncounterOverride> = (value): value is EncounterOverride =>
  isObject(value) &&
  (value.kind === 'add'
    ? isEncounterEntry(value.entry)
    : value.kind === 'remove'
      ? isString(value.id)
      : value.kind === 'change' && isString(value.id) && isEncounterChange(value.change))

const isMaterials = listOf(oneOf<ResourceType>(...RESOURCE_TYPES))

const isCatalogKind = oneOf<CatalogKind>('trade', 'service')

const PATCH_FIELDS: { [K in keyof CatalogPatch]-?: Guard<NonNullable<CatalogPatch[K]>> } = {
  name: isString,
  description: isString,
  price: isString,
  level: isLevel,
  kind: isCatalogKind,
  materials: isMaterials,
}

const isCatalogPatch: Guard<CatalogPatch> = (value): value is CatalogPatch =>
  isObject(value) &&
  Object.entries(value).every(
    ([key, field]) =>
      Object.hasOwn(PATCH_FIELDS, key) &&
      (PATCH_FIELDS[key as keyof CatalogPatch] as Guard<unknown>)(field),
  )

const isCatalogEntry = shape<CatalogEntry>({
  id: isString,
  merchant: oneOf<MerchantType>(...MERCHANT_TYPES),
  level: isLevel,
  kind: isCatalogKind,
  name: isString,
  description: isString,
  price: isString,
  materials: (value): value is readonly ResourceType[] | undefined =>
    value === undefined || isMaterials(value),
})

const isCatalogOverride: Guard<CatalogOverride> = (value): value is CatalogOverride => {
  if (!isObject(value) || !isString(value.id)) return false
  if (value.op === 'remove') return true
  if (value.op === 'edit') return isCatalogPatch(value.patch)
  return value.op === 'add' && isCatalogEntry(value.entry) && value.entry.id === value.id
}

// The overrides are keyed by entry id, so two for one entry would leave which
// one counts up to the order they happen to be read in.
const isCatalogOverrides: Guard<readonly CatalogOverride[]> = (
  value,
): value is readonly CatalogOverride[] =>
  listOf(isCatalogOverride)(value) && new Set(value.map((one) => one.id)).size === value.length

/** One check per snapshot field; a new field is one line here and one in ADDED_FIELD_DEFAULTS. */
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
  supplies: listOf(
    shape<SavedSupply>({
      entityId: isString,
      turn: isTurn,
      food: isSupply('food'),
      gold: isSupply('gold'),
    }),
  ),
  notes: listOf(shape<MapSnapshot['notes'][number]>({ hex: isHex, text: isString })),
  events: listOf(
    shape<MapSnapshot['events'][number]>({
      hex: isHex,
      id: isString,
      title: isString,
      description: isString,
      turn: (value): value is number | undefined => value === undefined || isTurn(value),
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
  catalogOverrides: isCatalogOverrides,
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
  encounterOverrides: listOf(isEncounterOverride),
  roads: listOf(
    (value): value is RoadEdge =>
      shape<RoadEdge>({ a: isHex, b: isHex })(value) && isRoadEdge(value.a, value.b),
  ),
  rivers: listOf(
    (value): value is RiverEdge =>
      shape<RiverEdge>({ a: isHex, b: isHex })(value) && isRiverEdge(value.a, value.b),
  ),
  terrainOverrides: listOf(
    shape<MapSnapshot['terrainOverrides'][number]>({
      hex: isHex,
      terrain: oneOf<TerrainId>(...TERRAIN_IDS),
    }),
  ),
}

/** The fields every version 1 file has carried since the first export. */
type OriginalField = keyof Pick<
  MapSnapshot,
  | 'terrain'
  | 'worldRadius'
  | 'fog'
  | 'showSight'
  | 'showHistory'
  | 'dmView'
  | 'turn'
  | 'selectedId'
  | 'entities'
  | 'origins'
  | 'record'
  | 'states'
  | 'queue'
  | 'notes'
  | 'events'
  | 'locations'
  | 'merchants'
  | 'resources'
  | 'resourceChances'
  | 'resourceSpacing'
>

// Every later field must say what a file from before it existed stands for, or
// that file stops opening the day the field ships.
const ADDED_FIELD_DEFAULTS: {
  [K in Exclude<keyof MapSnapshot, OriginalField>]-?: () => MapSnapshot[K]
} = {
  fogEdits: () => [],
  encounterOverrides: () => [],
  catalogOverrides: () => [],
  roads: () => [],
  rivers: () => [],
  terrainOverrides: () => [],
  supplies: () => [],
}

const withDefault = (key: string, value: unknown): unknown => {
  if (value === undefined && Object.hasOwn(ADDED_FIELD_DEFAULTS, key)) {
    return ADDED_FIELD_DEFAULTS[key as keyof typeof ADDED_FIELD_DEFAULTS]()
  }
  // Odds for a terrain the file never knew fall back to the default, as they do
  // when an older save is loaded.
  if (key === 'resourceChances' && isObject(value)) return { ...defaultResourceChances(), ...value }
  return value
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
    const value = withDefault(key, map[key])
    if (!(guard as Guard<unknown>)(value)) {
      return fail(`This map file is damaged: "${key}" is missing or malformed.`)
    }
    snapshot[key] = value
  }
  return { ok: true, snapshot: snapshot as unknown as MapSnapshot }
}
