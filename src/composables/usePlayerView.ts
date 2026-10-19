import { computed, effectScope, type ComputedRef } from 'vue'
import type { Action, ActionRecord } from '../entities/action'
import { applyCatalogOverrides, DEFAULT_CATALOG, type CatalogEntry } from '../entities/catalog'
import type { Entity } from '../entities/entity'
import { carriesInventory, type Item } from '../entities/inventory'
import type { Merchant } from '../entities/merchant'
import { NO_SUPPLIES, type Supplies } from '../entities/supplies'
import { encountersMet, interleave, type LogEntry } from '../encounters/log'
import type { ResourceView } from '../engine/resourceMarkers'
import type { HexEvent, HexLocation } from '../hex/content'
import { parseKey, type Axial, type HexKey } from '../hex/coords'
import type { Knowledge } from '../hex/fogEdits'
import type { SavedOrigin } from '../persistence/mapState'
import {
  createProjector,
  type PlayerProjection,
  type PlayerState,
  type PlayerTile,
} from '../session/projection'
import { TOKEN_SHAPES, useHexMapStore, type EntityPath, type JourneyRow } from '../stores/hexMap'
import { roadKey, type Roads } from '../terrain/roads'
import type { TokenShape } from '../engine/partyToken'

/**
 * A computed that keeps handing out its last answer while a new one equals it,
 * so whatever watches it is left alone. The player view is worked out afresh
 * whenever the map changes at all, and the scene rebuilds whatever it is
 * handed: an order given should not lay every road down again.
 */
export function settled<T>(
  work: () => T,
  same: (a: T, b: T) => boolean = sameJson,
): ComputedRef<T> {
  return computed<T>((last) => {
    const next = work()
    return last !== undefined && same(last, next) ? last : next
  })
}

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((one, at) => one === b[at])

/** The projection read the way the map draws: sets and maps rather than lists. */
export interface PlayerScene {
  projection: PlayerProjection
  /** Ground the players know, the fog edits laid over: what the fog leaves uncovered. */
  known: ReadonlySet<HexKey>
  visible: ReadonlySet<HexKey>
  /** What markers, places, roads and rivers are drawn against, as the store's drawnView. */
  view: ResourceView
  entities: readonly Entity[]
  entityOf: ReadonlyMap<string, Entity>
  states: ReadonlyMap<string, PlayerState>
  origins: ReadonlyMap<string, SavedOrigin>
  queue: ReadonlyMap<string, Action>
  locations: ReadonlyMap<HexKey, readonly HexLocation[]>
  events: ReadonlyMap<HexKey, readonly HexEvent[]>
  roads: Roads
  rivers: Roads
}

const byHex = <T extends { hex: HexKey }>(rows: readonly T[]): Map<HexKey, Omit<T, 'hex'>[]> => {
  const grouped = new Map<HexKey, Omit<T, 'hex'>[]>()
  for (const { hex, ...rest } of rows) {
    const list = grouped.get(hex) ?? []
    list.push(rest)
    grouped.set(hex, list)
  }
  return grouped
}

const edges = (rows: readonly { a: HexKey; b: HexKey }[]): Roads =>
  new Set(rows.map(({ a, b }) => roadKey(parseKey(a), parseKey(b))))

/**
 * Reads a projection for drawing. The sets of hexes are handed back from the
 * last reading when the lists match it, so a projection that left the fog where
 * it was leaves the fog's readers alone too.
 */
export function readProjection(projection: PlayerProjection, last?: PlayerScene): PlayerScene {
  const reuse = (
    list: readonly HexKey[],
    before: PlayerScene['known'] | undefined,
    was?: readonly HexKey[],
  ) => (before && was && (list === was || sameList(list, was)) ? before : new Set(list))

  const known = reuse(projection.explored, last?.known, last?.projection.explored)
  const visible = reuse(projection.visible, last?.visible, last?.projection.visible)
  return {
    projection,
    known,
    visible,
    view: { dmView: false, fog: !projection.revealed, explored: known },
    entities: projection.entities,
    entityOf: new Map(projection.entities.map((one) => [one.id, one])),
    states: new Map(projection.states.map((one) => [one.entityId, one])),
    origins: new Map(projection.origins.map((one) => [one.entityId, one])),
    queue: new Map(projection.queue.map((one) => [one.entityId, one.action])),
    locations: byHex(projection.locations),
    events: byHex(projection.events),
    roads: edges(projection.roads),
    rivers: edges(projection.rivers),
  }
}

