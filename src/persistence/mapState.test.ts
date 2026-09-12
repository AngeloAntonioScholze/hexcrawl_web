import type { Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { HexKey } from '../hex/coords'
import { loadSnapshot, saveSnapshot, type MapSnapshot } from './mapState'
import { migrate, schemaVersion, SCHEMA_VERSION } from './schema'
import { openMemoryDatabase } from './sqlite'

const snapshot = (patch: Partial<MapSnapshot> = {}): MapSnapshot => ({
  terrain: { seed: 4242, scale: 65, seaLevel: -0.15, relief: 9.5 },
  start: '0,0',
  goal: '3,-1',
  allowWater: true,
  fog: false,
  showSight: true,
  showHistory: true,
  sight: 7,
  speed: 2,
  explored: ['0,0', '1,0', '1,-1'] as HexKey[],
  journey: [
    { hex: '0,0' as HexKey, km: 0, terrain: 'grass' as const },
    { hex: '1,0' as HexKey, km: 10, terrain: 'forest' as const },
    { hex: '1,-1' as HexKey, km: 20, terrain: 'mountains' as const },
  ],
  standing: 1,
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

  // The save file in a browser predates each new column, so the walk forward
  // from an older version has to keep working, not just a build from scratch.
  it('carries an older database forward without losing what it held', async () => {
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
    expect(loaded.start).toBe('1,1')
    expect(loaded.terrain.seed).toBe(7)
    expect(loaded.journey).toEqual([])
    expect(loaded.standing).toBeNull()
    expect(loaded.showHistory).toBe(false)

    saveSnapshot(old, snapshot())
    expect(loadSnapshot(old)!.standing).toBe(1)
  })

  it('leaves an already current database alone', () => {
    saveSnapshot(db, snapshot())
    migrate(db)

    expect(loadSnapshot(db)?.start).toBe('0,0')
  })
})

describe('map state', () => {
  it('has nothing to load out of a fresh database', () => {
    expect(loadSnapshot(db)).toBeNull()
  })

  it('round-trips every field of a session', () => {
    const saved = snapshot()
    saveSnapshot(db, saved)

    const loaded = loadSnapshot(db)

    expect(loaded).not.toBeNull()
    expect(loaded!.terrain).toEqual(saved.terrain)
    expect(loaded!.start).toBe('0,0')
    expect(loaded!.goal).toBe('3,-1')
    expect(loaded!.allowWater).toBe(true)
    expect(loaded!.fog).toBe(false)
    expect(loaded!.showSight).toBe(true)
    expect(loaded!.showHistory).toBe(true)
    expect(loaded!.sight).toBe(7)
    expect(loaded!.speed).toBe(2)
    expect([...loaded!.explored]).toEqual(['0,0', '1,-1', '1,0'])
    expect(loaded!.journey).toEqual(saved.journey)
    expect(loaded!.standing).toBe(1)
  })

  it('keeps a party that has not picked a route yet', () => {
    saveSnapshot(
      db,
      snapshot({ start: null, goal: null, explored: [], journey: [], standing: null }),
    )

    const loaded = loadSnapshot(db)!

    expect(loaded.start).toBeNull()
    expect(loaded.goal).toBeNull()
    expect([...loaded.explored]).toEqual([])
    expect(loaded.journey).toEqual([])
    expect(loaded.standing).toBeNull()
  })

  it('replaces the last save rather than piling up beside it', () => {
    saveSnapshot(db, snapshot())
    saveSnapshot(db, snapshot({ start: '5,5', explored: ['5,5'] as HexKey[] }))

    expect(db.selectValue('SELECT count(*) FROM map')).toBe(1)
    expect(loadSnapshot(db)!.start).toBe('5,5')
  })

  // forget() cuts the explored set back, so a save that only ever added rows
  // would quietly hand a wiped map its old memory back on the next reload.
  it('lets the explored set shrink', () => {
    saveSnapshot(db, snapshot())
    saveSnapshot(db, snapshot({ explored: ['1,0'] as HexKey[] }))

    expect([...loadSnapshot(db)!.explored]).toEqual(['1,0'])
  })

  // A new world starts the party's history over, so the log has to be able to
  // shrink and to keep the order it was written in either way.
  it('keeps the journey in the order it was walked', () => {
    saveSnapshot(db, snapshot())
    saveSnapshot(
      db,
      snapshot({
        journey: [
          { hex: '9,9' as HexKey, km: 0, terrain: 'sand' },
          { hex: '9,8' as HexKey, km: 10, terrain: 'grass' },
        ],
      }),
    )

    expect(loadSnapshot(db)!.journey.map((step) => step.hex)).toEqual(['9,9', '9,8'])
  })

  it('takes a Set straight from the store', () => {
    saveSnapshot(db, snapshot({ explored: new Set(['2,2', '0,1'] as HexKey[]) }))

    expect([...loadSnapshot(db)!.explored]).toEqual(['0,1', '2,2'])
  })
})
