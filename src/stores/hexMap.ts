import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import type { Action, ActionRecord } from '../entities/action'
import {
  idleState,
  isCarrier,
  KIND_MOVEMENT,
  newEntity,
  sightAt,
  type Entity,
  type EntityKind,
  type EntityState,
  type Owner,
} from '../entities/entity'
import {
  applyCatalogOverrides,
  customEntry,
  DEFAULT_CATALOG,
  editOverride,
  removeOverride,
  resetOverride,
  type CatalogEntry,
  type CatalogOverride,
  type CatalogPatch,
} from '../entities/catalog'
import {
  carriesInventory,
  clampQuantity,
  cleanWeight,
  moveItem,
  newItem,
  type Item,
  type ItemFields,
} from '../entities/inventory'
import {
  clampLevel,
  MERCHANT_INFO,
  newMerchant,
  type Merchant,
  type MerchantType,
} from '../entities/merchant'
import {
  carriesSupplies,
  cutSupplies,
  editSupply,
  suppliesAt,
  type Supplies,
  type Supply,
  type SupplyEntry,
  type SupplyLedger,
} from '../entities/supplies'
import {
  changeEncounter,
  DEFAULT_ENCOUNTERS,
  mergeTables,
  removeEncounter as dropEncounter,
  resetTerrain,
  restoreEncounter as undoEncounterOverride,
  rollFor,
  tableFor,
  type EncounterChange,
  type EncounterEntry,
  type EncounterOverride,
  type EncounterRoll,
} from '../encounters/tables'
import { encountersMet, encountersUpTo, interleave, type LogEntry } from '../encounters/log'
import { resolveTurn } from '../entities/resolve'
import type { TokenShape } from '../engine/partyToken'
import type { ResourceView } from '../engine/resourceMarkers'
import type { HexEvent, HexLocation } from '../hex/content'
import {
  createKnowledge,
  editFog,
  NO_FOG_EDITS,
  withoutHidden,
  type FogEdits,
  type FogMode,
  type Knowledge,
} from '../hex/fogEdits'
import { hexKey, line, parseKey, range, type Axial, type HexKey } from '../hex/coords'
import type { VisionOptions } from '../hex/vision'
import type { MapSnapshot } from '../persistence/mapState'
import { fieldFromTiles, withOverrides, type TerrainField } from '../terrain/field'
import { scatterResources } from '../terrain/resourceGen'
import { riverEdge, riverKey, type Rivers } from '../terrain/rivers'
import { roadEdge, roadKey, withoutRoadAt, withRoad, type Roads } from '../terrain/roads'
import {
  DEFAULT_RESOURCE_SPACING,
  RESOURCE_SPACING_LIMITS,
  defaultResourceChances,
  type Resource,
  type ResourceChances,
  type ResourceOrigin,
  type ResourceType,
} from '../terrain/resources'
import { sightFrom, type PartySight } from '../terrain/sight'
import {
  besideLand,
  canEnter,
  chainRoute,
  findRoute,
  joinLegs,
  KM_PER_HEX,
  shoreOf,
  type Route,
  type Shore,
} from '../terrain/travel'
import { clockAt, nextPhaseTurn, type Clock, type Phase } from '../time/clock'
import {
  createPainter,
  isWater,
  TERRAIN_DEFAULTS,
  type TerrainId,
  type TerrainTile,
} from '../terrain/terrain'
import {
  allowed,
  DM,
  PLAYER,
  type Action as Permission,
  type Target,
  type Viewer,
} from '../session/permissions'
import { createHistory, slotOf } from './history'

const NOTHING_IN_SIGHT: PartySight = { radius: 0, visible: new Set(), blocked: new Set() }

/** How each kind is carved on the board: whoever walks is a pawn. */
const TOKEN_SHAPES: Readonly<Record<EntityKind, TokenShape>> = {
  party: 'pawn',
  caravan: 'wagon',
  npc: 'pawn',
  ship: 'boat',
}

/** Where an entity was first put on the map, and the turn it appeared on. */
export interface Origin {
  turn: number
  hex: HexKey
}

/** One turn already spent: what every entity did, and where it left off. */
export interface TurnFrame {
  records: readonly ActionRecord[]
  states: ReadonlyMap<string, EntityState>
}

/** What the crawl has seen, and what came to light since the answer before. */
export interface ExploredState {
  seen: ReadonlySet<HexKey>
  /** Null when the set was built from scratch, so there is no difference to draw. */
  added: ReadonlySet<HexKey> | null
  /** Counts the answers: a reader that skipped one knows to take the whole set. */
  version: number
}

/** One entity's line on the map, in the colour that entity wears. */
export interface EntityPath {
  id: string
  color: string
  hexes: Axial[]
}

/** One row of the record as the adventure log reads it. */
export interface JourneyRow {
  turn: number
  hex: HexKey
  terrain: TerrainId
  kind: Action['kind']
  entered: number
  /** False for a turn the crawl has been wound back past but still remembers. */
  spent: boolean
}

/** One stretch of an order, from the last stop (or where the entity stands) to the next. */
export interface Leg {
  to: HexKey
  steps: number
  km: number
  /** Turns the leg takes at the entity's pace, ignoring what it carries in. */
  turns: number
  /** A leg sailed that ends ashore, where whoever rides aboard can step off. */
  landfall: boolean
}

/** The terrain knobs the map panel is allowed to turn. */
export interface TerrainControls {
  seed: number
  scale: number
  seaLevel: number
  relief: number
}

export const TERRAIN_LIMITS = {
  scale: { min: 15, max: 150, step: 5 },
  seaLevel: { min: -0.5, max: 0.5, step: 0.05 },
  relief: { min: 2, max: 14, step: 0.5 },
} as const

export const PACE_LIMITS = { min: 0.5, max: 3, step: 0.5 } as const

/** What a click on the map does in DM view: look at a hex, or work the ground. */
export type DmTool = 'select' | 'paint' | 'fog' | 'road' | 'river'

export const DM_TOOLS: readonly DmTool[] = ['select', 'paint', 'fog', 'road', 'river']

/** Tools that work every hex within the brush radius rather than one hex. */
export const BRUSH_TOOLS: ReadonlySet<DmTool> = new Set(['paint', 'fog'])

/** Brush radius in hexes: 0 is the hex clicked alone. */
export const BRUSH_LIMITS = { min: 0, max: 5, step: 1 } as const

/**
 * How far the world runs from the middle, in hexes. Only the window is ever
 * built, so the cost of a bigger one is the ground it hides, not the frame.
 */
export const WORLD_SIZES = { small: 60, large: 150, huge: 300 } as const

export type WorldSize = keyof typeof WORLD_SIZES

export const MAX_SEED = 1_000_000

export const MIN_SIGHT = 1
export const MAX_SIGHT = 10

/** The sight the vision falls back to with nobody on the map to ask. */
export const DEFAULT_SIGHT = 5

/** The world, entities and caravan panels on the left, the hex details on the right. */
export type SidePanel = 'world' | 'entities' | 'caravan' | 'details'

