import { Color3 } from '@babylonjs/core/Maths/math.color'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_ENCOUNTERS } from '../encounters/tables'
import { DEFAULT_CATALOG } from '../entities/catalog'
import { hexKey, range, type Axial, type HexKey } from '../hex/coords'
import { parseMapFile, serialiseMap } from '../persistence/mapFile'
import { loadSnapshot, saveSnapshot } from '../persistence/mapState'
import { migrate } from '../persistence/schema'
import { openMemoryDatabase } from '../persistence/sqlite'
import { TERRAIN_DEFAULTS, type TerrainTile } from '../terrain/terrain'
import { TURNS_PER_PHASE } from '../time/clock'
import { useHexMapStore } from './hexMap'
import type { JournalChange } from './journal'

const tile = (hex: Axial): TerrainTile => ({
  hex,
  terrain: 'grass',
  height: 1,
  level: 1,
  elevation: 1.5,
  color: new Color3(0, 0, 0),
})

type Store = ReturnType<typeof useHexMapStore>

const setup = (): Store => {
  const store = useHexMapStore()
  store.setTiles(new Map(range({ q: 0, r: 0 }, 6).map((hex) => [hexKey(hex), tile(hex)])))
  return store
}

const party = (store: Store): string => store.entities[0].id

/** Puts the party down and sends it east, one entry each. */
const sendEast = (store: Store, distance = 3): void => {
  store.select({ q: 0, r: 0 })
  store.select({ q: distance, r: 0 })
}

const last = (store: Store) => store.journal[store.journal.length - 1]

const changesTo = (store: Store, target: string): JournalChange[] =>
  last(store).changes.filter((one) => one.target === target)

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('the journal records', () => {
  it('starts empty', () => {
    expect(setup().journal).toEqual([])
  })

  it('a new entity as one entry holding the whole record', () => {
    const store = setup()
    const made = store.addEntity('scouts', 'npc', 'dm')!

    expect(store.journal).toHaveLength(1)
    expect(last(store)).toMatchObject({ who: { role: 'dm' }, cause: 'action', turn: 0 })
    expect(last(store).changes).toEqual([
      {
        target: 'entities',
        key: made.id,
        at: 1,
        old: null,
        new: expect.objectContaining({ name: 'scouts', kind: 'npc', owner: 'dm' }),
      },
    ])
  })

  it('an edit to one field as that field alone', () => {
    const store = setup()
    store.renameEntity(party(store), 'heroes')

    expect(last(store).changes).toEqual([
      { target: 'entities', key: party(store), field: 'name', old: 'the party', new: 'heroes' },
    ])
  })

  it('a burst of edits to one note as one entry, from the first value to the last', () => {
    const store = setup()
    store.setNote('1,1' as HexKey, 'a')
    store.setNote('1,1' as HexKey, 'ab')

    expect(store.journal).toHaveLength(1)
    expect(last(store).changes).toEqual([{ target: 'notes', key: '1,1', old: null, new: 'ab' }])
  })

  it('a removed entity with what went with it', () => {
    const store = setup()
    const id = party(store)
    sendEast(store)
    store.removeEntity(id)

    const targets = last(store).changes.map((one) => one.target)
    expect(targets).toEqual(expect.arrayContaining(['entities', 'origins', 'queue']))
    expect(changesTo(store, 'entities')[0]).toMatchObject({ key: id, old: { name: 'the party' } })
  })

  it('placing and ordering as one entry each', () => {
    const store = setup()
    sendEast(store)

    expect(store.journal).toHaveLength(2)
    expect(store.journal[0].changes).toContainEqual({
      target: 'origins',
      key: party(store),
      old: null,
      new: { turn: 0, hex: '0,0' },
    })
    expect(changesTo(store, 'queue')[0]).toMatchObject({ key: party(store), old: null })
  })

  it('nothing for a step that only moved the road pen', () => {
    const store = setup()
    store.setDmTool('road')
    store.click({ q: 0, r: 0 })

    expect(store.canUndo).toBe(true)
    expect(store.journal).toEqual([])
  })

  it('a road drawn as its new stretches', () => {
    const store = setup()
    store.setDmTool('road')
    store.click({ q: 0, r: 0 })
    store.click({ q: 2, r: 0 })

    expect(store.journal).toHaveLength(1)
    expect(last(store).changes.every((one) => one.target === 'roads' && one.new === true)).toBe(
      true,
    )
  })

  it('a whole brush stroke as one entry', () => {
    const store = setup()
    store.setDmTool('paint')
    store.setPaintTerrain('forest')
    store.setBrushSize(0)
    store.startStroke({ q: 0, r: 0 })
    store.continueStroke({ q: 1, r: 0 })
    store.continueStroke({ q: 2, r: 0 })
    store.endStroke()

    expect(store.journal).toHaveLength(1)
    expect(last(store).changes).toEqual(
      ['0,0', '1,0', '2,0'].map((key) => ({
        target: 'terrainOverrides',
        key,
        old: null,
        new: 'forest',
      })),
    )
  })

  it('an undo and a redo as entries of their own, each the other way round', () => {
    const store = setup()
    store.renameEntity(party(store), 'heroes')
    store.undo()
    store.redo()

    expect(store.journal.map((one) => one.cause)).toEqual(['action', 'undo', 'redo'])
    expect(store.journal[1].changes).toEqual([
      { target: 'entities', key: party(store), field: 'name', old: 'heroes', new: 'the party' },
    ])
    expect(store.journal[2].changes).toEqual(store.journal[0].changes)
  })

  it('who made the change: a player acting from afar is named with what they play', () => {
    const store = setup()
    const id = party(store)
    store.assignEntity(id, 'Mira')
    store.actAs(store.playerViewer('Mira'), () => store.queueAction(id, { kind: 'camp' }))

    expect(last(store).who).toEqual({ role: 'player', plays: [id] })
    expect(last(store).changes).toEqual([
      { target: 'queue', key: id, old: null, new: { kind: 'camp' } },
    ])
  })
})

