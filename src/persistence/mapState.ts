import type { Database } from '@sqlite.org/sqlite-wasm'
import type { EncounterOverride } from '../encounters/tables'
import type { Action, ActionKind, ActionRecord } from '../entities/action'
import type { CatalogOverride } from '../entities/catalog'
import type { Entity, EntityKind, EntityState, Owner } from '../entities/entity'
import type { Item } from '../entities/inventory'
import type { Merchant, MerchantType } from '../entities/merchant'
import type { SupplyEntry } from '../entities/supplies'
import type { HexEvent, HexLocation } from '../hex/content'
import type { HexKey } from '../hex/coords'
import type { Origin, TerrainControls } from '../stores/hexMap'
import type { RiverEdge } from '../terrain/rivers'
import type { RoadEdge } from '../terrain/roads'
import {
  defaultResourceChances,
  type Resource,
  type ResourceChances,
  type ResourceOrigin,
  type ResourceType,
} from '../terrain/resources'
import type { TerrainId } from '../terrain/terrain'

/** An entity's state at the end of one turn, flattened for the save file. */
export interface SavedState extends EntityState {
  turn: number
  entityId: string
}

export interface SavedOrigin extends Origin {
  entityId: string
}

export interface SavedSupply extends SupplyEntry {
  entityId: string
}

export interface SavedAction {
  entityId: string
  action: Action
}

/**
 * Everything a session needs to come back as it was. The tiles themselves are
 * absent on purpose: terrain is a pure function of the controls, so storing
 * five thousand hexes would only be a slower way of storing the seed. So is the
 * explored set, which is read out of the record rather than piled up beside it.
 */
export interface MapSnapshot {
  terrain: TerrainControls
  /** How far the world runs from the middle, in hexes. */
  worldRadius: number
  fog: boolean
  showSight: boolean
  showHistory: boolean
  dmView: boolean
  /** The turn the crawl stands on; the clock reads off it. */
  turn: number
  selectedId: string
  entities: readonly Entity[]
  origins: readonly SavedOrigin[]
  /** What every entity did on every turn already spent. */
  record: readonly ActionRecord[]
  /** Where every entity stood at the end of each of those turns. */
  states: readonly SavedState[]
  /** Orders given but not yet spent. */
  queue: readonly SavedAction[]
  /** Every hand edit to a caravan's stores, on the turn it was made. */
  supplies: readonly SavedSupply[]
  notes: readonly { hex: HexKey; text: string }[]
  /** Listed hex by hex, each hex's in the order they were added. */
  events: readonly ({ hex: HexKey } & HexEvent)[]
  locations: readonly ({ hex: HexKey } & HexLocation)[]
  /** Every caravan's crew, in the order they were taken on. */
  merchants: readonly Merchant[]
  /** What every party, caravan and ship carries, in the order it was added. */
  items: readonly Item[]
  /** The DM's changes to the services catalog, in the order they were first made. */
  catalogOverrides: readonly CatalogOverride[]
  /** Listed in the order they were placed. */
  resources: readonly Resource[]
  resourceChances: ResourceChances
  /** The fewest hexes allowed between any two resources. */
  resourceSpacing: number
  /** Hexes the DM revealed to the players or hid from them, whatever the crawl saw. */
  fogEdits: readonly { hex: HexKey; revealed: boolean }[]
  /** The DM's edits to the encounter tables, in the order they were made. */
  encounterOverrides: readonly EncounterOverride[]
  /** Every stretch of road, each between two neighbouring hexes. */
  roads: readonly RoadEdge[]
  /** Every stretch of river, each along the side two neighbouring hexes share. */
  rivers: readonly RiverEdge[]
  /** Hexes the DM painted over, with the terrain each was painted. */
  terrainOverrides: readonly { hex: HexKey; terrain: TerrainId }[]
}

