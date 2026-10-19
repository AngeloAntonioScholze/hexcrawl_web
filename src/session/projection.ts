import { defaultAbilities, hasAbilities, type Abilities } from '../entities/abilities'
import type { CatalogOverride } from '../entities/catalog'
import { characterIn, hasCharacter } from '../entities/character'
import type { ActionRecord } from '../entities/action'
import { idleState, sightAt, type Entity, type EntityState } from '../entities/entity'
import type { Item } from '../entities/inventory'
import type { Merchant } from '../entities/merchant'
import { carriesSupplies, suppliesAt, type Supplies, type SupplyEntry } from '../entities/supplies'
import { encountersUpTo } from '../encounters/log'
import { visiblePois } from '../engine/poiMarkers'
import { resourceMarks, type ResourceView } from '../engine/resourceMarkers'
import { roadSpans } from '../engine/roadSegments'
import type { HexEvent, HexLocation } from '../hex/content'
import { hexKey, parseKey, range, type HexKey } from '../hex/coords'
import { knownSet, withoutHidden, type FogEdits } from '../hex/fogEdits'
import type { MapSnapshot, SavedAction, SavedCharacter, SavedOrigin } from '../persistence/mapState'
import type { TerrainField } from '../terrain/field'
import type { Resource } from '../terrain/resources'
import { roadKey, type RoadEdge } from '../terrain/roads'
import { sightFrom } from '../terrain/sight'
import type { TerrainId } from '../terrain/terrain'
import { clockAt, type Clock } from '../time/clock'

/** One explored hex's ground: what the renderer needs, without the colour it derives from it. */
export interface PlayerTile {
  hex: HexKey
  terrain: TerrainId
  height: number
  level: number
  elevation: number
}

export interface PlayerState extends EntityState {
  entityId: string
}

export interface PlayerSupplies extends Supplies {
  entityId: string
}

export interface PlayerAbilities extends Abilities {
  entityId: string
}

/**
 * Everything a player may see of a map, as plain data: arrays and records only,
 * every list in a fixed order, so equal maps give equal JSON and a diff between
 * two projections is only what changed. Absent on purpose: the seed and the
 * generation controls (they would hand a client the whole world), the fog edits
 * (only their result is sent), DM notes, encounter tables, resource odds, and the
 * DM's view state.
 */
export interface PlayerProjection {
  turn: number
  clock: Clock
  worldRadius: number
  /** Whether the players' orders stop at one turn of movement, as the host judges them. */
  playerReachCapped: boolean
  /** The DM has lifted the fog off the whole map: the players' map is drawn with none. */
  revealed: boolean
  /**
   * Ground the players know: what the visible entities have seen, with the DM's
   * fog edits laid over; the whole world once the DM reveals the map.
   */
  explored: HexKey[]
  /** Ground in sight of any visible entity right now, less what the DM hid. */
  visible: HexKey[]
  /** One per explored hex, in the same order; nothing else of the terrain is sent. */
  tiles: PlayerTile[]
  entities: Entity[]
  /** Where each visible entity stands now, and the route it is still walking. */
  states: PlayerState[]
  origins: SavedOrigin[]
  /** Turns already spent by visible entities: the journey rows the players may read. */
  record: ActionRecord[]
  queue: SavedAction[]
  /** What each visible caravan's wagons hold this turn. */
  supplies: PlayerSupplies[]
  /** Every visible party's and npc's scores, the defaults spelled out. */
  abilities: PlayerAbilities[]
  merchants: Merchant[]
  items: Item[]
  catalogOverrides: CatalogOverride[]
  resources: Omit<Resource, 'origin'>[]
  locations: ({ hex: HexKey } & HexLocation)[]
  /** Events on explored ground, including the encounters met there up to this turn. */
  events: ({ hex: HexKey } & HexEvent)[]
  roads: RoadEdge[]
  rivers: RoadEdge[]
  /** The purse and level of every visible party and npc, the defaults spelled out. */
  characters: SavedCharacter[]
}

// Parsed once per hex rather than once per comparison: an explored set of a
// few thousand hexes is tens of thousands of comparisons.
const sorted = (hexes: ReadonlySet<HexKey>): HexKey[] =>
  [...hexes]
    .map((key) => ({ key, ...parseKey(key) }))
    .sort((a, b) => a.q - b.q || a.r - b.r)
    .map((one) => one.key)

