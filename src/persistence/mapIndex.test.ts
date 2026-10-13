import type { Database } from '@sqlite.org/sqlite-wasm'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  addMap,
  cleanName,
  ensureFirstMap,
  ensureIndex,
  hasMap,
  importedName,
  lastOpened,
  LEGACY_MAP_ID,
  listMaps,
  mapFile,
  markOpened,
  neighbourOf,
  newMapId,
  nextMapName,
  removeMap,
  renameMap,
  touchMap,
  uniqueName,
} from './mapIndex'
import { openMemoryDatabase } from './sqlite'

describe('map names', () => {
  it('numbers new maps from the first free slot', () => {
    expect(nextMapName([])).toBe('map 1')
    expect(nextMapName(['map 1', 'map 3'])).toBe('map 2')
  })

  it('suffixes a name that is already taken', () => {
    expect(uniqueName('coast', [])).toBe('coast')
    expect(uniqueName('coast', ['coast', 'coast 2'])).toBe('coast 3')
  })

  it('tidies what was typed and refuses an empty name', () => {
    expect(cleanName('  the   north  ')).toBe('the north')
    expect(cleanName('   ')).toBeNull()
    expect(cleanName('x'.repeat(100))).toHaveLength(60)
  })

  it('names an import after its file', () => {
    expect(importedName('hexcrawl-4242.hexmap.json')).toBe('hexcrawl-4242')
    expect(importedName('old.JSON')).toBe('old')
    expect(importedName('.hexmap.json')).toBe('imported map')
  })

  it('keeps every map in a file of its own', () => {
    const id = newMapId()
    expect(id).not.toBe(newMapId())
    expect(mapFile(id)).toBe(`/${id}.sqlite3`)
    expect(mapFile(LEGACY_MAP_ID)).toBe('/hexcrawl.sqlite3')
  })
})

describe('neighbourOf', () => {
  const entry = (id: string) => ({ id, name: id, createdAt: 0, updatedAt: 0 })
  const maps = [entry('a'), entry('b'), entry('c')]

  it('falls back on the next map, or the one before the last', () => {
    expect(neighbourOf(maps, 'a')?.id).toBe('b')
    expect(neighbourOf(maps, 'c')?.id).toBe('b')
  })

  it('has nothing to fall back on with one map or an unknown one', () => {
    expect(neighbourOf([entry('a')], 'a')).toBeNull()
    expect(neighbourOf(maps, 'z')).toBeNull()
  })
})

describe('map index', () => {
  let db: Database

  beforeEach(async () => {
    db = await openMemoryDatabase()
    ensureIndex(db)
  })

  it('can be ensured twice', () => {
    addMap(db, 'a', 'map 1', 1)
    ensureIndex(db)
    expect(listMaps(db)).toHaveLength(1)
  })

  it('lists maps in the order they were made', () => {
    addMap(db, 'b', 'second', 20)
    addMap(db, 'a', 'first', 10)
    expect(listMaps(db)).toEqual([
      { id: 'a', name: 'first', createdAt: 10, updatedAt: 10 },
      { id: 'b', name: 'second', createdAt: 20, updatedAt: 20 },
    ])
  })

  it('renames, touches and removes', () => {
    addMap(db, 'a', 'first', 10)
    addMap(db, 'b', 'second', 20)
    renameMap(db, 'a', 'coast')
    touchMap(db, 'a', 99)
    removeMap(db, 'b')
    expect(listMaps(db)).toEqual([{ id: 'a', name: 'coast', createdAt: 10, updatedAt: 99 }])
    expect(hasMap(db, 'a')).toBe(true)
    expect(hasMap(db, 'b')).toBe(false)
  })

  it('reopens the map opened last', () => {
    expect(lastOpened(db)).toBeNull()
    addMap(db, 'a', 'first', 10)
    addMap(db, 'b', 'second', 20)
    expect(lastOpened(db)).toBe('a')
    markOpened(db, 'b', 30)
    expect(lastOpened(db)).toBe('b')
    markOpened(db, 'a', 40)
    expect(lastOpened(db)).toBe('a')
  })

  describe('ensureFirstMap', () => {
    it('adopts the save from before there was a list', () => {
      ensureFirstMap(db, [mapFile(LEGACY_MAP_ID)], 5, 'fresh')
      expect(listMaps(db)).toEqual([
        { id: LEGACY_MAP_ID, name: 'map 1', createdAt: 5, updatedAt: 5 },
      ])
      expect(lastOpened(db)).toBe(LEGACY_MAP_ID)
    })

    it('starts a fresh map when there is nothing to adopt', () => {
      ensureFirstMap(db, [], 5, 'fresh')
      expect(listMaps(db).map((one) => one.id)).toEqual(['fresh'])
    })

    it('leaves a list that already has maps alone', () => {
      addMap(db, 'a', 'first', 1)
      ensureFirstMap(db, [mapFile(LEGACY_MAP_ID)], 5, 'fresh')
      expect(listMaps(db).map((one) => one.id)).toEqual(['a'])
    })
  })
})
