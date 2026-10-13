import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import type { Action, ActionRecord } from '../entities/action'
import {
  idleState,
  KIND_MOVEMENT,
  newEntity,
  type Entity,
  type EntityKind,
  type EntityState,
  type Owner,
} from '../entities/entity'
import {
  clampLevel,
  MERCHANT_INFO,
  newMerchant,
  type Merchant,
  type MerchantType,
} from '../entities/merchant'
import { resolveTurn } from '../entities/resolve'
import type { TokenShape } from '../engine/partyToken'
import type { HexEvent, HexLocation } from '../hex/content'
import { hexKey, parseKey, range, type Axial, type HexKey } from '../hex/coords'
import type { VisionOptions } from '../hex/vision'
import type { MapSnapshot } from '../persistence/mapState'
import { fieldFromTiles, type TerrainField } from '../terrain/field'
import { scatterResources } from '../terrain/resourceGen'
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
import { isWater, TERRAIN_DEFAULTS, type TerrainId, type TerrainTile } from '../terrain/terrain'
import { canEnter, chainRoute, joinLegs, KM_PER_HEX, type Route } from '../terrain/travel'
import { clockAt, isNight, nextPhaseTurn, type Clock } from '../time/clock'
import { createHistory, slotOf } from './history'

const NOTHING_IN_SIGHT: PartySight = { radius: 0, visible: new Set(), blocked: new Set() }

/** How each kind is carved on the board: whoever walks is a pawn. */
const TOKEN_SHAPES: Readonly<Record<EntityKind, TokenShape>> = {
  party: 'pawn',
  caravan: 'wagon',
  npc: 'pawn',
  ship: 'boat',
}

/** What the dark leaves of an entity's sight, and the least it can ever see. */
export const NIGHT_SIGHT = 0.3
export const MIN_NIGHT_SIGHT = 1

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
export type DmTool = 'select' | 'paint' | 'fog' | 'road'

export const DM_TOOLS: readonly DmTool[] = ['select', 'paint', 'fog', 'road']

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

const MAX_SEED = 1_000_000

export const MIN_SIGHT = 1
export const MAX_SIGHT = 10

/** What the sight slider reads with nobody on the map to ask. */
export const DEFAULT_SIGHT = 5

/** The world and entities panels on the left, the hex details on the right. */
export type SidePanel = 'world' | 'entities' | 'details'

