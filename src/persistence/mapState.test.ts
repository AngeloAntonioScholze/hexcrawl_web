import type { Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Entity } from '../entities/entity'
import type { HexKey } from '../hex/coords'
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
  allowWater: true,
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
    { turn: 0, entityId: party.id, at: '1,0' as HexKey, carry: 0, pending: ['1,-1'] as HexKey[] },
    { turn: 1, entityId: party.id, at: '1,-1' as HexKey, carry: 0, pending: [] },
  ],
  queue: [{ entityId: party.id, action: { kind: 'move', route: ['1,-1', '2,-1'] as HexKey[] } }],
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
    expect(loaded.allowWater).toBe(true)
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

  it('keeps the record in the order the turns were spent', () => {
    saveSnapshot(db, snapshot())

    expect(loadSnapshot(db)!.record.map((row) => row.turn)).toEqual([0, 1])
  })
})