/** Whose route an entity walks: its own once it has an order, else the caravan it rides in. */
const routeOwner = (scene: PlayerScene, id: string): string =>
  scene.queue.has(id) ? id : (scene.states.get(id)?.riding ?? id)

/** What an entity has left to walk, as the store's orderFor reads it. */
export function orderOf(scene: PlayerScene, id: string): readonly HexKey[] {
  const owner = routeOwner(scene, id)
  const queued = scene.queue.get(owner)
  if (queued?.kind === 'move') {
    const at = scene.states.get(owner)?.at ?? null
    return queued.route[0] === at ? queued.route.slice(1) : queued.route
  }
  if (queued) return []
  return scene.states.get(owner)?.pending ?? []
}

/** The stops an entity is headed through, and the colour of whoever walks them. */
export function stopsOf(scene: PlayerScene, id: string): { hexes: Axial[]; color: string } {
  const owner = routeOwner(scene, id)
  const queued = scene.queue.get(owner)
  const waypoints = queued
    ? queued.kind === 'move'
      ? queued.waypoints
      : []
    : (scene.states.get(owner)?.waypoints ?? [])
  const walker = scene.entityOf.get(owner) ?? scene.entityOf.get(id)
  return { hexes: waypoints.map(parseKey), color: walker?.color ?? '#ffffff' }
}

/** Where one entity has been up to this turn, in the order it went. */
const trailOf = (scene: PlayerScene, id: string): Axial[] => {
  const walked: Axial[] = []
  const origin = scene.origins.get(id)
  if (origin && origin.turn <= scene.projection.turn) walked.push(parseKey(origin.hex))
  for (const row of scene.projection.record) {
    if (row.entityId === id) for (const crossed of row.entered) walked.push(parseKey(crossed))
  }
  return walked
}

export interface PathOptions {
  selectedId: string
  showHistory: boolean
  showAllPaths: boolean
}

/** Every line the map draws, as the store's paths: the selected entity's, or everybody's. */
export function pathsOf(scene: PlayerScene, options: PathOptions): EntityPath[] {
  const pathFor = (id: string): Axial[] => {
    const ahead = orderOf(scene, id).map(parseKey)
    if (options.showHistory) return [...trailOf(scene, id), ...ahead]
    const at = scene.states.get(id)?.at
    return at ? [parseKey(at), ...ahead] : ahead
  }
  const drawn = options.showAllPaths
    ? scene.entities
    : scene.entities.filter((one) => one.id === options.selectedId)
  return drawn.map((one) => ({ id: one.id, color: one.color, hexes: pathFor(one.id) }))
}

export interface PlayerToken {
  id: string
  hex: HexKey | null
  color: string
  shape: TokenShape
  inside: string | null
}

/** One token for each entity the players can see, where it stands right now. */
export const tokensOf = (scene: PlayerScene): PlayerToken[] =>
  scene.entities.map((one) => {
    const state = scene.states.get(one.id)
    return {
      id: one.id,
      hex: state?.at ?? null,
      color: one.color,
      shape: TOKEN_SHAPES[one.kind],
      inside: state?.riding ?? null,
    }
  })

/** The tile under an explored hex: the tiles are sorted as the explored list is. */
const tileAt = (tiles: readonly PlayerTile[], hex: HexKey): PlayerTile | undefined => {
  const { q, r } = parseKey(hex)
  let lo = 0
  let hi = tiles.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const at = parseKey(tiles[mid].hex)
    const order = at.q - q || at.r - r
    if (order === 0) return tiles[mid]
    if (order < 0) lo = mid + 1
    else hi = mid - 1
  }
  return undefined
}