export const useHexMapStore = defineStore('hexMap', () => {
  // The world is a function, not a stored map: only the ground near the view is
  // ever worked out, and everything that reads terrain asks the field for it.
  const ground = shallowRef<TerrainField>(fieldFromTiles(new Map()))

  /** The DM's brushwork over the generated ground, hex by hex. */
  const terrainOverrides = shallowRef<ReadonlyMap<HexKey, TerrainId>>(new Map())
  const hovered = ref<HexKey | null>(null)

  // Entities are held as whole records and replaced rather than mutated, so a
  // crawl hundreds of turns long never becomes hundreds of reactive proxies.
  const entities = shallowRef<readonly Entity[]>([newEntity('the party', 0)])

  /** Empty when the map has been cleared of everybody; there is no stand-in. */
  const selectedId = ref<string>(entities.value[0].id)

  /** The turn the crawl stands at; nothing moves except by one passing. */
  const turn = ref(0)

  /** Where each entity was put down, and when. */
  const origins = shallowRef<ReadonlyMap<string, Origin>>(new Map())

  /** Frame i is the world at the end of turn i: append-only, the record. */
  const frames = shallowRef<readonly TurnFrame[]>([])

  /**
   * Bumped whenever the record is rewritten. Its length is not enough to tell
   * two records apart: a rewind followed by a different order can leave exactly
   * as many turns as it found, holding different ground.
   */
  const recordVersion = ref(0)

  const setFrames = (next: readonly TurnFrame[]): void => {
    frames.value = next
    recordVersion.value += 1
  }

  /** What each entity intends to do on the next turn; spent by advancing. */
  const queue = shallowRef<ReadonlyMap<string, Action>>(new Map())

  const notes = shallowRef<ReadonlyMap<HexKey, string>>(new Map())
  const events = shallowRef<ReadonlyMap<HexKey, readonly HexEvent[]>>(new Map())
  const locations = shallowRef<ReadonlyMap<HexKey, readonly HexLocation[]>>(new Map())

  /** Every caravan's crew, in the order they were taken on. */
  const merchants = shallowRef<readonly Merchant[]>([])

  /** What every party, caravan and ship carries, each owner's in the order it was added. */
  const items = shallowRef<readonly Item[]>([])

  /** What each caravan's wagons hold, turn by turn, as the DM has set it. */
  const supplies = shallowRef<SupplyLedger>(new Map())

  /** The DM's changes to what merchants offer; like the crews, a new world keeps them. */
  const catalogOverrides = shallowRef<readonly CatalogOverride[]>([])
  const catalog = computed<readonly CatalogEntry[]>(() =>
    applyCatalogOverrides(DEFAULT_CATALOG, catalogOverrides.value),
  )

  /** Every resource on the map, in the order they were placed. */
  const resources = shallowRef<readonly Resource[]>([])
  const resourceChances = shallowRef<ResourceChances>(defaultResourceChances())
  const resourceSpacing = ref(DEFAULT_RESOURCE_SPACING)

  const roads = shallowRef<Roads>(new Set())

  /**
   * Where the road or river being drawn last reached, so the next tap carries
   * it on from there; null when none is being drawn. Never saved, but undone with the
   * tap that moved it, so undoing a stretch hands the pen back where it was.
   */
  const roadTail = ref<HexKey | null>(null)
  const roadErase = ref(false)

  /** Every stretch of river, each running from one hex's middle to its neighbour's like a road. */
  const rivers = shallowRef<Rivers>(new Set())

  const resourcesByHex = computed<ReadonlyMap<HexKey, readonly Resource[]>>(() => {
    const byHex = new Map<HexKey, Resource[]>()
    for (const one of resources.value) byHex.set(one.hex, [...(byHex.get(one.hex) ?? []), one])
    return byHex
  })

  /** The DM's edits to the encounter tables, laid over the defaults. */
  const encounterOverrides = shallowRef<readonly EncounterOverride[]>([])

  const encounters = computed<readonly EncounterEntry[]>(() =>
    mergeTables(DEFAULT_ENCOUNTERS, encounterOverrides.value),
  )

  const fog = ref(true)
  /** The DM has lifted the fog off the whole map for the players. */
  const revealed = ref(false)
  /** The DM's view shows the ground under the fog, through a thin wash of it. */
  const fogSeeThrough = ref(false)
  /** Hexes the DM has revealed to or hidden from the players by hand. */
  const fogEdits = shallowRef<FogEdits>(NO_FOG_EDITS)
  const showSight = ref(false)
  const showHistory = ref(false)
  const showAllPaths = ref(false)
  const dmView = ref(true)

  /** Who this browser is acting as: the view switch decides it. */
  const viewer = computed<Viewer>(() => (dmView.value ? DM : PLAYER))

  // Set only for the length of an actAs call, so an order a player sends in is
  // judged as theirs rather than as whoever is sitting at this browser.
  let actingFor: Viewer | null = null

  /**
   * Whether whoever is acting may do the action, to the target when it has one.
   * Every action that changes something asks this first and does nothing when
   * refused, so a hidden button is never the only thing in the way.
   */
  const may = (action: Permission, target?: Target): boolean =>
    allowed(actingFor ?? viewer.value, action, target)

  /** Runs store calls as someone else, such as a player whose order came in from afar. */
  const actAs = <R>(who: Viewer, work: () => R): R => {
    const outer = actingFor
    actingFor = who
    try {
      return work()
    } finally {
      actingFor = outer
    }
  }

  const worldRadius = ref<number>(WORLD_SIZES.large)

  const terrain = ref<TerrainControls>({
    seed: TERRAIN_DEFAULTS.seed,
    scale: TERRAIN_DEFAULTS.scale,
    seaLevel: TERRAIN_DEFAULTS.seaLevel,
    relief: TERRAIN_DEFAULTS.relief,
  })

  const clock = computed<Clock>(() => clockAt(turn.value))

  /** The ground as everything reads it: what the seed made, painted over. */
  const field = computed<TerrainField>(() =>
    withOverrides(ground.value, terrainOverrides.value, createPainter(terrain.value)),
  )

  /**
   * What undo can take back: the DM's edits and the orders being given. An
   * action opts in by being wrapped in history.track where the store hands it
   * out; state it writes that is not listed here is left where it is. The turn
   * is not in it, and moving the clock forgets every step.
   */
  const history = createHistory({
    entities: slotOf(entities),
    selectedId: slotOf(selectedId),
    origins: slotOf(origins),
    frames: { get: () => frames.value, set: setFrames },
    queue: slotOf(queue),
    notes: slotOf(notes),
    events: slotOf(events),
    locations: slotOf(locations),
    merchants: slotOf(merchants),
    items: slotOf(items),
    supplies: slotOf(supplies),
    catalogOverrides: slotOf(catalogOverrides),
    resources: slotOf(resources),
    resourceChances: slotOf(resourceChances),
    resourceSpacing: slotOf(resourceSpacing),
    fogEdits: slotOf(fogEdits),
    revealed: slotOf(revealed),
    encounterOverrides: slotOf(encounterOverrides),
    roads: slotOf(roads),
    roadTail: slotOf(roadTail),
    rivers: slotOf(rivers),
    terrainOverrides: slotOf(terrainOverrides),
  })

  /**
   * Whoever the map is currently listening to, or nobody at all: a map can be
   * emptied of entities, and an empty map has no orders to give.
   */
  const selectedEntity = computed<Entity | null>(
    () =>
      entities.value.find((one) => one.id === selectedId.value) ??
      entities.value.find((one) => dmView.value || !one.hidden) ??
      null,
  )

  const openingState = (id: string, at: number): EntityState => {
    const origin = origins.value.get(id)
    return origin && origin.turn <= at ? { ...idleState(), at: origin.hex } : idleState()
  }

  /**
   * The world at the opening of a turn: what the frame before it left behind,
   * or where an entity was put down if it has yet to spend a turn. Reading the
   * past out of the record is what makes a rewind exact rather than a guess.
   */
  const statesAt = (at: number): ReadonlyMap<string, EntityState> => {
    const frame = at > 0 ? frames.value[at - 1] : undefined
    const states = new Map<string, EntityState>()
    for (const entity of entities.value) {
      states.set(entity.id, frame?.states.get(entity.id) ?? openingState(entity.id, at))
    }
    return states
  }

  const states = computed<ReadonlyMap<string, EntityState>>(() => statesAt(turn.value))

  const stateOf = (id: string): EntityState => states.value.get(id) ?? idleState()

  const selectedState = computed<EntityState>(() => stateOf(selectedId.value))

  /**
   * The caravan an entity is riding in, or nothing at all. A caravan taken off
   * the map leaves whoever was inside it standing where it stood: the record
   * still says they were riding, and what they were riding is gone.
   */
  const aboard = ({ riding }: EntityState): string | null =>
    riding && entities.value.some((one) => one.id === riding) ? riding : null

  const carrierOf = (id: string): string | null => aboard(stateOf(id))

  /** Who is inside each caravan this turn, in the order the entities are listed. */
  const riders = computed<ReadonlyMap<string, readonly Entity[]>>(() => {
    const inside = new Map<string, Entity[]>()
    for (const one of entities.value) {
      const carrier = carrierOf(one.id)
      if (!carrier) continue
      const aboard = inside.get(carrier) ?? []
      aboard.push(one)
      inside.set(carrier, aboard)
    }
    return inside
  })

  const ridersOf = (caravanId: string): readonly Entity[] => riders.value.get(caravanId) ?? []

  /**
   * The caravan the panel shows: the selected one, or the one the selected
   * entity rides in, so a party aboard still sees its wagons. The players
   * never get a hidden one.
   */
  const shownCaravan = computed<Entity | null>(() => {
    const selected = selectedEntity.value
    if (!selected) return null
    const carrier = carrierOf(selected.id)
    const caravan =
      selected.kind === 'caravan'
        ? selected
        : (entities.value.find((one) => one.id === carrier && one.kind === 'caravan') ?? null)
    return caravan && (dmView.value || !caravan.hidden) ? caravan : null
  })

  /** Water with land beside it: a ship there can take on or put off riders. */
  const offshore = (hex: HexKey): boolean => {
    const tile = tileAt(hex)
    return tile !== undefined && besideLand(field.value, tile)
  }

  /** A rider whose carrier is out on open water, with no shore beside it to step off to. */
  const atSea = (id: string): boolean => {
    const at = stateOf(id).at
    const under = at ? tileAt(at) : undefined
    return carrierOf(id) !== null && under !== undefined && isWater(under) && !offshore(at!)
  }

  /** Where the selected entity stands: what the map calls the party's hex. */
  const start = computed<HexKey | null>(() => selectedState.value.at)
  const partyHex = start

  const entityOf = (id: string): Entity | undefined => entities.value.find((one) => one.id === id)

  const patch = (id: string, change: Partial<Entity>): void => {
    entities.value = entities.value.map((one) => (one.id === id ? { ...one, ...change } : one))
  }

  /** An empty id picks nobody, leaving the DM's clicks free to look the ground over. */
  const selectEntity = (id: string): void => {
    if (id === '' || entities.value.some((one) => one.id === id)) selectedId.value = id
  }

  const addEntity = (
    name?: string,
    kind: EntityKind = 'party',
    owner: Owner = 'player',
  ): Entity | null => {
    if (!may('addEntity')) return null
    const made = newEntity(
      name ?? `party ${entities.value.length + 1}`,
      entities.value.length,
      kind,
      owner,
    )
    entities.value = [...entities.value, made]
    return made
  }

  /**
   * Takes an entity off the map for good, the last one included: a DM clearing
   * the board is not an error state, it is an empty board.
   */
  const removeEntity = (id: string): void => {
    if (!may('removeEntity', entityOf(id))) return
    const remaining = entities.value.filter((one) => one.id !== id)
    if (remaining.length === entities.value.length) return

    entities.value = remaining
    if (selectedId.value === id) selectedId.value = remaining[0]?.id ?? ''

    const origin = new Map(origins.value)
    origin.delete(id)
    origins.value = origin

    const orders = new Map(queue.value)
    orders.delete(id)
    queue.value = orders

    merchants.value = merchants.value.filter((one) => one.caravanId !== id)
    if (items.value.some((one) => one.ownerId === id)) {
      items.value = items.value.filter((one) => one.ownerId !== id)
    }

    if (supplies.value.has(id)) {
      const stores = new Map(supplies.value)
      stores.delete(id)
      supplies.value = stores
    }
  }

  const renameEntity = (id: string, name: string): void => {
    if (!may('renameEntity', entityOf(id))) return
    const trimmed = name.trim()
    if (trimmed) patch(id, { name: trimmed })
  }

  const recolorEntity = (id: string, color: string): void => {
    if (!may('recolorEntity', entityOf(id))) return
    if (/^#[0-9a-f]{6}$/i.test(color)) patch(id, { color: color.toLowerCase() })
  }

  const clamp = (value: number, { min, max }: { min: number; max: number }): number =>
    Math.min(max, Math.max(min, value))

  const setPace = (id: string, pace: number): void => {
    if (!may('entitySettings', entityOf(id))) return
    patch(id, { pacePerTurn: clamp(pace, PACE_LIMITS) })
  }

  const setEntitySight = (id: string, sight: number): void => {
    if (!may('entitySettings', entityOf(id))) return
    patch(id, { sight: clamp(Math.round(sight), { min: MIN_SIGHT, max: MAX_SIGHT }) })
  }

  const vision = computed<VisionOptions>(() => {
    const one = selectedEntity.value
    return { radius: one ? sightAt(one, turn.value) : DEFAULT_SIGHT }
  })

  const setField = (next: TerrainField): void => {
    if (!may('terrain')) return
    ground.value = next
  }

  /** Fixtures and tests still speak in whole maps; the field wraps one. */
  const setTiles = (next: ReadonlyMap<HexKey, TerrainTile>): void => {
    if (!may('terrain')) return
    ground.value = fieldFromTiles(next)
  }

  const tileAt = (hex: HexKey): TerrainTile | undefined => field.value.at(parseKey(hex))

  const shoreAt = (hex: HexKey): Shore | null => {
    const tile = tileAt(hex)
    return tile ? shoreOf(field.value, tile) : null
  }

  const setHovered = (hex: Axial | null): void => {
    hovered.value = hex ? hexKey(hex) : null
  }

  /** The hex the DM is looking at; view state, never saved. */
  const selectedHex = ref<HexKey | null>(null)

  const selectHex = (hex: Axial | null): void => {
    selectedHex.value = hex ? hexKey(hex) : null
  }

  /** The DM's tool in hand; view state, never saved. */
  const dmTool = ref<DmTool>('select')
  const brushSize = ref(1)

  const setDmTool = (tool: DmTool): void => {
    if (!may('mapTools')) return
    dmTool.value = tool
  }

  const setBrushSize = (radius: number): void => {
    if (!may('mapTools') || !Number.isFinite(radius)) return
    brushSize.value = Math.max(BRUSH_LIMITS.min, Math.min(BRUSH_LIMITS.max, Math.round(radius)))
  }

  const brushHexes = (center: Axial): HexKey[] =>
    (BRUSH_TOOLS.has(dmTool.value) ? range(center, brushSize.value) : [center])
      .filter((hex) => field.value.at(hex) !== undefined)
      .map(hexKey)

  /**
   * The hexes a tap would touch, for the hover highlight. Kept as the same array
   * while the keys hold, so painting under a still pointer redraws nothing.
   */
  const hoverFootprint = computed<readonly HexKey[]>((previous) => {
    const hex = hovered.value
    if (!hex) return []
    const next = dmView.value && BRUSH_TOOLS.has(dmTool.value) ? brushHexes(parseKey(hex)) : [hex]
    const same =
      previous !== undefined &&
      previous.length === next.length &&
      previous.every((key, index) => key === next[index])
    return same ? previous : next
  })

  /** Which side panels are expanded; view state, never saved. */
  const panelsOpen = ref<Record<SidePanel, boolean>>({
    world: true,
    entities: true,
    caravan: true,
    details: true,
  })

  // On a narrow window the panels share the same strip of screen, so only one
  // of them may be expanded at a time.
  const setPanelOpen = (which: SidePanel, open: boolean, narrow: boolean): void => {
    const closeOthers = open && narrow
    panelsOpen.value = {
      world: which === 'world' ? open : !closeOthers && panelsOpen.value.world,
      entities: which === 'entities' ? open : !closeOthers && panelsOpen.value.entities,
      caravan: which === 'caravan' ? open : !closeOthers && panelsOpen.value.caravan,
      details: which === 'details' ? open : !closeOthers && panelsOpen.value.details,
    }
  }

  const setNote = (hex: HexKey, text: string): void => {
    if (!may('notes')) return
    const next = new Map(notes.value)
    if (text.trim()) next.set(hex, text)
    else next.delete(hex)
    notes.value = next
  }

  const appendTo = <T extends { id: string }>(
    held: ReadonlyMap<HexKey, readonly T[]>,
    hex: HexKey,
    item: T,
  ): ReadonlyMap<HexKey, readonly T[]> => new Map(held).set(hex, [...(held.get(hex) ?? []), item])

  const dropFrom = <T extends { id: string }>(
    held: ReadonlyMap<HexKey, readonly T[]>,
    hex: HexKey,
    id: string,
  ): ReadonlyMap<HexKey, readonly T[]> => {
    const list = held.get(hex)
    if (!list?.some((one) => one.id === id)) return held
    const next = new Map(held)
    const remaining = list.filter((one) => one.id !== id)
    if (remaining.length > 0) next.set(hex, remaining)
    else next.delete(hex)
    return next
  }

  const addEvent = (hex: HexKey, event: Omit<HexEvent, 'id'>): string | null => {
    if (!may('events')) return null
    const id = crypto.randomUUID()
    events.value = appendTo(events.value, hex, { ...event, id })
    return id
  }

  const removeEvent = (hex: HexKey, id: string): void => {
    if (!may('events')) return
    events.value = dropFrom(events.value, hex, id)
  }

  const addLocation = (hex: HexKey, location: Omit<HexLocation, 'id'>): string | null => {
    if (!may('locations')) return null
    const id = crypto.randomUUID()
    locations.value = appendTo(locations.value, hex, { ...location, id })
    return id
  }

  const removeLocation = (hex: HexKey, id: string): void => {
    if (!may('locations')) return
    locations.value = dropFrom(locations.value, hex, id)
  }

  const merchantsOf = (caravanId: string): readonly Merchant[] =>
    merchants.value.filter((one) => one.caravanId === caravanId)

  /** Only a caravan keeps a crew; asking anything else to take one on does nothing. */
  const addMerchant = (
    caravanId: string,
    type: MerchantType,
    name?: string,
    level?: number,
  ): Merchant | null => {
    if (!may('merchants')) return null
    if (entities.value.find((one) => one.id === caravanId)?.kind !== 'caravan') return null
    const made = newMerchant(caravanId, name?.trim() || MERCHANT_INFO[type].label, type, level)
    merchants.value = [...merchants.value, made]
    return made
  }

  const removeMerchant = (id: string): void => {
    if (!may('merchants')) return
    const remaining = merchants.value.filter((one) => one.id !== id)
    if (remaining.length !== merchants.value.length) merchants.value = remaining
  }

  const patchMerchant = (id: string, change: Partial<Merchant>): void => {
    merchants.value = merchants.value.map((one) => (one.id === id ? { ...one, ...change } : one))
  }

  const renameMerchant = (id: string, name: string): void => {
    if (!may('merchants')) return
    const trimmed = name.trim()
    if (trimmed) patchMerchant(id, { name: trimmed })
  }

  const setMerchantLevel = (id: string, level: number): void => {
    if (!may('merchants')) return
    patchMerchant(id, { level: clampLevel(level) })
  }

  const itemsOf = (ownerId: string): readonly Item[] =>
    items.value.filter((one) => one.ownerId === ownerId)

  const keepsInventory = (id: string): boolean => {
    const kind = entities.value.find((one) => one.id === id)?.kind
    return kind !== undefined && carriesInventory(kind)
  }

  const addItem = (
    ownerId: string,
    fields: Partial<ItemFields> & { name: string },
  ): Item | null => {
    if (!may('editInventory', entityOf(ownerId))) return null
    if (!keepsInventory(ownerId) || !fields.name.trim()) return null
    const made = newItem(ownerId, fields)
    items.value = [...items.value, made]
    return made
  }

  const holderOf = (itemId: string): Entity | undefined => {
    const item = items.value.find((one) => one.id === itemId)
    return item && entityOf(item.ownerId)
  }

  /** A blank name is ignored rather than leaving a line nobody can read. */
  const editItem = (id: string, change: Partial<ItemFields>): void => {
    if (!may('editInventory', holderOf(id))) return
    const clean: Partial<ItemFields> = {}
    if (change.name !== undefined && change.name.trim()) clean.name = change.name.trim()
    if (change.quantity !== undefined) clean.quantity = clampQuantity(change.quantity)
    if (change.notes !== undefined) clean.notes = change.notes.trim()
    if (change.weight !== undefined) clean.weight = cleanWeight(change.weight)
    if (Object.keys(clean).length === 0) return
    items.value = items.value.map((one) => (one.id === id ? { ...one, ...clean } : one))
  }

  const removeItem = (id: string): void => {
    if (!may('editInventory', holderOf(id))) return
    const remaining = items.value.filter((one) => one.id !== id)
    if (remaining.length !== items.value.length) items.value = remaining
  }

  /**
   * Who an entity can hand things to this turn: the carrier it rides in, or
   * whoever rides in it. Nobody reaches into a caravan from the next hex.
   */
  const inventoryPartners = (id: string): readonly Entity[] => {
    if (!keepsInventory(id)) return []
    const carrier = carrierOf(id)
    const partners = carrier ? entities.value.filter((one) => one.id === carrier) : ridersOf(id)
    return partners.filter((one) => carriesInventory(one.kind))
  }

  const transferItem = (id: string, toId: string, quantity: number): void => {
    const giver = holderOf(id)
    const taker = entityOf(toId)
    if (!may('transferItem', giver && taker && { from: giver, to: taker })) return
    const from = items.value.find((one) => one.id === id)
    if (!from || !inventoryPartners(from.ownerId).some((one) => one.id === toId)) return
    items.value = moveItem(items.value, id, toId, quantity)
  }

  /** What a caravan's wagons hold on the turn the crawl stands on. */
  const suppliesOf = (id: string): Supplies => suppliesAt(supplies.value, id, turn.value)

  /**
   * The DM's word on a caravan's stores from this turn on. Nothing is eaten or
   * spent by the clock; a rewind reads back whatever was set for that turn.
   */
  const setSupply = (id: string, supply: Supply, value: number): void => {
    if (!may('supplies')) return
    const kind = entities.value.find((one) => one.id === id)?.kind
    if (!kind || !carriesSupplies(kind)) return
    supplies.value = editSupply(supplies.value, id, turn.value, supply, value)
  }

  const editCatalogEntry = (id: string, patch: CatalogPatch): void => {
    if (!may('merchants')) return
    catalogOverrides.value = editOverride(catalogOverrides.value, id, patch)
  }

  const removeCatalogEntry = (id: string): void => {
    if (!may('merchants')) return
    catalogOverrides.value = removeOverride(catalogOverrides.value, id)
  }

  const resetCatalogEntry = (id: string): void => {
    if (!may('merchants')) return
    catalogOverrides.value = resetOverride(catalogOverrides.value, id)
  }

  const addCatalogEntry = (merchant: MerchantType, fields?: CatalogPatch): CatalogEntry | null => {
    if (!may('merchants')) return null
    const entry = customEntry(merchant, fields)
    catalogOverrides.value = [...catalogOverrides.value, { id: entry.id, op: 'add', entry }]
    return entry
  }

  const resourcesOn = (hex: HexKey): readonly Resource[] => resourcesByHex.value.get(hex) ?? []

  const addResource = (
    hex: HexKey,
    type: ResourceType,
    origin: ResourceOrigin = 'manual',
  ): string | null => {
    if (!may('resources')) return null
    const id = crypto.randomUUID()
    resources.value = [...resources.value, { id, hex, type, origin }]
    return id
  }

  const removeResource = (id: string): void => {
    if (!may('resources')) return
    if (!resources.value.some((one) => one.id === id)) return
    resources.value = resources.value.filter((one) => one.id !== id)
  }

  /** Lays the generated resources down afresh, around the ones placed by hand. */
  const generateResources = (seed = Math.floor(Math.random() * MAX_SEED)): void => {
    if (!may('resources')) return
    const manual = resources.value.filter((one) => one.origin === 'manual')
    const made = scatterResources(field.value, {
      chances: resourceChances.value,
      spacing: resourceSpacing.value,
      seed,
      existing: manual,
    })
    resources.value = [...manual, ...made]
  }

  const setResourceChance = (terrainId: TerrainId, chance: number): void => {
    if (!may('resources') || !Number.isFinite(chance)) return
    resourceChances.value = {
      ...resourceChances.value,
      [terrainId]: Math.max(0, Math.min(1, chance)),
    }
  }

  const setResourceSpacing = (hexes: number): void => {
    if (!may('resources') || !Number.isFinite(hexes)) return
    resourceSpacing.value = Math.max(
      RESOURCE_SPACING_LIMITS.min,
      Math.min(RESOURCE_SPACING_LIMITS.max, Math.round(hexes)),
    )
  }

  const encounterTable = (terrainId: TerrainId, phase: Phase): EncounterEntry[] =>
    tableFor(terrainId, phase, encounters.value)

  /** Reads the ground as painted and the hour as it stands now. */
  const rollEncounterOn = (
    hex: HexKey,
    random: () => number = Math.random,
  ): EncounterRoll | null => {
    if (!may('encounters')) return null
    const under = tileAt(hex)
    return under ? rollFor(under.terrain, clock.value.phase, encounters.value, random) : null
  }

  const acceptEncounter = (hex: HexKey, entry: EncounterEntry): string | null =>
    may('encounters')
      ? addEvent(hex, { title: entry.title, description: entry.description, turn: turn.value })
      : null

  const setOverrides = (next: EncounterOverride[]): void => {
    const now = encounterOverrides.value
    if (next.length !== now.length || next.some((one, at) => one !== now[at])) {
      encounterOverrides.value = next
    }
  }

  const setEncounter = (id: string, change: EncounterChange): void => {
    if (!may('encounters')) return
    if (change.weight !== undefined && !(Number.isFinite(change.weight) && change.weight >= 0)) {
      return
    }
    setOverrides(changeEncounter(DEFAULT_ENCOUNTERS, encounterOverrides.value, id, change))
  }

  const removeEncounter = (id: string): void => {
    if (!may('encounters')) return
    setOverrides(dropEncounter(DEFAULT_ENCOUNTERS, encounterOverrides.value, id))
  }

  const restoreEncounter = (id: string): void => {
    if (!may('encounters')) return
    setOverrides(undoEncounterOverride(encounterOverrides.value, id))
  }

  const addEncounter = (entry: Omit<EncounterEntry, 'id'>): string | null => {
    if (!may('encounters')) return null
    const id = crypto.randomUUID()
    encounterOverrides.value = [
      ...encounterOverrides.value,
      { kind: 'add', entry: { ...entry, id, weight: Math.max(0, entry.weight) } },
    ]
    return id
  }

  const resetEncounters = (terrainId: TerrainId): void => {
    if (!may('encounters')) return
    setOverrides(resetTerrain(DEFAULT_ENCOUNTERS, encounterOverrides.value, terrainId))
  }

  /**
   * A recorded future the entities turned away from never happened: giving an
   * order or putting somebody down after a rewind cuts the record off here,
   * and the encounters met further on go with it.
   */
  const truncate = (): void => {
    if (frames.value.length > turn.value) setFrames(frames.value.slice(0, turn.value))
    events.value = encountersUpTo(events.value, turn.value)
    supplies.value = cutSupplies(supplies.value, turn.value)
  }

  const queueAction = (id: string, action: Action): void => {
    if (!may('order', entityOf(id))) return
    truncate()
    const next = new Map(queue.value)
    next.set(id, action)
    queue.value = next
  }

  /**
   * Puts an entity on the map at the turn the crawl stands on, but only on
   * ground its kind could stand on: no ship on land, nobody afloat on open sea.
   */
  const place = (id: string, hex: HexKey): void => {
    if (!may('place', entityOf(id))) return
    // A player sets their token down once; after that it goes where it is ordered.
    if ((actingFor ?? viewer.value).role !== 'dm' && stateOf(id).at) return
    const kind = entities.value.find((one) => one.id === id)?.kind ?? 'party'
    const under = tileAt(hex)
    if (under && !canEnter(under, KIND_MOVEMENT[kind])) return
    truncate()
    const next = new Map(origins.value)
    next.set(id, { turn: turn.value, hex })
    origins.value = next
  }

  /** Water hexes a carrier stands in this turn: where someone ashore can step aboard. */
  const harbours = computed<ReadonlySet<HexKey>>(() => {
    const moored = new Set<HexKey>()
    for (const one of entities.value) {
      const at = stateOf(one.id).at
      const under = at ? tileAt(at) : undefined
      if (at && under && isCarrier(one.kind) && isWater(under)) moored.add(at)
    }
    return moored
  })

  // Whoever does the walking decides what ground the route may cross.
  const legsFrom = (walker: string, from: HexKey, waypoints: readonly HexKey[]): Route[] | null => {
    const kind = entities.value.find((one) => one.id === walker)?.kind ?? 'party'
    return chainRoute(field.value, parseKey(from), waypoints.map(parseKey), {
      movement: KIND_MOVEMENT[kind],
      roads: roads.value,
      rivers: rivers.value,
      harbours: isCarrier(kind) ? undefined : harbours.value,
    })
  }

  /** The stops an entity is headed through: the queued order's, or the standing one's. */
  const waypointsFor = (id: string): readonly HexKey[] => {
    const queued = queue.value.get(id)
    if (queued) return queued.kind === 'move' ? queued.waypoints : []
    return stateOf(id).waypoints
  }

  /**
   * Whose route an entity is actually walking. A rider chooses none of its own
   * ground, so its panel and its line on the map read the caravan's; an order
   * of its own is how it climbs out, and from the moment one is given the route
   * drawn is the one it will walk away on.
   */
  const routeOwner = (id: string): string => (queue.value.has(id) ? id : (carrierOf(id) ?? id))

  const shownWaypoints = (id: string): readonly HexKey[] => waypointsFor(routeOwner(id))

  /**
   * Orders an entity through a chain of stops from where it stands. No stops at
   * all is a route of just the hex underneath, which is how an order is called
   * off without a second kind of action. A chain with a leg nobody can walk is
   * refused whole and the order already standing is left alone. A rider at
   * sea takes no order at all: there is nowhere to step off to.
   */
  const orderChain = (id: string, waypoints: readonly HexKey[]): void => {
    const at = stateOf(id).at
    if (!at || atSea(id)) return
    const legs = legsFrom(id, at, waypoints)
    if (!legs) return
    const route = joinLegs(parseKey(at), legs).hexes.map(hexKey)
    queueAction(id, { kind: 'move', route, waypoints: [...waypoints] })
  }

  /**
   * One click, one order. The first puts the entity on the map; after that a
   * click plans the route it will walk as the turns pass, a shift-click adds a
   * stop to the end of it, and clicking the ground it stands on calls it off.
   */
  const select = (hex: Axial | null, append = false): void => {
    if (!hex || !selectedEntity.value) return
    const id = selectedId.value
    const key = hexKey(hex)
    const at = selectedState.value.at
    if (!may(at ? 'order' : 'place', selectedEntity.value)) return

    if (!at) {
      place(id, key)
      return
    }

    if (!append) {
      orderChain(id, key === at ? [] : [key])
      return
    }

    const stops = waypointsFor(id)
    if (key !== (stops[stops.length - 1] ?? at)) orderChain(id, [...stops, key])
  }

  /** Takes back the order given this turn, leaving whatever stood before it. */
  const dropQueued = (id: string): void => {
    const next = new Map(queue.value)
    next.delete(id)
    queue.value = next
  }

  /**
   * What each DM tool does to the hexes under the brush. A tool with no entry
   * here does nothing yet.
   */
  const toolHandlers: { [T in Exclude<DmTool, 'select'>]?: (hexes: readonly HexKey[]) => void } = {}

  /** Whether the fog brush reveals ground to the players or hides it; view state, never saved. */
  const fogMode = ref<FogMode>('reveal')

  const setRevealed = (on: boolean): void => {
    if (!may('fog')) return
    revealed.value = on
  }

  const setFogMode = (mode: FogMode): void => {
    if (!may('fog')) return
    fogMode.value = mode
  }

  toolHandlers.fog = (hexes) => {
    fogEdits.value = editFog(fogEdits.value, hexes, fogMode.value)
  }

  /**
   * The first tap starts a road, each tap after carries it on to the hex tapped
   * along the cheapest land route there, so a road never fords the sea, and
   * tapping the hex it reached last ends it. Erasing tears up the road touching
   * the hex tapped.
   */
  const roadTap = (hex: HexKey): void => {
    if (roadErase.value) {
      roads.value = withoutRoadAt(roads.value, parseKey(hex))
      return
    }
    const tail = roadTail.value
    if (tail === hex) {
      roadTail.value = null
      return
    }
    const under = tileAt(hex)
    if (!under || !canEnter(under, 'land')) return
    if (tail === null) {
      roadTail.value = hex
      return
    }
    const path = findRoute(field.value, parseKey(tail), parseKey(hex), { roads: roads.value })
    if (!path) return
    roads.value = withRoad(roads.value, path.hexes)
    roadTail.value = hex
  }

  toolHandlers.road = (hexes) => {
    if (hexes[0]) roadTap(hexes[0])
  }

  const finishRoad = (): void => {
    if (!may('roads')) return
    roadTail.value = null
  }

  const setRoadErase = (on: boolean): void => {
    if (!may('roads')) return
    roadErase.value = on
    roadTail.value = null
  }

  /**
   * Drawn like a road, but straight from hex to hex rather than along the
   * cheapest route, since a river goes where the DM says, sea and all.
   */
  const riverTap = (hex: HexKey): void => {
    if (roadErase.value) {
      rivers.value = withoutRoadAt(rivers.value, parseKey(hex))
      return
    }
    const tail = roadTail.value
    if (tail === hex) {
      roadTail.value = null
      return
    }
    if (tail !== null) rivers.value = withRoad(rivers.value, line(parseKey(tail), parseKey(hex)))
    roadTail.value = hex
  }

  toolHandlers.river = (hexes) => {
    if (hexes[0]) riverTap(hexes[0])
  }

  /** What the paint brush lays down. View state, never saved. */
  const paintTerrain = ref<TerrainId>('grass')

  const setPaintTerrain = (terrainId: TerrainId): void => {
    if (!may('terrain')) return
    paintTerrain.value = terrainId
  }

  // Ground painted back to what the seed made is no longer an override, so the
  // brush can wipe its own work out as well as lay it down.
  toolHandlers.paint = (hexes) => {
    const next = new Map(terrainOverrides.value)
    let changed = false
    for (const hex of hexes) {
      const made = ground.value.at(parseKey(hex))?.terrain
      if (made === undefined || next.get(hex) === paintTerrain.value) continue
      if (made === paintTerrain.value) {
        changed = next.delete(hex) || changed
      } else {
        next.set(hex, paintTerrain.value)
        changed = true
      }
    }
    if (changed) terrainOverrides.value = next
  }

  /**
   * A click on the map: the DM picks a hex to look at or works it with a tool, a
   * player gives an order.
   * Clicking the picked hex again, or the goal of the order just given, takes
   * the pick back. Which of the two follows who is acting rather than the view
   * alone, so a player's click never reaches the DM's tools.
   */
  const click = (hex: Axial | null, append = false): void => {
    const key = hex ? hexKey(hex) : null
    if (may('mapTools')) {
      const tool = dmTool.value
      if (tool !== 'select') {
        if (hex) toolHandlers[tool]?.(brushHexes(hex))
        return
      }
      // With a token picked from the list the DM's clicks are its orders;
      // with none they look the ground over.
      if (!entities.value.some((one) => one.id === selectedId.value)) {
        selectHex(key === selectedHex.value ? null : hex)
        return
      }
    }
    if (!may('order', selectedEntity.value ?? undefined)) return
    const id = selectedId.value
    const queued = queue.value.get(id)
    // Against the last stop rather than the route's end, so a second click on
    // the ground the entity stands on still calls its order off.
    if (
      !append &&
      queued?.kind === 'move' &&
      key === queued.waypoints[queued.waypoints.length - 1]
    ) {
      dropQueued(id)
      return
    }
    select(hex, append)
  }

  /** Whether a drag works the map with the tool in hand rather than panning it. */
  const brushing = computed(() => dmView.value && BRUSH_TOOLS.has(dmTool.value))

  // The hex the stroke reached last, or null off the map; the move after it is
  // filled in along the line between, so a fast drag skips nothing it crossed.
  let strokeAt: Axial | null = null
  let stroking = false

  const continueStroke = (hex: Axial | null): void => {
    if (!stroking || !may('mapTools')) return
    const from = strokeAt
    strokeAt = hex
    if (!hex || (from && hexKey(from) === hexKey(hex))) return
    const tool = dmTool.value
    if (tool === 'select') return
    const crossed = from ? line(from, hex).slice(1) : [hex]
    toolHandlers[tool]?.([...new Set(crossed.flatMap(brushHexes))])
  }

  /** A drag with a brush in hand: everything it works until it ends undoes as one. */
  const startStroke = (hex: Axial | null): void => {
    if (stroking || !brushing.value || !may('mapTools')) return
    history.begin()
    stroking = true
    strokeAt = null
    continueStroke(hex)
  }

  const endStroke = (): void => {
    if (!stroking || !may('mapTools')) return
    stroking = false
    strokeAt = null
    history.end()
  }

  const removeWaypoint = (index: number): void => {
    if (!may('order', selectedEntity.value ?? undefined)) return
    const id = selectedId.value
    orderChain(
      id,
      waypointsFor(id).filter((_, at) => at !== index),
    )
  }

  const clear = (): void => {
    if (may('order', selectedEntity.value ?? undefined)) orderChain(selectedId.value, [])
  }

  /** Spends a turn: every entity resolves, ordered or not, and is written down. */
  const advanceTurn = (): void => {
    if (!may('clock')) return
    truncate()
    const outcome = resolveTurn(
      turn.value,
      field.value,
      entities.value,
      states.value,
      queue.value,
      roads.value,
      rivers.value,
    )
    setFrames([...frames.value, { records: outcome.records, states: outcome.states }])
    queue.value = new Map()
    turn.value += 1
    history.clear()
  }

  /** Winds the world back a turn; the record it is read out of is left alone. */
  const rewindTurn = (): void => {
    if (!may('clock') || turn.value === 0) return
    turn.value -= 1
    queue.value = new Map()
    history.clear()
  }

  const goToTurn = (at: number): void => {
    if (!may('clock')) return
    turn.value = Math.max(0, Math.min(frames.value.length, Math.floor(at)))
    queue.value = new Map()
    history.clear()
  }

  /** Camps out the rest of the phase: standing orders keep being walked. */
  const skipPhase = (): void => {
    if (!may('clock')) return
    const until = nextPhaseTurn(turn.value)
    while (turn.value < until) advanceTurn()
  }

  const canRewind = computed(() => turn.value > 0)

  /**
   * Wipes the crawl: every record, every order and everybody's place on the map
   * go, and the clock starts again at the first turn of the first day. The
   * world under it is left standing, and so are the events the DM wrote by hand;
   * the encounters met were part of the crawl.
   */
  const clearHistory = (): void => {
    if (!may('clearHistory')) return
    turn.value = 0
    setFrames([])
    events.value = encountersUpTo(events.value, -1)
    origins.value = new Map()
    queue.value = new Map()
    supplies.value = new Map()
    history.clear()
  }

  /** The order an entity is about to walk: the queued one, or the standing one. */
  const orderFor = (id: string): readonly HexKey[] => {
    const owner = routeOwner(id)
    const queued = queue.value.get(owner)
    if (queued?.kind === 'move') {
      const at = stateOf(owner).at
      return queued.route[0] === at ? queued.route.slice(1) : queued.route
    }
    if (queued) return []
    return stateOf(owner).pending
  }

  /** What the selected entity has left to walk, drawn ahead of it as arrows. */
  const plannedHexes = computed<Axial[]>(() => orderFor(selectedId.value).map(parseKey))

  const goal = computed<HexKey | null>(() => {
    const planned = orderFor(selectedId.value)
    return planned.length > 0 ? planned[planned.length - 1] : null
  })

  /** The selected entity's order, leg by leg, from where it stands now. */
  const chain = computed<Route[]>(() => {
    const at = selectedState.value.at
    return at
      ? (legsFrom(routeOwner(selectedId.value), at, shownWaypoints(selectedId.value)) ?? [])
      : []
  })

  /** Whoever is doing the walking: a rider is carried at the caravan's pace. */
  const routeEntity = computed<Entity | null>(() => {
    const owner = routeOwner(selectedId.value)
    return entities.value.find((one) => one.id === owner) ?? selectedEntity.value
  })

  const turnsFor = (km: number): number => {
    const pace = routeEntity.value?.pacePerTurn ?? 1
    return Math.ceil(km / KM_PER_HEX / pace)
  }

  const routeBySea = computed(
    () => routeEntity.value !== null && KIND_MOVEMENT[routeEntity.value.kind] === 'sea',
  )

  const legs = computed<Leg[]>(() => {
    const stops = shownWaypoints(selectedId.value)
    return chain.value.map((leg, index) => ({
      to: stops[index],
      steps: leg.steps,
      km: leg.km,
      turns: turnsFor(leg.km),
      landfall: routeBySea.value && offshore(stops[index]),
    }))
  })

  /** How far the planned order still has to go, every leg together. */
  const route = computed<Route | null>(() => {
    const at = selectedState.value.at
    if (!at || chain.value.length === 0) return null
    return joinLegs(parseKey(at), chain.value)
  })

  const routeTurns = computed(() => (route.value ? turnsFor(route.value.km) : 0))

  /** The selected entity's stops still ahead, marked on the map in its colour. */
  const stops = computed<{ hexes: Axial[]; color: string }>(() => ({
    hexes: shownWaypoints(selectedId.value).map(parseKey),
    color: routeEntity.value?.color ?? '#ffffff',
  }))

  const recordsFor = (id: string, upTo: number): ActionRecord[] => {
    const rows: ActionRecord[] = []
    for (let at = 0; at < Math.min(upTo, frames.value.length); at++) {
      for (const record of frames.value[at].records) if (record.entityId === id) rows.push(record)
    }
    return rows
  }

  /**
   * The selected entity's whole record, including turns the crawl has been
   * wound back past: the log is what happened, not what has happened yet, and
   * a row past the current turn is the way back to it.
   */
  const journey = computed<JourneyRow[]>(() =>
    recordsFor(selectedId.value, frames.value.length).map((record) => ({
      turn: record.turn,
      hex: record.to ?? record.from ?? ('0,0' as HexKey),
      terrain: tileAt(record.to ?? ('0,0' as HexKey))?.terrain ?? 'grass',
      kind: record.kind,
      entered: record.entered.length,
      spent: record.turn < turn.value,
    })),
  )

  /** The journey with the encounters met along it, kept like the turns over a rewind. */
  const adventureLog = computed<LogEntry<JourneyRow>[]>(() =>
    interleave(journey.value, encountersMet(events.value)),
  )

  const hexesWalked = computed(() =>
    recordsFor(selectedId.value, turn.value).reduce((total, row) => total + row.entered.length, 0),
  )

  const travelledKm = computed(() => hexesWalked.value * KM_PER_HEX)

  /** Everyone the current view is allowed to see drawn on the map. */
  const shownEntities = computed<readonly Entity[]>(() =>
    entities.value.filter((one) => dmView.value || !one.hidden),
  )

  /** Where each of them stands right now: one token apiece, all at once. */
  const tokens = computed(() =>
    shownEntities.value.map((one) => ({
      id: one.id,
      hex: stateOf(one.id).at,
      color: one.color,
      shape: TOKEN_SHAPES[one.kind],
      inside: carrierOf(one.id),
    })),
  )

  /** Where everybody stood, and who they rode with, at the opening of a turn. */
  const positionsAt = (
    at: number,
  ): ReadonlyMap<string, { hex: HexKey | null; inside: string | null }> =>
    new Map([...statesAt(at)].map(([id, state]) => [id, { hex: state.at, inside: aboard(state) }]))

  /** What every entity did on a turn already spent. */
  const recordsOn = (at: number): readonly ActionRecord[] => frames.value[at]?.records ?? []

  const hoveredTile = computed<TerrainTile | null>(() =>
    hovered.value ? (tileAt(hovered.value) ?? null) : null,
  )

  /** Everything within reach of the selected entity, split by what hides it. */
  const sightField = computed<PartySight>(() =>
    start.value ? sightFrom(field.value, parseKey(start.value), vision.value) : NOTHING_IN_SIGHT,
  )

  const visible = computed<ReadonlySet<HexKey>>(() => sightField.value.visible)

  /** Within reach but behind something; the shadows the sight overlay draws. */
  const blocked = computed<ReadonlySet<HexKey>>(() => sightField.value.blocked)

  const reach = computed(() => sightField.value.radius)

  /**
   * Ground the crawl can account for having seen, read out of the record rather
   * than piled up as it goes: every hex every entity stood on up to this turn,
   * seen with the sight it had at the time. Winding the clock back therefore
   * takes the map back with it, and the fog closes behind the party.
   */
  // What can be seen from a hex at a radius never changes while the world does
  // not, and a crawl looks out from the same few hundred hexes over and over.
  const sightMemo = new Map<string, readonly HexKey[]>()
  let memoField: TerrainField | null = null

  const seenFrom = (hex: HexKey, radius: number): readonly HexKey[] => {
    if (memoField !== field.value) {
      sightMemo.clear()
      memoField = field.value
    }

    const key = `${hex}:${radius}`
    const known = sightMemo.get(key)
    if (known) return known

    const made = [...sightFrom(field.value, parseKey(hex), { radius }).visible]
    sightMemo.set(key, made)
    return made
  }

  /** Everything the crawl laid eyes on during one turn already spent. */
  const seenOn = (at: number, into: Set<HexKey>): void => {
    for (const entity of entities.value) {
      if (entity.hidden && !dmView.value) continue

      const state = statesAt(at).get(entity.id)
      if (!state?.at) continue

      const radius = sightAt(entity, at)
      for (const key of seenFrom(state.at, radius)) into.add(key)

      // The hexes crossed on the way through, so an entity that walked three
      // hexes in one turn does not leave two of them unseen behind it.
      const record = frames.value[at]?.records.find((row) => row.entityId === entity.id)
      for (const crossed of record?.entered ?? []) {
        for (const key of seenFrom(crossed, radius)) into.add(key)
      }
    }
  }

  /**
   * The last answer, kept so the common move — one more turn — only has to look
   * at the turn that was just spent. Anything else about the crawl changing
   * invalidates it through the signature, and the set is built again.
   */
  let rolling: {
    signature: string
    field: TerrainField
    turn: number
    seen: Set<HexKey>
  } | null = null
  let exploredVersion = 0

  const NOTHING_GAINED: ReadonlySet<HexKey> = new Set()

  /**
   * The explored set, with the ground that came to light since the last answer
   * handed out beside it: the fog draws that difference rather than the whole
   * set, and a step over a wide view should cost what the party saw, not what
   * the window holds.
   */
  const exploredState = computed<ExploredState>(() => {
    const signature = [
      recordVersion.value,
      dmView.value,
      field.value.radius,
      entities.value.map((one) => `${one.id}:${one.sight}:${one.hidden}`).join(','),
    ].join('|')

    exploredVersion += 1
    const carried =
      rolling && rolling.signature === signature && rolling.field === field.value ? rolling : null
    if (carried && carried.turn === turn.value) {
      return { seen: carried.seen, added: NOTHING_GAINED, version: exploredVersion }
    }

    // Turns only ever arrive one at a time going forward, so the usual case is
    // adding the turn just spent to what was already worked out.
    const stepped = carried && carried.turn < turn.value ? carried : null
    const fresh = new Set<HexKey>()
    for (let at = stepped ? stepped.turn + 1 : 0; at <= turn.value; at++) seenOn(at, fresh)

    // Anything else — a rewind, a different record, another world — is a set
    // that has to be built again, and there is no difference worth drawing.
    if (!stepped) {
      rolling = { signature, field: field.value, turn: turn.value, seen: fresh }
      return { seen: fresh, added: null, version: exploredVersion }
    }

    const seen = new Set(stepped.seen)
    const added = new Set<HexKey>()
    for (const key of fresh) {
      if (seen.has(key)) continue
      seen.add(key)
      added.add(key)
    }

    rolling = { signature, field: field.value, turn: turn.value, seen }
    return { seen, added, version: exploredVersion }
  })

  const explored = computed<ReadonlySet<HexKey>>(() => exploredState.value.seen)

  const knowledge = createKnowledge()

  /** What the players know: the explored set with the DM's fog edits laid over it. */
  const knownState = computed<Knowledge>(() => knowledge(exploredState.value, fogEdits.value))
  const known = computed<ReadonlySet<HexKey>>(() => knownState.value.seen)

  /** Ground the parties have seen, less what the DM has since hidden. */
  const exploredCount = computed(() => withoutHidden(explored.value, fogEdits.value.hidden).size)

  /**
   * Whether the map is drawn fogged. The fog switch is the DM's own; players
   * always see the fog unless the DM has revealed the whole map to them.
   */
  const fogShown = computed(() => (dmView.value ? fog.value : !revealed.value))

  /** Whether the fog is drawn as a wash over the ground rather than burying it. */
  const seeThrough = computed(() => dmView.value && fog.value && fogSeeThrough.value)

  /** What the fog leaves clear around the parties: their sight, less what the DM hid. */
  const visibleToPlayers = computed<ReadonlySet<HexKey>>(() =>
    withoutHidden(visible.value, fogEdits.value.hidden),
  )

  /**
   * What the map draws resources, places, roads and rivers against. It is the
   * known set rather than the explored one, so a hex the DM has hidden keeps
   * its road and river off the players' map along with everything else on it.
   */
  const drawnView = computed<ResourceView>(() => ({
    dmView: dmView.value,
    fog: fogShown.value && !seeThrough.value,
    explored: known.value,
  }))

  /** Where one entity has been up to this turn, in the order it went. */
  const trailOf = (id: string): Axial[] => {
    const walked: Axial[] = []
    const origin = origins.value.get(id)
    if (origin && origin.turn <= turn.value) walked.push(parseKey(origin.hex))

    for (const record of recordsFor(id, turn.value)) {
      for (const crossed of record.entered) walked.push(parseKey(crossed))
    }
    return walked
  }

  /** One entity's line on the map: its history or its hex, then its orders. */
  const pathFor = (id: string): Axial[] => {
    const ahead = orderFor(id).map(parseKey)
    if (showHistory.value) return [...trailOf(id), ...ahead]

    const at = stateOf(id).at
    return at ? [parseKey(at), ...ahead] : ahead
  }

  /** What the map draws as the party's trail: where it has been, in order. */
  const pathHexes = computed<Axial[]>(() => pathFor(selectedId.value))

  /**
   * Every line the map draws. On its own the selected entity's, so the arrows
   * say where the orders being given will take it; with all paths shown, one
   * line per entity, so a caravan two days behind is still a line on the map.
   */
  const paths = computed<EntityPath[]>(() => {
    const drawn = showAllPaths.value
      ? shownEntities.value
      : shownEntities.value.filter((one) => one.id === selectedId.value)

    return drawn.map((one) => ({ id: one.id, color: one.color, hexes: pathFor(one.id) }))
  })

  const sameTerrain = (a: TerrainControls, b: TerrainControls): boolean =>
    a.seed === b.seed && a.scale === b.scale && a.seaLevel === b.seaLevel && a.relief === b.relief

  const setTerrain = (change: Partial<TerrainControls>): void => {
    if (!may('terrain')) return
    const merged = { ...terrain.value, ...change }
    const next: TerrainControls = {
      seed: Math.round(merged.seed),
      scale: clamp(merged.scale, TERRAIN_LIMITS.scale),
      seaLevel: clamp(merged.seaLevel, TERRAIN_LIMITS.seaLevel),
      relief: clamp(merged.relief, TERRAIN_LIMITS.relief),
    }

    // A slider dragged back to where it started is not a new world: without
    // this the map would regenerate, and forget itself, over an identical seed.
    if (sameTerrain(next, terrain.value)) return
    terrain.value = next
  }

  const setWorldRadius = (next: number): void => {
    if (!may('terrain')) return
    const radius = Math.max(10, Math.round(next))
    if (radius === worldRadius.value) return
    worldRadius.value = radius
  }

  const setWorldSize = (size: WorldSize): void => setWorldRadius(WORLD_SIZES[size])

  /** Which of the named sizes the world is at, if it is at one of them. */
  const worldSize = computed<WorldSize | null>(() => {
    const found = Object.entries(WORLD_SIZES).find(([, radius]) => radius === worldRadius.value)
    return found ? (found[0] as WorldSize) : null
  })

  const reseed = (): void => {
    if (!may('terrain')) return
    setTerrain({ seed: Math.floor(Math.random() * MAX_SEED) })
  }

  /** Everything a saved session is made of, ready for the persistence layer. */
  const snapshot = computed<MapSnapshot>(() => ({
    terrain: terrain.value,
    worldRadius: worldRadius.value,
    fog: fog.value,
    revealed: revealed.value,
    fogSeeThrough: fogSeeThrough.value,
    showSight: showSight.value,
    showHistory: showHistory.value,
    dmView: dmView.value,
    turn: turn.value,
    selectedId: selectedId.value,
    entities: entities.value,
    origins: [...origins.value].map(([entityId, origin]) => ({ entityId, ...origin })),
    record: frames.value.flatMap((frame) => frame.records),
    states: frames.value.flatMap((frame, at) =>
      [...frame.states].map(([entityId, state]) => ({ turn: at, entityId, ...state })),
    ),
    queue: [...queue.value].map(([entityId, action]) => ({ entityId, action })),
    notes: [...notes.value].map(([hex, text]) => ({ hex, text })),
    events: [...events.value].flatMap(([hex, list]) => list.map((one) => ({ hex, ...one }))),
    locations: [...locations.value].flatMap(([hex, list]) => list.map((one) => ({ hex, ...one }))),
    merchants: merchants.value,
    items: items.value,
    supplies: [...supplies.value].flatMap(([entityId, entries]) =>
      entries.map((entry) => ({ entityId, ...entry })),
    ),
    catalogOverrides: catalogOverrides.value,
    resources: resources.value,
    resourceChances: resourceChances.value,
    resourceSpacing: resourceSpacing.value,
    fogEdits: [
      ...[...fogEdits.value.revealed].map((hex) => ({ hex, revealed: true })),
      ...[...fogEdits.value.hidden].map((hex) => ({ hex, revealed: false })),
    ],
    encounterOverrides: encounterOverrides.value,
    roads: [...roads.value].map(roadEdge),
    rivers: [...rivers.value].map(riverEdge),
    terrainOverrides: [...terrainOverrides.value].map(([hex, terrainId]) => ({
      hex,
      terrain: terrainId,
    })),
  }))

  // Terrain goes in first: laying down a new world is what wipes the map, so
  // the remembered crawl has to be handed back after it, not before.
  const restore = (saved: MapSnapshot): void => {
    if (!may('maps')) return
    setWorldRadius(saved.worldRadius)
    setTerrain(saved.terrain)
    fog.value = saved.fog
    revealed.value = saved.revealed
    fogSeeThrough.value = saved.fogSeeThrough
    showSight.value = saved.showSight
    showHistory.value = saved.showHistory
    dmView.value = saved.dmView
    // Taken as saved, nobody included: an empty board is one the DM cleared, and
    // the opening party only belongs to a map that was never saved at all.
    entities.value = saved.entities.map((one) => ({ ...one }))
    selectedId.value =
      entities.value.find((one) => one.id === saved.selectedId)?.id ?? entities.value[0]?.id ?? ''
    origins.value = new Map(
      saved.origins.map(({ entityId, turn: at, hex }) => [entityId, { turn: at, hex }]),
    )

    const byTurn = new Map<number, TurnFrame>()
    const frameAt = (at: number): TurnFrame => {
      const found = byTurn.get(at) ?? { records: [], states: new Map<string, EntityState>() }
      byTurn.set(at, found)
      return found
    }

    for (const record of saved.record) {
      ;(frameAt(record.turn).records as ActionRecord[]).push(record)
    }
    for (const { turn: at, entityId, ...state } of saved.states) {
      ;(frameAt(at).states as Map<string, EntityState>).set(entityId, state)
    }

    setFrames(Array.from({ length: byTurn.size }, (_, at) => frameAt(at)))
    turn.value = Math.max(0, Math.min(frames.value.length, saved.turn))
    queue.value = new Map(saved.queue.map(({ entityId, action }) => [entityId, action]))

    notes.value = new Map(saved.notes.map(({ hex, text }) => [hex, text]))
    const grouped = <T>(rows: readonly ({ hex: HexKey } & T)[]): Map<HexKey, T[]> => {
      const byHex = new Map<HexKey, T[]>()
      for (const { hex, ...item } of rows) byHex.set(hex, [...(byHex.get(hex) ?? []), item as T])
      return byHex
    }
    events.value = grouped<HexEvent>(saved.events)
    locations.value = grouped<HexLocation>(saved.locations)
    merchants.value = saved.merchants.map((one) => ({ ...one }))
    items.value = saved.items.map((one) => ({ ...one }))
    const stores = new Map<string, SupplyEntry[]>()
    for (const { entityId, ...entry } of saved.supplies) {
      stores.set(entityId, [...(stores.get(entityId) ?? []), entry])
    }
    for (const entries of stores.values()) entries.sort((a, b) => a.turn - b.turn)
    supplies.value = stores
    catalogOverrides.value = saved.catalogOverrides.map((one) => ({ ...one }))
    resources.value = saved.resources.map((one) => ({ ...one }))
    resourceChances.value = { ...saved.resourceChances }
    resourceSpacing.value = saved.resourceSpacing
    fogEdits.value = {
      revealed: new Set(saved.fogEdits.filter((one) => one.revealed).map((one) => one.hex)),
      hidden: new Set(saved.fogEdits.filter((one) => !one.revealed).map((one) => one.hex)),
    }
    encounterOverrides.value = saved.encounterOverrides
    roads.value = new Set(saved.roads.map(({ a, b }) => roadKey(parseKey(a), parseKey(b))))
    roadTail.value = null
    rivers.value = new Set(saved.rivers.map(({ a, b }) => riverKey(parseKey(a), parseKey(b))))
    terrainOverrides.value = new Map(
      saved.terrainOverrides.map(({ hex, terrain: id }) => [hex, id]),
    )
    history.clear()
  }

  // A new world is a different place, so nothing the entities learned about the
  // last one still describes the ground under them. Flushed synchronously so a
  // restore can hand a remembered map back on the line after it sets the seed.
  watch(
    [terrain, worldRadius],
    () => {
      turn.value = 0
      setFrames([])
      origins.value = new Map()
      queue.value = new Map()
      supplies.value = new Map()
      selectedHex.value = null
      notes.value = new Map()
      events.value = new Map()
      locations.value = new Map()
      resources.value = []
      fogEdits.value = NO_FOG_EDITS
      roads.value = new Set()
      roadTail.value = null
      rivers.value = new Set()
      terrainOverrides.value = new Map()
      history.clear()
    },
    { flush: 'sync' },
  )

  watch(
    dmView,
    (dm) => {
      if (!dm) selectedHex.value = null
    },
    { flush: 'sync' },
  )

  // Changing tools, or leaving the DM's view, ends the road or river in hand.
  watch(
    [dmTool, dmView],
    () => {
      roadTail.value = null
    },
    { flush: 'sync' },
  )

  return {
    ground,
    field,
    setField,
    terrainOverrides,
    tileAt,
    shoreAt,
    hovered,
    entities,
    selectedId,
    selectedEntity,
    selectEntity,
    addEntity: history.track(addEntity),
    removeEntity: history.track(removeEntity),
    renameEntity: history.track(renameEntity),
    recolorEntity: history.track(recolorEntity, (id) => `color:${id}`),
    setPace: history.track(setPace, (id) => `pace:${id}`),
    setEntitySight: history.track(setEntitySight, (id) => `sight:${id}`),
    start,
    goal,
    partyHex,
    route,
    routeTurns,
    routeBySea,
    legs,
    stops,
    removeWaypoint: history.track(removeWaypoint),
    plannedHexes,
    pathHexes,
    paths,
    showAllPaths,
    clearHistory,
    hoveredTile,
    hoverFootprint,
    turn,
    clock,
    states,
    frames,
    queue,
    queueAction: history.track(queueAction),
    advanceTurn,
    rewindTurn,
    goToTurn,
    skipPhase,
    canRewind,
    journey,
    adventureLog,
    shownEntities,
    tokens,
    positionsAt,
    recordsOn,
    hexesWalked,
    travelledKm,
    terrain,
    setTerrain,
    reseed,
    worldRadius,
    worldSize,
    setWorldRadius,
    setWorldSize,
    fog,
    revealed,
    setRevealed: history.track(setRevealed),
    fogShown,
    fogSeeThrough,
    seeThrough,
    showSight,
    showHistory,
    dmView,
    viewer,
    may,
    actAs,
    sightAt,
    reach,
    visible,
    blocked,
    explored,
    exploredCount,
    known,
    knownState,
    visibleToPlayers,
    drawnView,
    fogEdits,
    fogMode,
    setFogMode,
    carrierOf,
    riders,
    ridersOf,
    shownCaravan,
    atSea,
    setTiles,
    setHovered,
    selectedHex,
    selectHex,
    dmTool,
    setDmTool,
    brushSize,
    setBrushSize,
    paintTerrain,
    setPaintTerrain,
    panelsOpen,
    setPanelOpen,
    place: history.track(place),
    select: history.track(select),
    click: history.track(click),
    brushing,
    startStroke,
    continueStroke,
    endStroke,
    clear: history.track(clear),
    snapshot,
    restore,
    notes,
    setNote: history.track(setNote, (hex) => `note:${hex}`),
    events,
    addEvent: history.track(addEvent),
    removeEvent: history.track(removeEvent),
    locations,
    addLocation: history.track(addLocation),
    removeLocation: history.track(removeLocation),
    merchants,
    merchantsOf,
    addMerchant: history.track(addMerchant),
    removeMerchant: history.track(removeMerchant),
    renameMerchant: history.track(renameMerchant, (id) => `merchant-name:${id}`),
    setMerchantLevel: history.track(setMerchantLevel, (id) => `merchant-level:${id}`),
    items,
    itemsOf,
    inventoryPartners,
    addItem: history.track(addItem),
    editItem: history.track(editItem, (id, change) => `item:${id}:${Object.keys(change).join()}`),
    removeItem: history.track(removeItem),
    transferItem: history.track(transferItem),
    supplies,
    suppliesOf,
    setSupply: history.track(setSupply, (id, supply) => `supply:${id}:${supply}`),
    catalogOverrides,
    catalog,
    editCatalogEntry: history.track(editCatalogEntry, (id) => `catalog:${id}`),
    removeCatalogEntry: history.track(removeCatalogEntry),
    addCatalogEntry: history.track(addCatalogEntry),
    resetCatalogEntry: history.track(resetCatalogEntry),
    resources,
    resourcesOn,
    addResource: history.track(addResource),
    removeResource: history.track(removeResource),
    generateResources: history.track(generateResources),
    resourceChances,
    setResourceChance: history.track(setResourceChance, (terrainId) => `chance:${terrainId}`),
    resourceSpacing,
    setResourceSpacing: history.track(setResourceSpacing, () => 'spacing'),
    encounterOverrides,
    encounters,
    encounterTable,
    rollEncounterOn,
    acceptEncounter: history.track(acceptEncounter),
    setEncounter: history.track(setEncounter, (id) => `encounter:${id}`),
    removeEncounter: history.track(removeEncounter),
    restoreEncounter: history.track(restoreEncounter),
    addEncounter: history.track(addEncounter),
    resetEncounters: history.track(resetEncounters),
    roads,
    roadTail,
    roadErase,
    finishRoad,
    setRoadErase,
    rivers,
    undo: (): boolean => may('undo') && history.undo(),
    redo: (): boolean => may('undo') && history.redo(),
    canUndo: history.canUndo,
    canRedo: history.canRedo,
  }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useHexMapStore, import.meta.hot))
}