const SAVE_MAP = `
  INSERT OR REPLACE INTO map
    (id, seed, scale, sea_level, relief, world_radius, fog, show_sight,
     show_history, dm_view, turn, selected_id, resource_spacing)
  VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`

const flag = (value: boolean): number => (value ? 1 : 0)

const joinHexes = (hexes: readonly HexKey[]): string => hexes.join(' ')

const splitHexes = (value: unknown): HexKey[] =>
  String(value ?? '')
    .split(' ')
    .filter(Boolean) as HexKey[]

const hexOrNull = (value: unknown): HexKey | null =>
  typeof value === 'string' ? (value as HexKey) : null

/**
 * Written wholesale rather than diffed. A rewind can cut the record back, so a
 * save that only ever appended would hand a crawl back a future it had turned
 * away from on the next reload.
 */
export function saveSnapshot(db: Database, snapshot: MapSnapshot): void {
  db.transaction(() => {
    db.exec({
      sql: SAVE_MAP,
      bind: [
        snapshot.terrain.seed,
        snapshot.terrain.scale,
        snapshot.terrain.seaLevel,
        snapshot.terrain.relief,
        snapshot.worldRadius,
        flag(snapshot.fog),
        flag(snapshot.showSight),
        flag(snapshot.showHistory),
        flag(snapshot.dmView),
        snapshot.turn,
        snapshot.selectedId,
        snapshot.resourceSpacing,
      ],
    })

    db.exec('DELETE FROM entity')
    const entity = db.prepare(
      'INSERT INTO entity (id, ord, name, kind, owner, color, pace, sight, hidden) VALUES (?,?,?,?,?,?,?,?,?)',
    )
    try {
      snapshot.entities.forEach((one, index) => {
        entity
          .bind([
            one.id,
            index,
            one.name,
            one.kind,
            one.owner,
            one.color,
            one.pacePerTurn,
            one.sight,
            flag(one.hidden),
          ])
          .stepReset()
      })
    } finally {
      entity.finalize()
    }

    db.exec('DELETE FROM origin')
    const origin = db.prepare('INSERT INTO origin (entity_id, turn, hex) VALUES (?, ?, ?)')
    try {
      for (const one of snapshot.origins) origin.bind([one.entityId, one.turn, one.hex]).stepReset()
    } finally {
      origin.finalize()
    }

    // The turn table is the spine the history hangs off: cutting a turn out of
    // it takes what happened on that turn along with it.
    db.exec('DELETE FROM turn')
    const turns = new Set<number>()
    for (const row of snapshot.record) turns.add(row.turn)
    for (const row of snapshot.states) turns.add(row.turn)

    const turn = db.prepare('INSERT INTO turn (n) VALUES (?)')
    try {
      for (const n of [...turns].sort((a, b) => a - b)) turn.bind([n]).stepReset()
    } finally {
      turn.finalize()
    }

    db.exec('DELETE FROM action')
    const action = db.prepare(
      'INSERT INTO action (turn, entity_id, kind, from_hex, to_hex, entered, spent, carry) VALUES (?,?,?,?,?,?,?,?)',
    )
    try {
      for (const row of snapshot.record) {
        action
          .bind([
            row.turn,
            row.entityId,
            row.kind,
            row.from,
            row.to,
            joinHexes(row.entered),
            row.spent,
            row.carry,
          ])
          .stepReset()
      }
    } finally {
      action.finalize()
    }

    db.exec('DELETE FROM entity_turn')
    const state = db.prepare(
      'INSERT INTO entity_turn (turn, entity_id, hex, carry, pending, waypoints, riding) VALUES (?,?,?,?,?,?,?)',
    )
    try {
      for (const row of snapshot.states) {
        state
          .bind([
            row.turn,
            row.entityId,
            row.at,
            row.carry,
            joinHexes(row.pending),
            joinHexes(row.waypoints),
            row.riding,
          ])
          .stepReset()
      }
    } finally {
      state.finalize()
    }

    db.exec('DELETE FROM queued_action')
    const queued = db.prepare(
      'INSERT INTO queued_action (entity_id, kind, route, waypoints) VALUES (?, ?, ?, ?)',
    )
    try {
      for (const { entityId, action: order } of snapshot.queue) {
        const move = order.kind === 'move'
        queued
          .bind([
            entityId,
            order.kind,
            move ? joinHexes(order.route) : '',
            move ? joinHexes(order.waypoints) : '',
          ])
          .stepReset()
      }
    } finally {
      queued.finalize()
    }

    db.exec('DELETE FROM supply')
    const supply = db.prepare(
      'INSERT INTO supply (turn, entity_id, food, gold) VALUES (?, ?, ?, ?)',
    )
    try {
      for (const one of snapshot.supplies) {
        supply.bind([one.turn, one.entityId, one.food, one.gold]).stepReset()
      }
    } finally {
      supply.finalize()
    }

    db.exec('DELETE FROM hex_note')
    const note = db.prepare('INSERT INTO hex_note (hex, text) VALUES (?, ?)')
    try {
      for (const one of snapshot.notes) note.bind([one.hex, one.text]).stepReset()
    } finally {
      note.finalize()
    }

    db.exec('DELETE FROM hex_event')
    const event = db.prepare(
      'INSERT INTO hex_event (id, hex, ord, title, description, turn) VALUES (?, ?, ?, ?, ?, ?)',
    )
    try {
      snapshot.events.forEach((one, index) => {
        event
          .bind([one.id, one.hex, index, one.title, one.description, one.turn ?? null])
          .stepReset()
      })
    } finally {
      event.finalize()
    }

    db.exec('DELETE FROM hex_location')
    const location = db.prepare(
      'INSERT INTO hex_location (id, hex, ord, name, kind, description) VALUES (?, ?, ?, ?, ?, ?)',
    )
    try {
      snapshot.locations.forEach((one, index) => {
        location.bind([one.id, one.hex, index, one.name, one.kind, one.description]).stepReset()
      })
    } finally {
      location.finalize()
    }

    db.exec('DELETE FROM merchant')
    const merchant = db.prepare(
      'INSERT INTO merchant (id, caravan_id, ord, name, type, level) VALUES (?, ?, ?, ?, ?, ?)',
    )
    try {
      snapshot.merchants.forEach((one, index) => {
        merchant.bind([one.id, one.caravanId, index, one.name, one.type, one.level]).stepReset()
      })
    } finally {
      merchant.finalize()
    }

    db.exec('DELETE FROM item')
    const item = db.prepare(
      'INSERT INTO item (id, owner_id, ord, name, quantity, notes, weight) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    try {
      snapshot.items.forEach((one, index) => {
        item
          .bind([one.id, one.ownerId, index, one.name, one.quantity, one.notes, one.weight])
          .stepReset()
      })
    } finally {
      item.finalize()
    }

    db.exec('DELETE FROM catalog_override')
    const catalogOverride = db.prepare(
      'INSERT INTO catalog_override (id, ord, payload) VALUES (?, ?, ?)',
    )
    try {
      snapshot.catalogOverrides.forEach(({ id, ...rest }, index) => {
        catalogOverride.bind([id, index, JSON.stringify(rest)]).stepReset()
      })
    } finally {
      catalogOverride.finalize()
    }

    db.exec('DELETE FROM resource')
    const resource = db.prepare(
      'INSERT INTO resource (id, hex, ord, type, origin) VALUES (?, ?, ?, ?, ?)',
    )
    try {
      snapshot.resources.forEach((one, index) => {
        resource.bind([one.id, one.hex, index, one.type, one.origin]).stepReset()
      })
    } finally {
      resource.finalize()
    }

    db.exec('DELETE FROM road')
    const road = db.prepare('INSERT INTO road (a, b) VALUES (?, ?)')
    try {
      for (const one of snapshot.roads) road.bind([one.a, one.b]).stepReset()
    } finally {
      road.finalize()
    }

    db.exec('DELETE FROM river')
    const river = db.prepare('INSERT INTO river (a, b) VALUES (?, ?)')
    try {
      for (const one of snapshot.rivers) river.bind([one.a, one.b]).stepReset()
    } finally {
      river.finalize()
    }

    db.exec('DELETE FROM resource_chance')
    const chance = db.prepare('INSERT INTO resource_chance (terrain, chance) VALUES (?, ?)')
    try {
      for (const [terrain, odds] of Object.entries(snapshot.resourceChances)) {
        chance.bind([terrain, odds]).stepReset()
      }
    } finally {
      chance.finalize()
    }

    db.exec('DELETE FROM fog_edit')
    const fogEdit = db.prepare('INSERT INTO fog_edit (hex, revealed) VALUES (?, ?)')
    try {
      for (const one of snapshot.fogEdits) fogEdit.bind([one.hex, flag(one.revealed)]).stepReset()
    } finally {
      fogEdit.finalize()
    }

    db.exec('DELETE FROM encounter_override')
    const encounterOverride = db.prepare(
      'INSERT INTO encounter_override (ord, payload) VALUES (?, ?)',
    )
    try {
      snapshot.encounterOverrides.forEach((one, index) => {
        encounterOverride.bind([index, JSON.stringify(one)]).stepReset()
      })
    } finally {
      encounterOverride.finalize()
    }

    db.exec('DELETE FROM terrain_override')
    const override = db.prepare('INSERT INTO terrain_override (hex, terrain) VALUES (?, ?)')
    try {
      for (const one of snapshot.terrainOverrides) override.bind([one.hex, one.terrain]).stepReset()
    } finally {
      override.finalize()
    }
  })
}