/** One entity's turns, with the encounters met on the way, as the store's adventure log. */
export function logOf(scene: PlayerScene, id: string): LogEntry<JourneyRow>[] {
  const rows = scene.projection.record
    .filter((row) => row.entityId === id)
    .map((row): JourneyRow => ({
      turn: row.turn,
      hex: row.to ?? row.from ?? ('0,0' as HexKey),
      terrain: tileAt(scene.projection.tiles, row.to ?? ('0,0' as HexKey))?.terrain ?? 'grass',
      kind: row.kind,
      entered: row.entered.length,
      spent: row.turn < scene.projection.turn,
    }))
  return interleave(rows, encountersMet(scene.events))
}

/** How many hexes an entity has walked up to this turn. */
export const hexesWalkedBy = (scene: PlayerScene, id: string): number =>
  scene.projection.record
    .filter((row) => row.entityId === id)
    .reduce((total, row) => total + row.entered.length, 0)

/**
 * Hands the fog what it needs to draw one change as a step rather than whole:
 * what came to light and what was lost since the last answer, numbered so a
 * reader that skipped one knows to take the whole set. A new answer is given
 * whenever what is known or what is in sight changed, so a step that only moved
 * the sight is drawn as one too.
 */
export function createFogFeed(): (
  known: ReadonlySet<HexKey>,
  visible: ReadonlySet<HexKey>,
) => Knowledge {
  let last: { known: ReadonlySet<HexKey>; visible: ReadonlySet<HexKey>; answer: Knowledge } | null =
    null
  let version = 0

  return (known, visible) => {
    if (last && last.known === known && last.visible === visible) return last.answer
    version += 1
    let answer: Knowledge
    if (!last) {
      answer = { seen: known, added: null, lost: new Set(), version }
    } else {
      const before = last.known
      const added = new Set<HexKey>()
      const lost = new Set<HexKey>()
      if (before !== known) {
        for (const key of known) if (!before.has(key)) added.add(key)
        for (const key of before) if (!known.has(key)) lost.add(key)
      }
      answer = { seen: known, added, lost, version }
    }
    last = { known, visible, answer }
    return answer
  }
}

/** Where everybody stood, and who they rode with, as the turn playback reads it. */
export type Positions = ReadonlyMap<string, { hex: HexKey | null; inside: string | null }>

const positionsIn = (projection: PlayerProjection): Positions =>
  new Map(projection.states.map((one) => [one.entityId, { hex: one.at, inside: one.riding }]))

export interface PlayerView {
  /**
   * Everything the player view draws comes from this, and only this: on this
   * browser it is the map projected for the players, and a guest's would be the
   * one the room sent.
   */
  projection: ComputedRef<PlayerProjection>
  scene: ComputedRef<PlayerScene>
  fog: ComputedRef<Knowledge>
  tokens: ComputedRef<PlayerToken[]>
  paths: ComputedRef<EntityPath[]>
  /** The selected entity's, as the store's start, goal, plannedHexes and stops. */
  start: ComputedRef<HexKey | null>
  goal: ComputedRef<HexKey | null>
  plannedHexes: ComputedRef<Axial[]>
  stops: ComputedRef<{ hexes: Axial[]; color: string }>
  adventureLog: ComputedRef<LogEntry<JourneyRow>[]>
  hexesWalked: ComputedRef<number>
  /** Who walks on their own; riders are listed under their caravan. */
  walking: ComputedRef<readonly Entity[]>
  ridersOf(caravanId: string): readonly Entity[]
  carrierOf(id: string): string | null
  /** The caravan the panel shows, as the store's shownCaravan: the selected one or the one it rides in. */
  shownCaravan: ComputedRef<Entity | null>
  itemsOf(ownerId: string): readonly Item[]
  /** Who an entity may hand items to, as the store's inventoryPartners. */
  inventoryPartners(id: string): readonly Entity[]
  suppliesOf(caravanId: string): Supplies
  merchantsOf(caravanId: string): readonly Merchant[]
  catalog: ComputedRef<readonly CatalogEntry[]>
  /** Where everybody stood at the opening of a turn, if the view still holds it. */
  positionsAt(at: number): Positions | null
  /** What everybody did on a turn already spent. */
  recordsOn(at: number): readonly ActionRecord[]
}