export const useHexMapStore = defineStore('hexMap', () => {
  // The world is a function, not a stored map: only the ground near the view is
  // ever worked out, and everything that reads terrain asks the field for it.
  const field = shallowRef<TerrainField>(fieldFromTiles(new Map()))
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

  /** Every resource on the map, in the order they were placed. */
  const resources = shallowRef<readonly Resource[]>([])
  const resourceChances = shallowRef<ResourceChances>(defaultResourceChances())
  const resourceSpacing = ref(DEFAULT_RESOURCE_SPACING)

  const resourcesByHex = computed<ReadonlyMap<HexKey, readonly Resource[]>>(() => {
    const byHex = new Map<HexKey, Resource[]>()
    for (const one of resources.value) byHex.set(one.hex, [...(byHex.get(one.hex) ?? []), one])
    return byHex
  })

  const fog = ref(true)
  const showSight = ref(false)
  const showHistory = ref(false)
  const showAllPaths = ref(false)
  const dmView = ref(true)

  const worldRadius = ref<number>(WORLD_SIZES.large)

  const terrain = ref<TerrainControls>({
    seed: TERRAIN_DEFAULTS.seed,
    scale: TERRAIN_DEFAULTS.scale,
    seaLevel: TERRAIN_DEFAULTS.seaLevel,
    relief: TERRAIN_DEFAULTS.relief,
  })

  const clock = computed<Clock>(() => clockAt(turn.value))

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
    resources: slotOf(resources),
    resourceChances: slotOf(resourceChances),
    resourceSpacing: slotOf(resourceSpacing),
  })

  /**
   * Whoever the map is currently listening to, or nobody at all: a map can be
   * emptied of entities, and an empty map has no orders to give.
   */
  const selectedEntity = computed<Entity | null>(
    () => entities.value.find((one) => one.id === selectedId.value) ?? entities.value[0] ?? null,
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

  /** A rider whose carrier is out on open water, where there is nowhere to step off to. */
  const atSea = (id: string): boolean => {
    const at = stateOf(id).at
    const under = at ? tileAt(at) : undefined
    return carrierOf(id) !== null && under !== undefined && isWater(under)
  }

  /** Where the selected entity stands: what the map calls the party's hex. */
  const start = computed<HexKey | null>(() => selectedState.value.at)
  const partyHex = start

  const patch = (id: string, change: Partial<Entity>): void => {
    entities.value = entities.value.map((one) => (one.id === id ? { ...one, ...change } : one))
  }

  const selectEntity = (id: string): void => {
    if (entities.value.some((one) => one.id === id)) selectedId.value = id
  }

  const addEntity = (
    name?: string,
    kind: EntityKind = 'party',
    owner: Owner = 'player',
  ): Entity => {
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
  }

  const renameEntity = (id: string, name: string): void => {
    const trimmed = name.trim()
    if (trimmed) patch(id, { name: trimmed })
  }

  const clamp = (value: number, { min, max }: { min: number; max: number }): number =>
    Math.min(max, Math.max(min, value))

  const setPace = (id: string, pace: number): void => {
    patch(id, { pacePerTurn: clamp(pace, PACE_LIMITS) })
  }

  const setEntitySight = (id: string, sight: number): void => {
    patch(id, { sight: clamp(Math.round(sight), { min: MIN_SIGHT, max: MAX_SIGHT }) })
  }

  /** The selected entity's daylight sight, which the panel's slider turns. */
  const sight = computed(() => selectedEntity.value?.sight ?? DEFAULT_SIGHT)
  const setSight = (next: number): void => setEntitySight(selectedId.value, next)

  /**
   * Dark does not slow anybody down, it blinds them: an entity keeps its pace
   * after nightfall and loses most of its horizon.
   */
  const sightAt = (entity: Entity, at: number): number =>
    isNight(at) ? Math.max(MIN_NIGHT_SIGHT, Math.round(entity.sight * NIGHT_SIGHT)) : entity.sight

  const vision = computed<VisionOptions>(() => {
    const one = selectedEntity.value
    return { radius: one ? sightAt(one, turn.value) : DEFAULT_SIGHT }
  })

  const setField = (next: TerrainField): void => {
    field.value = next
  }

  /** Fixtures and tests still speak in whole maps; the field wraps one. */
  const setTiles = (next: ReadonlyMap<HexKey, TerrainTile>): void => {
    field.value = fieldFromTiles(next)
  }

  const tileAt = (hex: HexKey): TerrainTile | undefined => field.value.at(parseKey(hex))

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
    dmTool.value = tool
  }

  const setBrushSize = (radius: number): void => {
    if (!Number.isFinite(radius)) return
    brushSize.value = Math.max(BRUSH_LIMITS.min, Math.min(BRUSH_LIMITS.max, Math.round(radius)))
  }

  const brushHexes = (center: Axial): HexKey[] =>
    (BRUSH_TOOLS.has(dmTool.value) ? range(center, brushSize.value) : [center])
      .filter((hex) => field.value.at(hex) !== undefined)
      .map(hexKey)

  /** Which side panels are expanded; view state, never saved. */
  const panelsOpen = ref<Record<SidePanel, boolean>>({ world: true, entities: true, details: true })

  // On a narrow window the panels share the same strip of screen, so only one
  // of them may be expanded at a time.
  const setPanelOpen = (which: SidePanel, open: boolean, narrow: boolean): void => {
    const closeOthers = open && narrow
    panelsOpen.value = {
      world: which === 'world' ? open : !closeOthers && panelsOpen.value.world,
      entities: which === 'entities' ? open : !closeOthers && panelsOpen.value.entities,
      details: which === 'details' ? open : !closeOthers && panelsOpen.value.details,
    }
  }

  const setNote = (hex: HexKey, text: string): void => {
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

  const addEvent = (hex: HexKey, event: Omit<HexEvent, 'id'>): string => {
    const id = crypto.randomUUID()
    events.value = appendTo(events.value, hex, { ...event, id })
    return id
  }

  const removeEvent = (hex: HexKey, id: string): void => {
    events.value = dropFrom(events.value, hex, id)
  }

  const addLocation = (hex: HexKey, location: Omit<HexLocation, 'id'>): string => {
    const id = crypto.randomUUID()
    locations.value = appendTo(locations.value, hex, { ...location, id })
    return id
  }

  const removeLocation = (hex: HexKey, id: string): void => {
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
    if (entities.value.find((one) => one.id === caravanId)?.kind !== 'caravan') return null
    const made = newMerchant(caravanId, name?.trim() || MERCHANT_INFO[type].label, type, level)
    merchants.value = [...merchants.value, made]
    return made
  }

  const removeMerchant = (id: string): void => {
    const remaining = merchants.value.filter((one) => one.id !== id)
    if (remaining.length !== merchants.value.length) merchants.value = remaining
  }

  const patchMerchant = (id: string, change: Partial<Merchant>): void => {
    merchants.value = merchants.value.map((one) => (one.id === id ? { ...one, ...change } : one))
  }

  const renameMerchant = (id: string, name: string): void => {
    const trimmed = name.trim()
    if (trimmed) patchMerchant(id, { name: trimmed })
  }

  const setMerchantLevel = (id: string, level: number): void => {
    patchMerchant(id, { level: clampLevel(level) })
  }

  const resourcesOn = (hex: HexKey): readonly Resource[] => resourcesByHex.value.get(hex) ?? []

  const addResource = (
    hex: HexKey,
    type: ResourceType,
    origin: ResourceOrigin = 'manual',
  ): string => {
    const id = crypto.randomUUID()
    resources.value = [...resources.value, { id, hex, type, origin }]
    return id
  }

  const removeResource = (id: string): void => {
    if (!resources.value.some((one) => one.id === id)) return
    resources.value = resources.value.filter((one) => one.id !== id)
  }

  /** Lays the generated resources down afresh, around the ones placed by hand. */
  const generateResources = (seed = Math.floor(Math.random() * MAX_SEED)): void => {
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
    if (!Number.isFinite(chance)) return
    resourceChances.value = {
      ...resourceChances.value,
      [terrainId]: Math.max(0, Math.min(1, chance)),
    }
  }

  const setResourceSpacing = (hexes: number): void => {
    if (!Number.isFinite(hexes)) return
    resourceSpacing.value = Math.max(
      RESOURCE_SPACING_LIMITS.min,
      Math.min(RESOURCE_SPACING_LIMITS.max, Math.round(hexes)),
    )
  }

  /**
   * A recorded future the entities turned away from never happened: giving an
   * order or putting somebody down after a rewind cuts the record off here.
   */
  const truncate = (): void => {
    if (frames.value.length > turn.value) setFrames(frames.value.slice(0, turn.value))
  }

  const queueAction = (id: string, action: Action): void => {
    truncate()
    const next = new Map(queue.value)
    next.set(id, action)
    queue.value = next
  }

  /**
   * Puts an entity on the map at the turn the crawl stands on, but only on
   * ground its kind could stand on: no ship inland, nobody afloat on open sea.
   */
  const place = (id: string, hex: HexKey): void => {
    const kind = entities.value.find((one) => one.id === id)?.kind ?? 'party'
    const under = tileAt(hex)
    if (under && !canEnter(field.value, under, KIND_MOVEMENT[kind])) return
    truncate()
    const next = new Map(origins.value)
    next.set(id, { turn: turn.value, hex })
    origins.value = next
  }

  // Whoever does the walking decides what ground the route may cross.
  const legsFrom = (walker: string, from: HexKey, waypoints: readonly HexKey[]): Route[] | null => {
    const kind = entities.value.find((one) => one.id === walker)?.kind ?? 'party'
    return chainRoute(field.value, parseKey(from), waypoints.map(parseKey), {
      movement: KIND_MOVEMENT[kind],
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

  /**
   * A click on the map: the DM picks a hex to look at or works it with a tool, a
   * player gives an order.
   * Clicking the picked hex again, or the goal of the order just given, takes
   * the pick back.
   */
  const click = (hex: Axial | null, append = false): void => {
    const key = hex ? hexKey(hex) : null
    if (dmView.value) {
      const tool = dmTool.value
      if (tool === 'select') selectHex(key === selectedHex.value ? null : hex)
      else if (hex) toolHandlers[tool]?.(brushHexes(hex))
      return
    }
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

  const removeWaypoint = (index: number): void => {
    const id = selectedId.value
    orderChain(
      id,
      waypointsFor(id).filter((_, at) => at !== index),
    )
  }

  const clear = (): void => orderChain(selectedId.value, [])

  /** Spends a turn: every entity resolves, ordered or not, and is written down. */
  const advanceTurn = (): void => {
    truncate()
    const outcome = resolveTurn(turn.value, field.value, entities.value, states.value, queue.value)
    setFrames([...frames.value, { records: outcome.records, states: outcome.states }])
    queue.value = new Map()
    turn.value += 1
    history.clear()
  }

  /** Winds the world back a turn; the record it is read out of is left alone. */
  const rewindTurn = (): void => {
    if (turn.value === 0) return
    turn.value -= 1
    queue.value = new Map()
    history.clear()
  }

  const goToTurn = (at: number): void => {
    turn.value = Math.max(0, Math.min(frames.value.length, Math.floor(at)))
    queue.value = new Map()
    history.clear()
  }

  /** Camps out the rest of the phase: standing orders keep being walked. */
  const skipPhase = (): void => {
    const until = nextPhaseTurn(turn.value)
    while (turn.value < until) advanceTurn()
  }

  const canRewind = computed(() => turn.value > 0)

  /**
   * Wipes the crawl: every record, every order and everybody's place on the map
   * go, and the clock starts again at the first turn of the first day. The
   * world under it is left standing.
   */
  const clearHistory = (): void => {
    turn.value = 0
    setFrames([])
    origins.value = new Map()
    queue.value = new Map()
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

  const legs = computed<Leg[]>(() => {
    const stops = shownWaypoints(selectedId.value)
    return chain.value.map((leg, index) => ({
      to: stops[index],
      steps: leg.steps,
      km: leg.km,
      turns: turnsFor(leg.km),
    }))
  })

  /** How far the planned order still has to go, every leg together. */
  const route = computed<Route | null>(() => {
    const at = selectedState.value.at
    if (!at || chain.value.length === 0) return null
    return joinLegs(parseKey(at), chain.value)
  })

  const routeTurns = computed(() => (route.value ? turnsFor(route.value.km) : 0))

  const routeBySea = computed(
    () => routeEntity.value !== null && KIND_MOVEMENT[routeEntity.value.kind] === 'sea',
  )

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
  let rolling: { signature: string; turn: number; seen: Set<HexKey> } | null = null
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
    const carried = rolling && rolling.signature === signature ? rolling : null
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
      rolling = { signature, turn: turn.value, seen: fresh }
      return { seen: fresh, added: null, version: exploredVersion }
    }

    const seen = new Set(stepped.seen)
    const added = new Set<HexKey>()
    for (const key of fresh) {
      if (seen.has(key)) continue
      seen.add(key)
      added.add(key)
    }

    rolling = { signature, turn: turn.value, seen }
    return { seen, added, version: exploredVersion }
  })

  const explored = computed<ReadonlySet<HexKey>>(() => exploredState.value.seen)

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
    setTerrain({ seed: Math.floor(Math.random() * MAX_SEED) })
  }

  /** Everything a saved session is made of, ready for the persistence layer. */
  const snapshot = computed<MapSnapshot>(() => ({
    terrain: terrain.value,
    worldRadius: worldRadius.value,
    fog: fog.value,
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
    resources: resources.value,
    resourceChances: resourceChances.value,
    resourceSpacing: resourceSpacing.value,
  }))

  // Terrain goes in first: laying down a new world is what wipes the map, so
  // the remembered crawl has to be handed back after it, not before.
  const restore = (saved: MapSnapshot): void => {
    setWorldRadius(saved.worldRadius)
    setTerrain(saved.terrain)
    fog.value = saved.fog
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
    resources.value = saved.resources.map((one) => ({ ...one }))
    resourceChances.value = { ...saved.resourceChances }
    resourceSpacing.value = saved.resourceSpacing
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
      selectedHex.value = null
      notes.value = new Map()
      events.value = new Map()
      locations.value = new Map()
      resources.value = []
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

  return {
    field,
    setField,
    tileAt,
    hovered,
    entities,
    selectedId,
    selectedEntity,
    selectEntity,
    addEntity: history.track(addEntity),
    removeEntity: history.track(removeEntity),
    renameEntity: history.track(renameEntity),
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
    showSight,
    showHistory,
    dmView,
    sight,
    setSight: history.track(setSight, () => `sight:${selectedId.value}`),
    sightAt,
    reach,
    visible,
    blocked,
    explored,
    exploredState,
    carrierOf,
    riders,
    ridersOf,
    atSea,
    setTiles,
    setHovered,
    selectedHex,
    selectHex,
    dmTool,
    setDmTool,
    brushSize,
    setBrushSize,
    panelsOpen,
    setPanelOpen,
    select: history.track(select),
    click: history.track(click),
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
    resources,
    resourcesOn,
    addResource: history.track(addResource),
    removeResource: history.track(removeResource),
    generateResources: history.track(generateResources),
    resourceChances,
    setResourceChance: history.track(setResourceChance, (terrainId) => `chance:${terrainId}`),
    resourceSpacing,
    setResourceSpacing: history.track(setResourceSpacing, () => 'spacing'),
    undo: history.undo,
    redo: history.redo,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
  }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useHexMapStore, import.meta.hot))
}
