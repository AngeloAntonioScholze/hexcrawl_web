import type { Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Entity } from '../entities/entity'
import type { HexKey } from '../hex/coords'
import { DEFAULT_RESOURCE_SPACING, defaultResourceChances } from '../terrain/resources'
import { loadSnapshot, saveSnapshot, type MapSnapshot } from './mapState'
import { migrate, schemaVersion, SCHEMA_VERSION } from './schema'
import { openMemoryDatabase } from './sqlite'

const party: Entity = {
  id: 'party-1',
  name: 'the party',
  kind: 'party',
  owner: 'player',
  color: '#e0b25a',
  pacePerTurn: 1,
  sight: 5,
  hidden: false,
}

const caravan: Entity = {
  id: 'caravan-1',
  name: 'the caravan',
  kind: 'caravan',
  owner: 'dm',
  color: '#6fa8dc',
  pacePerTurn: 0.5,
  sight: 4,
  hidden: true,
}

const snapshot = (patch: Partial<MapSnapshot> = {}): MapSnapshot => ({
  terrain: { seed: 4242, scale: 65, seaLevel: -0.15, relief: 9.5 },
  worldRadius: 150,
  fog: false,
  showSight: true,
  showHistory: true,
  dmView: false,
  turn: 2,
  selectedId: party.id,
  entities: [party, caravan],
  origins: [{ entityId: party.id, turn: 0, hex: '0,0' as HexKey }],
  record: [
    {
      turn: 0,
      entityId: party.id,
      kind: 'move',
      from: '0,0' as HexKey,
      to: '1,0' as HexKey,
      entered: ['1,0'] as HexKey[],
      spent: 1,
      carry: 0,
    },
    {
      turn: 1,
      entityId: party.id,
      kind: 'move',
      from: '1,0' as HexKey,
      to: '1,-1' as HexKey,
      entered: ['1,-1'] as HexKey[],
      spent: 1,
      carry: 0,
    },
  ],
  states: [
    {
      turn: 0,
      entityId: party.id,
      at: '1,0' as HexKey,
      carry: 0,
      pending: ['1,-1'] as HexKey[],
      waypoints: ['1,-1'] as HexKey[],
      riding: null,
    },
    {
      turn: 1,
      entityId: party.id,
      at: '1,-1' as HexKey,
      carry: 0,
      pending: [],
      waypoints: [],
      riding: caravan.id,
    },
  ],
  queue: [
    {
      entityId: party.id,
      action: {
        kind: 'move',
        route: ['1,-1', '2,-1', '3,-1'] as HexKey[],
        waypoints: ['2,-1', '3,-1'] as HexKey[],
      },
    },
  ],
  notes: [
    { hex: '0,0' as HexKey, text: 'ruined watchtower' },
    { hex: '1,0' as HexKey, text: 'smells of smoke' },
  ],
  events: [
    { hex: '1,0' as HexKey, id: 'event-2', title: 'ambush', description: 'goblins' },
    { hex: '1,0' as HexKey, id: 'event-1', title: 'storm', description: 'a long night' },
    { hex: '0,0' as HexKey, id: 'event-3', title: 'omen', description: '' },
  ],
  locations: [
    { hex: '0,0' as HexKey, id: 'loc-b', name: 'Oakvale', kind: 'village', description: 'quiet' },
    { hex: '0,0' as HexKey, id: 'loc-a', name: 'the well', kind: 'landmark', description: '' },
  ],
  merchants: [
    { id: 'merchant-b', caravanId: caravan.id, name: 'Bram', type: 'smith', level: 10 },
    { id: 'merchant-a', caravanId: caravan.id, name: 'Mira', type: 'doctor', level: 1 },
  ],
  resources: [
    { id: 'res-2', hex: '2,0' as HexKey, type: 'timber', origin: 'generated' },
    { id: 'res-1', hex: '-3,1' as HexKey, type: 'iron', origin: 'manual' },
  ],
  resourceChances: { ...defaultResourceChances(), forest: 0.2, peaks: 0 },
  resourceSpacing: 6,
  fogEdits: [
    { hex: '4,-2' as HexKey, revealed: true },
    { hex: '0,0' as HexKey, revealed: false },
  ],
  ...patch,
})