const groupByHex = <T extends { hex: HexKey }>(
  rows: readonly T[],
): Map<HexKey, Omit<T, 'hex'>[]> => {
  const grouped = new Map<HexKey, Omit<T, 'hex'>[]>()
  for (const { hex, ...rest } of rows) {
    const list = grouped.get(hex) ?? []
    list.push(rest)
    grouped.set(hex, list)
  }
  return grouped
}

const flatten = <T>(grouped: ReadonlyMap<HexKey, readonly T[]>): ({ hex: HexKey } & T)[] =>
  [...grouped].flatMap(([hex, list]) => list.map((one) => ({ hex, ...one })))

interface RecordReader {
  /** An entity's state at the opening of a turn, read the way the store reads it. */
  stateAt(id: string, at: number): EntityState
  /** The hexes an entity crossed while spending a turn. */
  enteredOn(id: string, at: number): readonly HexKey[]
}

function readRecord(snapshot: MapSnapshot): RecordReader {
  const statesByTurn = new Map<number, Map<string, EntityState>>()
  for (const { turn, entityId, ...state } of snapshot.states) {
    const states = statesByTurn.get(turn) ?? new Map<string, EntityState>()
    states.set(entityId, state)
    statesByTurn.set(turn, states)
  }
  const origins = new Map(snapshot.origins.map((one) => [one.entityId, one]))
  const entered = new Map(
    snapshot.record.map((row) => [`${row.turn}:${row.entityId}`, row.entered] as const),
  )

  return {
    // What the frame before a turn left behind, or where an entity was put down.
    stateAt: (id, at) => {
      const saved = at > 0 ? statesByTurn.get(at - 1)?.get(id) : undefined
      if (saved) return saved
      const origin = origins.get(id)
      return { ...idleState(), at: origin && origin.turn <= at ? origin.hex : null }
    },
    enteredOn: (id, at) => entered.get(`${at}:${id}`) ?? [],
  }
}

/**
 * What one projector keeps between calls. None of it is ever handed out: it
 * only saves working the same ground out twice.
 */
interface ProjectorCache {
  field: TerrainField | null
  /** What can be seen from a hex at a radius, for this field. */
  sight: Map<string, ReadonlySet<HexKey>>
  /** The ground seen up to a turn, and what that answer was worked out from. */
  rolling: { key: string; turn: number; seen: ReadonlySet<HexKey> } | null
  /** The whole world as a revealed map sends it, for this field and size. */
  world: {
    radius: number
    known: ReadonlySet<HexKey>
    explored: HexKey[]
    tiles: PlayerTile[]
  } | null
}

const emptyCache = (): ProjectorCache => ({
  field: null,
  sight: new Map(),
  rolling: null,
  world: null,
})

/**
 * Everything the ground seen up to a turn is worked out from, as one string:
 * two snapshots giving the same key give the same ground. Later turns are left
 * out, so a turn spent leaves the key of the turns before it as it was.
 */
function sightKey(snapshot: MapSnapshot, shown: readonly Entity[], upTo: number): string {
  const ids = new Set(shown.map((one) => one.id))
  const parts = [shown.map((one) => `${one.id}:${one.sight}:${one.darkvision}`).join(',')]
  for (const one of snapshot.origins) {
    if (ids.has(one.entityId) && one.turn <= upTo)
      parts.push(`o${one.entityId}@${one.turn}:${one.hex}`)
  }
  for (const row of snapshot.states) {
    if (ids.has(row.entityId) && row.turn < upTo)
      parts.push(`s${row.turn}:${row.entityId}:${row.at}`)
  }
  for (const row of snapshot.record) {
    if (ids.has(row.entityId) && row.turn <= upTo) {
      parts.push(`r${row.turn}:${row.entityId}:${row.entered.join(' ')}`)
    }
  }
  return parts.join('|')
}

/**
 * The fog as the players have it, worked out from the snapshot rather than read
 * off the store: the store's explored set takes hidden entities' sight in while
 * the DM view is on, and a DM hosting a session is usually in the DM view. It
 * walks the record the way the store's does, turn by turn up to this one,
 * starting from the last answer when the turns before it are unchanged.
 */