describe('the journal records what cannot be undone', () => {
  it('a turn passing, as the turn before it', () => {
    const store = setup()
    sendEast(store)
    store.advanceTurn()

    expect(store.journal).toHaveLength(3)
    expect(last(store).turn).toBe(0)
    expect(changesTo(store, 'turn')).toEqual([{ target: 'turn', old: 0, new: 1 }])
    expect(changesTo(store, 'frames')).toEqual([{ target: 'frames', at: 0, old: [], new: 1 }])
    expect(changesTo(store, 'queue')[0]).toMatchObject({ key: party(store), new: null })
  })

  it('a skipped phase as one entry', () => {
    const store = setup()
    store.skipPhase()

    expect(store.journal).toHaveLength(1)
    expect(changesTo(store, 'turn')).toEqual([{ target: 'turn', old: 0, new: TURNS_PER_PHASE }])
    expect(changesTo(store, 'frames')).toEqual([
      { target: 'frames', at: 0, old: [], new: TURNS_PER_PHASE },
    ])
  })

  it('winding back and going to a turn', () => {
    const store = setup()
    store.advanceTurn()
    store.advanceTurn()
    store.rewindTurn()
    expect(changesTo(store, 'turn')).toEqual([{ target: 'turn', old: 2, new: 1 }])

    store.goToTurn(2)
    expect(changesTo(store, 'turn')).toEqual([{ target: 'turn', old: 1, new: 2 }])
    expect(store.journal).toHaveLength(4)
  })

  it('a turn cut off by an order after a rewind, written out in full', () => {
    const store = setup()
    sendEast(store)
    store.advanceTurn()
    store.rewindTurn()
    store.queueAction(party(store), { kind: 'camp' })

    const [cut] = changesTo(store, 'frames')
    expect(cut).toMatchObject({ at: 0, new: 0 })
    expect(cut.old).toEqual([
      expect.objectContaining({
        records: [expect.objectContaining({ entityId: party(store), kind: 'move' })],
      }),
    ])
  })

  it('the crawl wiped, with what it held', () => {
    const store = setup()
    sendEast(store)
    store.advanceTurn()
    store.clearHistory()

    expect(changesTo(store, 'turn')).toEqual([{ target: 'turn', old: 1, new: 0 }])
    expect(changesTo(store, 'origins')[0]).toMatchObject({ key: party(store), new: null })
    expect((changesTo(store, 'frames')[0].old as unknown[]).length).toBe(1)
  })

  it('seating a player, and taking the token back', () => {
    const store = setup()
    const id = party(store)
    store.assignEntity(id, 'Mira')
    expect(store.journal).toHaveLength(1)
    expect(changesTo(store, 'seats')).toEqual([
      { target: 'seats', at: 0, old: [], new: [{ name: 'Mira', entityId: id }] },
    ])

    store.setEntityOwner(id, 'dm')
    expect(store.journal).toHaveLength(2)
    expect(changesTo(store, 'entities')).toEqual([
      { target: 'entities', key: id, field: 'owner', old: 'player', new: 'dm' },
    ])
    expect(changesTo(store, 'seats')[0]).toMatchObject({ old: [{ name: 'Mira' }], new: [] })
  })

  it('a new world as one entry, with what it wiped', () => {
    const store = setup()
    store.setNote('1,1' as HexKey, 'a well')
    store.setTerrain({ seed: 7 })
    store.setTerrain({ seed: 8 })

    expect(store.journal).toHaveLength(2)
    expect(changesTo(store, 'terrain')).toEqual([
      { target: 'terrain', field: 'seed', old: TERRAIN_DEFAULTS.seed, new: 8 },
    ])
    expect(changesTo(store, 'notes')).toEqual([
      { target: 'notes', key: '1,1', old: 'a well', new: null },
    ])
  })

  it('a reseed and a new world size', () => {
    const store = setup()
    store.reseed()
    expect(changesTo(store, 'terrain')[0]).toMatchObject({ field: 'seed' })

    store.setWorldSize('small')
    expect(store.journal).toHaveLength(2)
    expect(changesTo(store, 'worldRadius')).toEqual([{ target: 'worldRadius', old: 150, new: 60 }])
  })
})