let db: Database

beforeEach(async () => {
  db = await openMemoryDatabase()
  migrate(db)
})

describe('schema', () => {
  it('stamps the database with the version it migrated to', () => {
    expect(schemaVersion(db)).toBe(SCHEMA_VERSION)
  })

  // The save file in a browser predates each new table, so the walk forward
  // from an older version has to keep working, not just a build from scratch.
  it('carries an older database forward', async () => {
    const old = await openMemoryDatabase()
    old.exec(`
      CREATE TABLE map (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        seed INTEGER NOT NULL, scale REAL NOT NULL, sea_level REAL NOT NULL, relief REAL NOT NULL,
        start_hex TEXT, goal_hex TEXT, allow_water INTEGER NOT NULL, fog INTEGER NOT NULL,
        show_sight INTEGER NOT NULL, sight INTEGER NOT NULL, speed INTEGER NOT NULL
      );
      CREATE TABLE explored (hex TEXT PRIMARY KEY) WITHOUT ROWID;
      INSERT INTO map VALUES (1, 7, 55, 0, 7, '1,1', NULL, 0, 1, 0, 5, 0);
      INSERT INTO explored VALUES ('1,1');
      PRAGMA user_version = 1;
    `)

    migrate(old)

    expect(schemaVersion(old)).toBe(SCHEMA_VERSION)
    const loaded = loadSnapshot(old)!
    expect(loaded.terrain.seed).toBe(7)
    expect(loaded.worldRadius).toBe(150)
    expect(loaded.turn).toBe(0)
    expect(loaded.entities).toEqual([])
    expect(loaded.record).toEqual([])
    expect(loaded.merchants).toEqual([])
    expect(loaded.resources).toEqual([])
    expect(loaded.resourceChances).toEqual(defaultResourceChances())
    expect(loaded.resourceSpacing).toBe(DEFAULT_RESOURCE_SPACING)
    expect(loaded.fogEdits).toEqual([])

    saveSnapshot(old, snapshot())
    expect(loadSnapshot(old)!.turn).toBe(2)
  })

  it('leaves an already current database alone', () => {
    saveSnapshot(db, snapshot())
    migrate(db)

    expect(loadSnapshot(db)?.turn).toBe(2)
  })
})