export function loadSnapshot(db: Database): MapSnapshot | null {
  const row = db.selectObject('SELECT * FROM map WHERE id = 1')
  if (!row) return null

  const entities: Entity[] = db.selectObjects('SELECT * FROM entity ORDER BY ord').map((one) => ({
    id: String(one.id),
    name: String(one.name),
    kind: String(one.kind) as EntityKind,
    owner: String(one.owner) as Owner,
    color: String(one.color),
    pacePerTurn: Number(one.pace),
    sight: Number(one.sight),
    hidden: Number(one.hidden) === 1,
  }))

  return {
    terrain: {
      seed: Number(row.seed),
      scale: Number(row.scale),
      seaLevel: Number(row.sea_level),
      relief: Number(row.relief),
    },
    worldRadius: Number(row.world_radius),
    fog: Number(row.fog) === 1,
    showSight: Number(row.show_sight) === 1,
    showHistory: Number(row.show_history) === 1,
    dmView: Number(row.dm_view) === 1,
    turn: Number(row.turn),
    selectedId: String(row.selected_id ?? entities[0]?.id ?? ''),
    entities,
    origins: db.selectObjects('SELECT * FROM origin').map((one) => ({
      entityId: String(one.entity_id),
      turn: Number(one.turn),
      hex: String(one.hex) as HexKey,
    })),
    record: db.selectObjects('SELECT * FROM action ORDER BY turn, entity_id').map((one) => ({
      turn: Number(one.turn),
      entityId: String(one.entity_id),
      kind: String(one.kind) as ActionKind,
      from: hexOrNull(one.from_hex),
      to: hexOrNull(one.to_hex),
      entered: splitHexes(one.entered),
      spent: Number(one.spent),
      carry: Number(one.carry),
    })),
    states: db.selectObjects('SELECT * FROM entity_turn ORDER BY turn, entity_id').map((one) => ({
      turn: Number(one.turn),
      entityId: String(one.entity_id),
      at: hexOrNull(one.hex),
      carry: Number(one.carry),
      pending: splitHexes(one.pending),
      waypoints: splitHexes(one.waypoints),
      riding: typeof one.riding === 'string' ? one.riding : null,
    })),
    queue: db.selectObjects('SELECT * FROM queued_action').map((one) => {
      const kind = String(one.kind) as ActionKind
      const action: Action =
        kind === 'move'
          ? { kind, route: splitHexes(one.route), waypoints: splitHexes(one.waypoints) }
          : { kind: kind as 'wait' | 'camp' }
      return { entityId: String(one.entity_id), action }
    }),
    supplies: db.selectObjects('SELECT * FROM supply ORDER BY entity_id, turn').map((one) => ({
      turn: Number(one.turn),
      entityId: String(one.entity_id),
      food: Number(one.food),
      gold: Number(one.gold),
    })),
    notes: db.selectObjects('SELECT * FROM hex_note').map((one) => ({
      hex: String(one.hex) as HexKey,
      text: String(one.text),
    })),
    events: db.selectObjects('SELECT * FROM hex_event ORDER BY ord').map((one) => ({
      hex: String(one.hex) as HexKey,
      id: String(one.id),
      title: String(one.title),
      description: String(one.description),
      ...(one.turn === null ? {} : { turn: Number(one.turn) }),
    })),
    locations: db.selectObjects('SELECT * FROM hex_location ORDER BY ord').map((one) => ({
      hex: String(one.hex) as HexKey,
      id: String(one.id),
      name: String(one.name),
      kind: String(one.kind),
      description: String(one.description),
    })),
    merchants: db.selectObjects('SELECT * FROM merchant ORDER BY ord').map((one) => ({
      id: String(one.id),
      caravanId: String(one.caravan_id),
      name: String(one.name),
      type: String(one.type) as MerchantType,
      level: Number(one.level),
    })),
    items: db.selectObjects('SELECT * FROM item ORDER BY ord').map((one) => ({
      id: String(one.id),
      ownerId: String(one.owner_id),
      name: String(one.name),
      quantity: Number(one.quantity),
      notes: String(one.notes),
      weight: one.weight === null ? null : Number(one.weight),
    })),
    catalogOverrides: db.selectObjects('SELECT * FROM catalog_override ORDER BY ord').map(
      (one) =>
        ({
          ...(JSON.parse(String(one.payload)) as object),
          id: String(one.id),
        }) as CatalogOverride,
    ),
    resources: db.selectObjects('SELECT * FROM resource ORDER BY ord').map((one) => ({
      id: String(one.id),
      hex: String(one.hex) as HexKey,
      type: String(one.type) as ResourceType,
      origin: String(one.origin) as ResourceOrigin,
    })),
    // A save from before resources has no odds written down; those terrains
    // fall back to the default rather than to never.
    resourceChances: {
      ...defaultResourceChances(),
      ...Object.fromEntries(
        db
          .selectObjects('SELECT * FROM resource_chance')
          .map((one) => [String(one.terrain) as TerrainId, Number(one.chance)]),
      ),
    },
    resourceSpacing: Number(row.resource_spacing),
    fogEdits: db.selectObjects('SELECT * FROM fog_edit').map((one) => ({
      hex: String(one.hex) as HexKey,
      revealed: Number(one.revealed) === 1,
    })),
    encounterOverrides: db
      .selectObjects('SELECT payload FROM encounter_override ORDER BY ord')
      .map((one) => JSON.parse(String(one.payload)) as EncounterOverride),
    roads: db.selectObjects('SELECT * FROM road ORDER BY a, b').map((one) => ({
      a: String(one.a) as HexKey,
      b: String(one.b) as HexKey,
    })),
    rivers: db.selectObjects('SELECT * FROM river ORDER BY a, b').map((one) => ({
      a: String(one.a) as HexKey,
      b: String(one.b) as HexKey,
    })),
    terrainOverrides: db
      .selectObjects('SELECT * FROM terrain_override ORDER BY hex')
      .map((one) => ({
        hex: String(one.hex) as HexKey,
        terrain: String(one.terrain) as TerrainId,
      })),
  }
}