describe('the journal travels with the map', () => {
  const played = (): Store => {
    const store = setup()
    sendEast(store)
    store.advanceTurn()
    store.setNote('2,2' as HexKey, 'ruins')
    return store
  }

  it('comes back with a restored map, and the restore writes nothing', () => {
    const saved = played().snapshot
    setActivePinia(createPinia())
    const fresh = setup()
    fresh.restore(saved)

    expect(fresh.journal).toEqual(saved.journal)
    fresh.renameEntity(party(fresh), 'heroes')
    expect(fresh.journal).toHaveLength(saved.journal.length + 1)
  })

  it('survives a save and load', async () => {
    const store = played()
    const db = await openMemoryDatabase()
    migrate(db)
    saveSnapshot(db, store.snapshot)

    expect(loadSnapshot(db)!.journal).toEqual(store.journal)
  })

  it('survives an export and import', () => {
    const store = played()
    const result = parseMapFile(serialiseMap(store.snapshot))
    if (!result.ok) throw new Error(result.error)

    setActivePinia(createPinia())
    const fresh = setup()
    fresh.restore(result.snapshot)
    expect(fresh.journal).toEqual(store.journal)
  })

  it('opens empty from a file written before it', () => {
    const file = JSON.parse(serialiseMap(played().snapshot))
    delete file.map.journal
    const result = parseMapFile(JSON.stringify(file))
    if (!result.ok) throw new Error(result.error)

    const store = setup()
    store.restore(result.snapshot)
    expect(store.journal).toEqual([])
  })

  it('stays small: an order and a turn every turn for a hundred turns', () => {
    const store = setup()
    store.select({ q: 0, r: 0 })
    for (let at = 0; at < 100; at++) {
      store.select({ q: at % 2 === 0 ? 3 : 0, r: 0 })
      store.advanceTurn()
    }

    expect(store.turn).toBe(100)
    expect(store.journal).toHaveLength(201)
    expect(JSON.stringify(store.journal).length).toBeLessThan(80_000)
  })

  it("stays small: a caravan's stores set and a turn every turn for a hundred turns", () => {
    const store = setup()
    const caravan = store.addEntity('wagons', 'caravan', 'dm')!.id
    for (let at = 0; at < 100; at++) {
      store.setSupply(caravan, 'food', at % 100)
      store.advanceTurn()
    }

    const sizes = store.journal.map((one) => JSON.stringify(one).length)
    expect(store.journal).toHaveLength(201)
    expect(sizes.reduce((sum, one) => sum + one, 0)).toBeLessThan(60_000)
    // Each edit costs the same, however long the caravan's ledger has grown.
    expect(sizes[sizes.length - 2]).toBeLessThan(sizes[3] + 20)
  })
})

