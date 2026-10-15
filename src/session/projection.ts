import type { CatalogOverride } from '../entities/catalog'
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
import { parseKey, type HexKey } from '../hex/coords'
import { knownSet, withoutHidden, type FogEdits } from '../hex/fogEdits'
import type { MapSnapshot, SavedAction, SavedOrigin } from '../persistence/mapState'
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
  /** Ground the players know: what the visible entities have seen, with the DM's fog edits laid over. */
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
  merchants: Merchant[]
  items: Item[]
  catalogOverrides: CatalogOverride[]
  resources: Omit<Resource, 'origin'>[]
  locations: ({ hex: HexKey } & HexLocation)[]
  /** Events on explored ground, including the encounters met there up to this turn. */
  events: ({ hex: HexKey } & HexEvent)[]
  roads: RoadEdge[]
  rivers: RoadEdge[]
}

const byHex = (a: HexKey, b: HexKey): number => {
  const one = parseKey(a)
  const other = parseKey(b)
  return one.q - other.q || one.r - other.r
}

const sorted = (hexes: ReadonlySet<HexKey>): HexKey[] => [...hexes].sort(byHex)

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
 * The fog as the players have it, worked out from the snapshot rather than read
 * off the store: the store's explored set takes hidden entities' sight in while
 * the DM view is on, and a DM hosting a session is usually in the DM view. It
 * walks the record the way the store's does, turn by turn up to this one.
 */
function playerSight(
  snapshot: MapSnapshot,
  field: TerrainField,
  shown: readonly Entity[],
  record: RecordReader,
): { seen: Set<HexKey>; inSight: Set<HexKey> } {
  const memo = new Map<string, Set<HexKey>>()
  const seenFrom = (hex: HexKey, radius: number): Set<HexKey> => {
    const key = `${hex}:${radius}`
    let seen = memo.get(key)
    if (!seen) {
      seen = sightFrom(field, parseKey(hex), { radius }).visible
      memo.set(key, seen)
    }
    return seen
  }

  const seen = new Set<HexKey>()
  for (let at = 0; at <= snapshot.turn; at++) {
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

  // Every visible entity's sight, not just the one the DM has selected: the
  // selection is the DM's view state, and it may well be a hidden entity.
  const inSight = new Set<HexKey>()
  for (const entity of shown) {
    const hex = record.stateAt(entity.id, snapshot.turn).at
    if (!hex) continue
    for (const key of seenFrom(hex, sightAt(entity, snapshot.turn))) inSight.add(key)
  }
  return { seen, inSight }
}

/**
 * Exactly what a player may see of the map. A pure function of the saved
 * snapshot and the ground it stands on: equal input gives equal output, and
 * nothing in it is shared with the input, so it can be sent as it is.
 */
export function projectForPlayers(snapshot: MapSnapshot, field: TerrainField): PlayerProjection {
  const turn = snapshot.turn
  const shown = snapshot.entities.filter((one) => !one.hidden)
  const shownIds = new Set(shown.map((one) => one.id))
  const isShown = (row: { entityId: string }): boolean => shownIds.has(row.entityId)

  const edits: FogEdits = {
    revealed: new Set(snapshot.fogEdits.filter((one) => one.revealed).map((one) => one.hex)),
    hidden: new Set(snapshot.fogEdits.filter((one) => !one.revealed).map((one) => one.hex)),
  }
  const record = readRecord(snapshot)
  const { seen, inSight } = playerSight(snapshot, field, shown, record)
  const known = knownSet(seen, edits)
  const explored = sorted(known)

  const tiles = explored.flatMap((hex): PlayerTile[] => {
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
  })

  // The same filters the player view draws through, so the projection holds
  // exactly the markers, roads and rivers that view puts on the map.
  const view: ResourceView = { dmView: false, fog: true, explored: known }

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

  const ledger = new Map<string, SupplyEntry[]>()
  for (const { entityId, ...entry } of snapshot.supplies) {
    ledger.set(entityId, [...(ledger.get(entityId) ?? []), entry])
  }

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
  }
}