function createPlayerView(store: ReturnType<typeof useHexMapStore>): PlayerView {
  const project = createProjector()
  // The one place the player view's data comes from; a joined guest's is the
  // projection the room sent instead. Projected afresh on every change to the
  // map; the projector keeps the sight it worked out, so that costs a turn's
  // walking rather than the whole crawl's.
  const source = (): PlayerProjection => project(store.snapshot, store.field)

  // The last projection standing at another turn, kept for the playback: the
  // turn being played opened where that one left everybody.
  let before: PlayerProjection | null = null
  const projection = computed<PlayerProjection>((last) => {
    const next = source()
    if (last && last.turn !== next.turn) before = last
    return next
  })

  const scene = computed<PlayerScene>((last) => readProjection(projection.value, last))

  const feed = createFogFeed()
  const fog = computed(() => feed(scene.value.known, scene.value.visible))

  const selectedId = (): string => store.selectedId
  const selectedState = (): PlayerState | undefined => scene.value.states.get(selectedId())

  const ahead = settled(() => orderOf(scene.value, selectedId()), sameList)
  const ridingIn = computed(() => {
    const inside = new Map<string, Entity[]>()
    for (const one of scene.value.entities) {
      const carrier = scene.value.states.get(one.id)?.riding
      if (carrier) inside.set(carrier, [...(inside.get(carrier) ?? []), one])
    }
    return inside
  })

  const carrierOf = (id: string): string | null => scene.value.states.get(id)?.riding ?? null
  const ridersOf = (caravanId: string): readonly Entity[] => ridingIn.value.get(caravanId) ?? []

  return {
    projection,
    scene,
    fog,
    tokens: settled(() => tokensOf(scene.value)),
    paths: settled(() =>
      pathsOf(scene.value, {
        selectedId: selectedId(),
        showHistory: store.showHistory,
        showAllPaths: store.showAllPaths,
      }),
    ),
    start: computed(() => selectedState()?.at ?? null),
    goal: computed(() => ahead.value[ahead.value.length - 1] ?? null),
    plannedHexes: computed(() => ahead.value.map(parseKey)),
    stops: settled(() => stopsOf(scene.value, selectedId())),
    adventureLog: settled(() => logOf(scene.value, selectedId())),
    hexesWalked: computed(() => hexesWalkedBy(scene.value, selectedId())),
    walking: computed(() =>
      scene.value.entities.filter((one) => !scene.value.states.get(one.id)?.riding),
    ),
    ridersOf,
    carrierOf,
    shownCaravan: computed(() => {
      const selected = scene.value.entityOf.get(selectedId())
      if (selected?.kind === 'caravan') return selected
      const carrier = scene.value.entityOf.get(carrierOf(selectedId()) ?? '')
      return carrier?.kind === 'caravan' ? carrier : null
    }),
    itemsOf: (ownerId) => projection.value.items.filter((one) => one.ownerId === ownerId),
    inventoryPartners: (id) => {
      const kind = scene.value.entityOf.get(id)?.kind
      if (!kind || !carriesInventory(kind)) return []
      const carrier = scene.value.entityOf.get(carrierOf(id) ?? '')
      const partners = carrier ? [carrier] : ridersOf(id)
      return partners.filter((one) => carriesInventory(one.kind))
    },
    suppliesOf: (caravanId) => {
      const held = projection.value.supplies.find((one) => one.entityId === caravanId)
      return held ? { food: held.food, gold: held.gold } : NO_SUPPLIES
    },
    merchantsOf: (caravanId) =>
      projection.value.merchants.filter((one) => one.caravanId === caravanId),
    catalog: computed(() =>
      applyCatalogOverrides(DEFAULT_CATALOG, projection.value.catalogOverrides),
    ),
    positionsAt: (at) => {
      if (projection.value.turn === at) return positionsIn(projection.value)
      return before?.turn === at ? positionsIn(before) : null
    },
    recordsOn: (at) => projection.value.record.filter((row) => row.turn === at),
  }
}

const views = new WeakMap<object, PlayerView>()

/**
 * The player view's single source, shared by everything that draws it. Nothing
 * is worked out until something reads it, so the DM's own view costs nothing.
 */
export function usePlayerView(): PlayerView {
  const store = useHexMapStore()
  let view = views.get(store)
  if (!view) {
    // Detached, like the store it reads: it lives as long as the store does,
    // not as long as whichever component asked for it first.
    view = effectScope(true).run(() => createPlayerView(store))!
    views.set(store, view)
  }
  return view
}