describe('every in-scope action writes exactly one entry', () => {
  interface Cast {
    party: string
    caravan: string
    npc: string
    rope: string
    merchant: string
  }

  const cast = (store: Store): Cast => {
    const hero = party(store)
    const caravan = store.addEntity('wagons', 'caravan', 'dm')!.id
    const npc = store.addEntity('spy', 'npc', 'dm')!.id
    store.selectEntity(caravan)
    store.select({ q: 0, r: 0 })
    store.selectEntity(hero)
    store.select({ q: 2, r: 0 })
    store.select({ q: 0, r: 0 })
    store.advanceTurn()
    store.advanceTurn()
    const rope = store.addItem(hero, { name: 'rope', quantity: 2 })!.id
    const merchant = store.addMerchant(caravan, 'smith')!.id
    return { party: hero, caravan, npc, rope, merchant }
  }

  const encounter = DEFAULT_ENCOUNTERS[0]
  const service = DEFAULT_CATALOG[0].id

  const fogClick = (store: Store, mode: 'reveal' | 'hide'): void => {
    store.setDmTool('fog')
    store.setFogMode(mode)
    store.setBrushSize(0)
    store.click({ q: 1, r: 1 })
  }

  it.each<[string, (store: Store, cast: Cast) => unknown, (cast: Cast) => Partial<JournalChange>]>([
    [
      'setSupply',
      (s, c) => s.setSupply(c.caravan, 'food', 10),
      (c) => ({ target: 'supplies', key: c.caravan, old: null }),
    ],
    [
      'setAbility',
      (s, c) => s.setAbility(c.party, 'strength', 15),
      (c) => ({
        target: 'abilities',
        key: c.party,
        old: null,
        new: expect.objectContaining({ strength: 15 }),
      }),
    ],
    [
      'setPurse',
      (s, c) => s.setPurse(c.party, 50),
      (c) => ({
        target: 'characters',
        key: c.party,
        old: null,
        new: expect.objectContaining({ purse: 50 }),
      }),
    ],
    [
      'setLevel',
      (s, c) => s.setLevel(c.party, 4),
      (c) => ({
        target: 'characters',
        key: c.party,
        old: null,
        new: expect.objectContaining({ level: 4 }),
      }),
    ],
    [
      'addItem',
      (s, c) => s.addItem(c.party, { name: 'torch' }),
      () => ({ target: 'items', old: null, new: expect.objectContaining({ name: 'torch' }) }),
    ],
    [
      'editItem',
      (s, c) => s.editItem(c.rope, { quantity: 3 }),
      (c) => ({ target: 'items', key: c.rope, field: 'quantity', old: 2, new: 3 }),
    ],
    [
      'transferItem',
      (s, c) => s.transferItem(c.rope, c.caravan, 1),
      (c) => ({ target: 'items', key: c.rope, field: 'quantity', old: 2, new: 1 }),
    ],
    [
      'removeItem',
      (s, c) => s.removeItem(c.rope),
      (c) => ({ target: 'items', key: c.rope, new: null }),
    ],
    [
      'addMerchant',
      (s, c) => s.addMerchant(c.caravan, 'cook'),
      () => ({ target: 'merchants', old: null, new: expect.objectContaining({ type: 'cook' }) }),
    ],
    [
      'renameMerchant',
      (s, c) => s.renameMerchant(c.merchant, 'Bo'),
      (c) => ({ target: 'merchants', key: c.merchant, field: 'name', new: 'Bo' }),
    ],
    [
      'setMerchantLevel',
      (s, c) => s.setMerchantLevel(c.merchant, 4),
      (c) => ({ target: 'merchants', key: c.merchant, field: 'level', new: 4 }),
    ],
    [
      'removeMerchant',
      (s, c) => s.removeMerchant(c.merchant),
      (c) => ({ target: 'merchants', key: c.merchant, new: null }),
    ],
    [
      'editCatalogEntry',
      (s) => s.editCatalogEntry(service, { price: '9 gp' }),
      () => ({
        target: 'catalogOverrides',
        key: service,
        old: null,
        new: expect.objectContaining({ op: 'edit' }),
      }),
    ],
    [
      'removeCatalogEntry',
      (s) => s.removeCatalogEntry(service),
      () => ({
        target: 'catalogOverrides',
        key: service,
        old: null,
        new: { id: service, op: 'remove' },
      }),
    ],
    [
      'addCatalogEntry',
      (s) => s.addCatalogEntry('smith', { name: 'nails' }),
      () => ({
        target: 'catalogOverrides',
        old: null,
        new: expect.objectContaining({ op: 'add' }),
      }),
    ],
    [
      'addResource',
      (s) => s.addResource('1,1' as HexKey, 'herbs'),
      () => ({
        target: 'resources',
        old: null,
        new: expect.objectContaining({ hex: '1,1', type: 'herbs' }),
      }),
    ],
    [
      'generateResources',
      (s) => s.generateResources(42),
      () => ({
        target: 'resources',
        old: null,
        new: expect.objectContaining({ origin: 'generated' }),
      }),
    ],
    [
      'setResourceChance',
      (s) => s.setResourceChance('grass', 0.5),
      () => ({ target: 'resourceChances', field: 'grass', new: 0.5 }),
    ],
    [
      'setResourceSpacing',
      (s) => s.setResourceSpacing(8),
      () => ({ target: 'resourceSpacing', new: 8 }),
    ],
    [
      'fog reveal',
      (s) => fogClick(s, 'reveal'),
      () => ({ target: 'fogEdits', key: '1,1', old: null, new: 'revealed' }),
    ],
    [
      'fog hide',
      (s) => fogClick(s, 'hide'),
      () => ({ target: 'fogEdits', key: '1,1', old: null, new: 'hidden' }),
    ],
    [
      'setRevealed',
      (s) => s.setRevealed(true),
      () => ({ target: 'revealed', old: false, new: true }),
    ],
    [
      'setPlayerReachCapped',
      (s) => s.setPlayerReachCapped(false),
      () => ({ target: 'playerReachCapped', old: true, new: false }),
    ],
    [
      'setEncounter',
      (s) => s.setEncounter(encounter.id, { weight: 9 }),
      () => ({
        target: 'encounterOverrides',
        at: 0,
        old: [],
        new: [{ kind: 'change', id: encounter.id, change: { weight: 9 } }],
      }),
    ],
    [
      'removeEncounter',
      (s) => s.removeEncounter(encounter.id),
      () => ({
        target: 'encounterOverrides',
        at: 0,
        old: [],
        new: [{ kind: 'remove', id: encounter.id }],
      }),
    ],
    [
      'addEncounter',
      (s) =>
        s.addEncounter({
          terrain: 'grass',
          when: 'any',
          weight: 1,
          title: 'a fox',
          description: '',
        }),
      () => ({ target: 'encounterOverrides', at: 0, old: [] }),
    ],
    [
      'acceptEncounter',
      (s) => s.acceptEncounter('1,1' as HexKey, encounter),
      () => ({
        target: 'events',
        key: '1,1',
        old: null,
        new: [expect.objectContaining({ title: encounter.title, turn: 2 })],
      }),
    ],
    [
      'addLocation',
      (s) => s.addLocation('1,1' as HexKey, { name: 'inn', kind: 'town', description: '' }),
      () => ({ target: 'locations', key: '1,1', old: null }),
    ],
    [
      'setEntityHidden',
      (s, c) => s.setEntityHidden(c.npc, false),
      (c) => ({ target: 'entities', key: c.npc, field: 'hidden', old: true, new: false }),
    ],
    [
      'setEntityHostile',
      (s, c) => s.setEntityHostile(c.npc, true),
      (c) => ({ target: 'entities', key: c.npc, field: 'hostile', old: false, new: true }),
    ],
    [
      'setPace',
      (s, c) => s.setPace(c.npc, 2),
      (c) => ({ target: 'entities', key: c.npc, field: 'pacePerTurn', new: 2 }),
    ],
    [
      'setDarkvision',
      (s, c) => s.setDarkvision(c.npc, true),
      (c) => ({ target: 'entities', key: c.npc, field: 'darkvision', old: false, new: true }),
    ],
    [
      'a river drawn',
      (s) => {
        s.setDmTool('river')
        s.click({ q: 0, r: 1 })
        s.click({ q: 1, r: 1 })
      },
      () => ({ target: 'rivers', old: null, new: true }),
    ],
  ])('%s', (_, act, expected) => {
    const store = setup()
    const roles = cast(store)
    const before = store.journal.length

    act(store, roles)

    expect(store.journal).toHaveLength(before + 1)
    const want = expected(roles)
    expect(last(store).changes).toContainEqual(expect.objectContaining(want))
  })
})