function playerSight(
  snapshot: MapSnapshot,
  field: TerrainField,
  shown: readonly Entity[],
  record: RecordReader,
  cache: ProjectorCache,
): { seen: ReadonlySet<HexKey>; inSight: Set<HexKey> } {
  const memo = cache.sight
  const seenFrom = (hex: HexKey, radius: number): ReadonlySet<HexKey> => {
    const key = `${hex}:${radius}`
    let seen = memo.get(key)
    if (!seen) {
      seen = sightFrom(field, parseKey(hex), { radius }).visible
      memo.set(key, seen)
    }
    return seen
  }

  const turn = snapshot.turn
  const carried = cache.rolling
  const from =
    carried && carried.turn <= turn && carried.key === sightKey(snapshot, shown, carried.turn)
      ? carried
      : null

  let seen: ReadonlySet<HexKey>
  if (from && from.turn === turn) {
    seen = from.seen
  } else {
    const growing = new Set<HexKey>(from?.seen)
    seenBetween(from ? from.turn + 1 : 0, turn, shown, record, seenFrom, growing)
    seen = growing
    cache.rolling = { key: sightKey(snapshot, shown, turn), turn, seen }
  }

  // Every visible entity's sight, not just the one the DM has selected: the
  // selection is the DM's view state, and it may well be a hidden entity.
  const inSight = new Set<HexKey>()
  for (const entity of shown) {
    const hex = record.stateAt(entity.id, turn).at
    if (!hex) continue
    for (const key of seenFrom(hex, sightAt(entity, turn))) inSight.add(key)
  }
  return { seen, inSight }
}

/** Everything the visible entities laid eyes on over a run of turns, added to a set. */
function seenBetween(
  first: number,
  last: number,
  shown: readonly Entity[],
  record: RecordReader,
  seenFrom: (hex: HexKey, radius: number) => ReadonlySet<HexKey>,
  seen: Set<HexKey>,
): void {
  for (let at = first; at <= last; at++) {
    for (const entity of shown) {
      const hex = record.stateAt(entity.id, at).at
      if (!hex) continue
      const radius = sightAt(entity, at)
      for (const key of seenFrom(hex, radius)) seen.add(key)
      for (const crossed of record.enteredOn(entity.id, at)) {
        for (const key of seenFrom(crossed, radius)) seen.add(key)
      }
    }
  }
}

const tileOf = (field: TerrainField, hex: HexKey): PlayerTile[] => {
  const tile = field.at(parseKey(hex))
  return tile
    ? [
        {
          hex,
          terrain: tile.terrain,
          height: tile.height,
          level: tile.level,
          elevation: tile.elevation,
        },
      ]
    : []
}

/**
 * Exactly what a player may see of the map. A pure function of the saved
 * snapshot and the ground it stands on: equal input gives equal output, and
 * nothing in it is shared with the input, so it can be sent as it is.
 */
export function projectForPlayers(snapshot: MapSnapshot, field: TerrainField): PlayerProjection {
  return project(snapshot, field, emptyCache())
}

/**
 * projectForPlayers for a map projected over and over as it changes: each call
 * gives what projectForPlayers would, but the sight already worked out for the
 * ground is kept, and so are the turns already walked while the record before
 * them stands. Successive answers may share lists that did not change, so
 * neither is to be written to.
 */
export function createProjector(): (
  snapshot: MapSnapshot,
  field: TerrainField,
) => PlayerProjection {
  const cache = emptyCache()
  return (snapshot, field) => project(snapshot, field, cache)
}