describe('map state', () => {
  it('has nothing to load out of a fresh database', () => {
    expect(loadSnapshot(db)).toBeNull()
  })

  it('round-trips every field of a session', () => {
    const saved = snapshot()
    saveSnapshot(db, saved)

    const loaded = loadSnapshot(db)!

    expect(loaded.terrain).toEqual(saved.terrain)
    expect(loaded.worldRadius).toBe(150)
    expect(loaded.fog).toBe(false)
    expect(loaded.showSight).toBe(true)
    expect(loaded.showHistory).toBe(true)
    expect(loaded.dmView).toBe(false)
    expect(loaded.turn).toBe(2)
    expect(loaded.selectedId).toBe(party.id)
    expect(loaded.entities).toEqual(saved.entities)
    expect(loaded.origins).toEqual(saved.origins)
    expect(loaded.record).toEqual(saved.record)
    expect(loaded.states).toEqual(saved.states)
    expect(loaded.queue).toEqual(saved.queue)
  })

  it('round-trips a ship and the party riding in it', () => {
    const ship: Entity = { ...caravan, id: 'ship-1', kind: 'ship', pacePerTurn: 3, sight: 7 }
    const saved = snapshot({
      entities: [party, ship],
      states: [
        {
          turn: 0,
          entityId: party.id,
          at: '1,0' as HexKey,
          carry: 0,
          pending: [],
          waypoints: [],
          riding: ship.id,
        },
      ],
    })
    saveSnapshot(db, saved)

    const loaded = loadSnapshot(db)!

    expect(loaded.entities).toEqual([party, ship])
    expect(loaded.states).toEqual(saved.states)
  })

  it('keeps a crawl that has not started yet', () => {
    saveSnapshot(db, snapshot({ turn: 0, origins: [], record: [], states: [], queue: [] }))

    const loaded = loadSnapshot(db)!

    expect(loaded.turn).toBe(0)
    expect(loaded.origins).toEqual([])
    expect(loaded.record).toEqual([])
    expect(loaded.queue).toEqual([])
  })

  it('replaces the last save rather than piling up beside it', () => {
    saveSnapshot(db, snapshot())
    saveSnapshot(db, snapshot({ turn: 5 }))

    expect(db.selectValue('SELECT count(*) FROM map')).toBe(1)
    expect(loadSnapshot(db)!.turn).toBe(5)
  })

  // A rewind cuts the record back, so a save that only ever added rows would
  // hand a crawl back the future it had turned away from.
  it('lets the record shrink when the crawl is wound back', () => {
    saveSnapshot(db, snapshot())
    const shorter = snapshot()
    saveSnapshot(db, {
      ...shorter,
      turn: 1,
      record: shorter.record.slice(0, 1),
      states: shorter.states.slice(0, 1),
    })

    const loaded = loadSnapshot(db)!
    expect(loaded.record).toHaveLength(1)
    expect(loaded.states).toHaveLength(1)
    expect(db.selectValue('SELECT count(*) FROM turn')).toBe(1)
  })

  it('round-trips what each hex holds, keeping the order things were added', () => {
    const saved = snapshot()
    saveSnapshot(db, saved)

    const loaded = loadSnapshot(db)!

    expect(loaded.notes).toEqual(expect.arrayContaining([...saved.notes]))
    expect(loaded.notes).toHaveLength(saved.notes.length)
    expect(loaded.events).toEqual(saved.events)
    expect(loaded.locations).toEqual(saved.locations)
  })

  it('round-trips the resources in the order they were placed, and their odds', () => {
    const saved = snapshot()
    saveSnapshot(db, saved)

    const loaded = loadSnapshot(db)!

    expect(loaded.resources).toEqual(saved.resources)
    expect(loaded.resourceChances).toEqual(saved.resourceChances)
    expect(loaded.resourceSpacing).toBe(6)
  })

  it("round-trips the DM's fog edits, and lets them be cleared", () => {
    saveSnapshot(db, snapshot())
    const loaded = loadSnapshot(db)!.fogEdits
    expect(loaded).toHaveLength(2)
    expect(loaded).toEqual(expect.arrayContaining([...snapshot().fogEdits]))

    saveSnapshot(db, snapshot({ fogEdits: [] }))
    expect(loadSnapshot(db)!.fogEdits).toEqual([])
  })

  it('lets the resources be cleared off the map', () => {
    saveSnapshot(db, snapshot())
    saveSnapshot(db, snapshot({ resources: [] }))

    expect(loadSnapshot(db)!.resources).toEqual([])
  })

  it('keeps a map with nothing written on it', () => {
    saveSnapshot(db, snapshot())
    saveSnapshot(db, snapshot({ notes: [], events: [], locations: [] }))

    const loaded = loadSnapshot(db)!

    expect(loaded.notes).toEqual([])
    expect(loaded.events).toEqual([])
    expect(loaded.locations).toEqual([])
  })

  it('round-trips a caravan crew in the order it was taken on', () => {
    const saved = snapshot()
    saveSnapshot(db, saved)

    expect(loadSnapshot(db)!.merchants).toEqual(saved.merchants)

    saveSnapshot(db, snapshot({ merchants: [] }))
    expect(loadSnapshot(db)!.merchants).toEqual([])
  })

  it('keeps the record in the order the turns were spent', () => {
    saveSnapshot(db, snapshot())

    expect(loadSnapshot(db)!.record.map((row) => row.turn)).toEqual([0, 1])
  })
})
