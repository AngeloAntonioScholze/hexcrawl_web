import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import type { Action, ActionRecord } from '../entities/action'
import {
  idleState,
  newEntity,
  type Entity,
  type EntityKind,
  type EntityState,
  type Owner,
} from '../entities/entity'
import { resolveTurn } from '../entities/resolve'
import { hexKey, parseKey, type Axial, type HexKey } from '../hex/coords'
import type { VisionOptions } from '../hex/vision'
import type { MapSnapshot } from '../persistence/mapState'
import { fieldFromTiles, type TerrainField } from '../terrain/field'
import { sightFrom, type PartySight } from '../terrain/sight'
import { TERRAIN_DEFAULTS, type TerrainId, type TerrainTile } from '../terrain/terrain'
import { findRoute, KM_PER_HEX, type Route } from '../terrain/travel'
import { clockAt, isNight, nextPhaseTurn, type Clock } from '../time/clock'

const NOTHING_IN_SIGHT: PartySight = { radius: 0, visible: new Set(), blocked: new Set() }

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

export const useHexMapStore = defineStore('hexMap', () => {
  // The world is a function, not a stored map: only the ground near the view is
  // ever worked out, and everything that reads terrain asks the field for it.
  const field = shallowRef<TerrainField>(fieldFromTiles(new Map()))
  const hovered = ref<HexKey | null>(null)
  const allowWater = ref(false)

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
   * Whoever the map is currently listening to, or nobody at all: a map can be
   * emptied of entities, and an empty map has no orders to give.
   */
  const selectedEntity = computed<Entity | null>(
    () => entities.value.find((one) => one.id === selectedId.value) ?? entities.value[0] ?? null,
  )

  const openingState = (id: string, at: number): EntityState => {
    const origin = origins.value.get(id)
    return origin && origin.turn <= at ? { at: origin.hex, carry: 0, pending: [] } : idleState()
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

  /** Puts an entity on the map at the turn the crawl stands on. */
  const place = (id: string, hex: HexKey): void => {
    truncate()
    const next = new Map(origins.value)
    next.set(id, { turn: turn.value, hex })
    origins.value = next
  }

  const routeTo = (from: HexKey, to: HexKey): Route | null =>
    findRoute(field.value, parseKey(from), parseKey(to), { allowWater: allowWater.value })

  /**
   * One click, one order. The first puts the entity on the map; after that a
   * click plans the route it will walk as the turns pass, and clicking the
   * ground it stands on calls that order off.
   */
  const select = (hex: Axial | null): void => {
    if (!hex || !selectedEntity.value) return
    const key = hexKey(hex)
    const at = selectedState.value.at

    if (!at) {
      place(selectedId.value, key)
      return
    }

    // A route of just the hex underneath is a route with nothing left to walk,
    // which is how an order is called off without a second kind of action.
    if (key === at) {
      queueAction(selectedId.value, { kind: 'move', route: [at] })
      return
    }

    const found = routeTo(at, key)
    if (found) queueAction(selectedId.value, { kind: 'move', route: found.hexes.map(hexKey) })
  }

  const clear = (): void => {
    const at = selectedState.value.at
    if (at) queueAction(selectedId.value, { kind: 'move', route: [at] })
  }

  /** Spends a turn: every entity resolves, ordered or not, and is written down. */
  const advanceTurn = (): void => {
    truncate()
    const outcome = resolveTurn(turn.value, field.value, entities.value, states.value, queue.value)
    setFrames([...frames.value, { records: outcome.records, states: outcome.states }])
    queue.value = new Map()
    turn.value += 1
  }

  /** Winds the world back a turn; the record it is read out of is left alone. */
  const rewindTurn = (): void => {
    if (turn.value === 0) return
    turn.value -= 1
    queue.value = new Map()
  }

  const goToTurn = (at: number): void => {
    turn.value = Math.max(0, Math.min(frames.value.length, Math.floor(at)))
    queue.value = new Map()
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
  }

  /** The order an entity is about to walk: the queued one, or the standing one. */
  const orderFor = (id: string): readonly HexKey[] => {
    const queued = queue.value.get(id)
    if (queued?.kind === 'move') {
      const at = stateOf(id).at
      return queued.route[0] === at ? queued.route.slice(1) : queued.route
    }
    if (queued) return []
    return stateOf(id).pending
  }

  /** What the selected entity has left to walk, drawn ahead of it as arrows. */
  const plannedHexes = computed<Axial[]>(() => orderFor(selectedId.value).map(parseKey))

  const goal = computed<HexKey | null>(() => {
    const planned = orderFor(selectedId.value)
    return planned.length > 0 ? planned[planned.length - 1] : null
  })

  /** Kept for the panel: how far the planned order still has to go. */
  const route = computed<Route | null>(() => {
    const at = selectedState.value.at
    const end = goal.value
    if (!at || !end) return null
    return routeTo(at, end)
  })

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
    })),
  )

  /** Where everybody stood at the opening of a turn, for replaying one. */
  const positionsAt = (at: number): ReadonlyMap<string, HexKey | null> =>
    new Map([...statesAt(at)].map(([id, state]) => [id, state.at]))

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

  const explored = computed<ReadonlySet<HexKey>>(() => {
    const signature = [
      recordVersion.value,
      dmView.value,
      field.value.radius,
      entities.value.map((one) => `${one.id}:${one.sight}:${one.hidden}`).join(','),
    ].join('|')

    const carried = rolling && rolling.signature === signature ? rolling : null
    if (carried && carried.turn === turn.value) return carried.seen

    // Turns only ever arrive one at a time going forward, so the usual case is
    // adding the turn just spent to what was already worked out.
    const seen = carried && carried.turn < turn.value ? new Set(carried.seen) : new Set<HexKey>()
    const from = carried && carried.turn < turn.value ? carried.turn + 1 : 0

    for (let at = from; at <= turn.value; at++) seenOn(at, seen)

    rolling = { signature, turn: turn.value, seen }
    return seen
  })

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
    allowWater: allowWater.value,
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
  }))

  // Terrain goes in first: laying down a new world is what wipes the map, so
  // the remembered crawl has to be handed back after it, not before.
  const restore = (saved: MapSnapshot): void => {
    setWorldRadius(saved.worldRadius)
    setTerrain(saved.terrain)
    allowWater.value = saved.allowWater
    fog.value = saved.fog
    showSight.value = saved.showSight
    showHistory.value = saved.showHistory
    dmView.value = saved.dmView
    // A save file written before entities existed has none of them, and the map
    // always has somebody on it, so the party it opened with stays.
    if (saved.entities.length > 0) entities.value = saved.entities.map((one) => ({ ...one }))
    selectedId.value =
      entities.value.find((one) => one.id === saved.selectedId)?.id ?? entities.value[0].id
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
    addEntity,
    removeEntity,
    renameEntity,
    setPace,
    setEntitySight,
    start,
    goal,
    partyHex,
    allowWater,
    route,
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
    queueAction,
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
    setSight,
    sightAt,
    reach,
    visible,
    blocked,
    explored,
    setTiles,
    setHovered,
    select,
    clear,
    snapshot,
    restore,
  }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useHexMapStore, import.meta.hot))
}