function project(
  snapshot: MapSnapshot,
  field: TerrainField,
  cache: ProjectorCache,
): PlayerProjection {
  if (cache.field !== field) {
    cache.field = field
    cache.sight = new Map()
    cache.rolling = null
    cache.world = null
  }

  const turn = snapshot.turn
  const shown = snapshot.entities.filter((one) => !one.hidden)
  const shownIds = new Set(shown.map((one) => one.id))
  const isShown = (row: { entityId: string }): boolean => shownIds.has(row.entityId)

  const edits: FogEdits = {
    revealed: new Set(snapshot.fogEdits.filter((one) => one.revealed).map((one) => one.hex)),
    hidden: new Set(snapshot.fogEdits.filter((one) => !one.revealed).map((one) => one.hex)),
  }
  const record = readRecord(snapshot)
  const { seen, inSight } = playerSight(snapshot, field, shown, record, cache)

  // A revealed map is the player view with the fog off: every hex of the world,
  // which range already lists in the order the projection keeps.
  let known: ReadonlySet<HexKey>
  let explored: HexKey[]
  let tiles: PlayerTile[]
  if (snapshot.revealed) {
    if (cache.world?.radius !== snapshot.worldRadius) {
      const all = range({ q: 0, r: 0 }, snapshot.worldRadius).map(hexKey)
      cache.world = {
        radius: snapshot.worldRadius,
        known: new Set(all),
        explored: all,
        tiles: all.flatMap((hex) => tileOf(field, hex)),
      }
    }
    ;({ known, explored, tiles } = cache.world)
  } else {
    known = knownSet(seen, edits)
    explored = sorted(known)
    tiles = explored.flatMap((hex) => tileOf(field, hex))
  }

  // The same filters the player view draws through, so the projection holds
  // exactly the markers, roads and rivers that view puts on the map.
  const view: ResourceView = { dmView: false, fog: !snapshot.revealed, explored: known }

  const markedHexes = new Set(resourceMarks(snapshot.resources, view).map((mark) => mark.hex))
  const resources = snapshot.resources
    .filter((one) => markedHexes.has(one.hex))
    .map(({ id, hex, type }) => ({ id, hex, type }))

  // Encounters met after this turn are a future the crawl was wound back from.
  const events = encountersUpTo(groupByHex(snapshot.events), turn)
  const locations = groupByHex(snapshot.locations)
  const poiHexes = new Set(visiblePois(locations, events, view).map((poi) => poi.hex))
  const onPoi = <T>(grouped: ReadonlyMap<HexKey, readonly T[]>): Map<HexKey, readonly T[]> =>
    new Map([...grouped].filter(([hex]) => poiHexes.has(hex)))

  const edgesShown = (edges: readonly RoadEdge[]): RoadEdge[] =>
    roadSpans(new Set(edges.map(({ a, b }) => roadKey(parseKey(a), parseKey(b)))), view).map(
      ({ a, b }) => ({ a, b }),
    )

  const sheet = new Map(
    snapshot.characters.map(({ entityId, ...character }) => [entityId, character]),
  )

  const ledger = new Map<string, SupplyEntry[]>()
  for (const { entityId, ...entry } of snapshot.supplies) {
    ledger.set(entityId, [...(ledger.get(entityId) ?? []), entry])
  }

  const scores = new Map(snapshot.abilities.map(({ entityId, ...one }) => [entityId, one]))

  const states = shown.map((entity): PlayerState => {
    const state = record.stateAt(entity.id, turn)
    return {
      entityId: entity.id,
      at: state.at,
      carry: state.carry,
      pending: [...state.pending],
      waypoints: [...state.waypoints],
      // Riding something the players cannot see would name it.
      riding: state.riding && shownIds.has(state.riding) ? state.riding : null,
    }
  })

  return {
    turn,
    clock: clockAt(turn),
    worldRadius: snapshot.worldRadius,
    playerReachCapped: snapshot.playerReachCapped,
    revealed: snapshot.revealed,
    explored,
    visible: sorted(withoutHidden(inSight, edits.hidden)),
    tiles,
    entities: shown.map((one) => ({ ...one })),
    states,
    origins: snapshot.origins.filter(isShown).map((one) => ({ ...one })),
    record: snapshot.record
      .filter((row) => isShown(row) && row.turn < turn)
      .map((row) => ({ ...row, entered: [...row.entered] })),
    queue: snapshot.queue.filter(isShown).map(({ entityId, action }) => ({
      entityId,
      action:
        action.kind === 'move'
          ? { kind: 'move', route: [...action.route], waypoints: [...action.waypoints] }
          : { kind: action.kind },
    })),
    supplies: shown
      .filter((one) => carriesSupplies(one.kind))
      .map((one) => ({ entityId: one.id, ...suppliesAt(ledger, one.id, turn) })),
    abilities: shown
      .filter((one) => hasAbilities(one.kind))
      .map((one) => ({ entityId: one.id, ...(scores.get(one.id) ?? defaultAbilities()) })),
    merchants: snapshot.merchants
      .filter((one) => shownIds.has(one.caravanId))
      .map((one) => ({ ...one })),
    items: snapshot.items.filter((one) => shownIds.has(one.ownerId)).map((one) => ({ ...one })),
    catalogOverrides: structuredClone([...snapshot.catalogOverrides]),
    resources,
    locations: flatten(onPoi(locations)),
    events: flatten(onPoi(events)),
    roads: edgesShown(snapshot.roads),
    rivers: edgesShown(snapshot.rivers),
    characters: shown
      .filter((one) => hasCharacter(one.kind))
      .map((one) => ({ entityId: one.id, ...characterIn(sheet, one.id) })),
  }
}
