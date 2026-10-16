import { Color3 } from '@babylonjs/core/Maths/math.color'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { hexKey, range, type HexKey } from '../hex/coords'
import { useHexMapStore } from '../stores/hexMap'
import { defaultResourceChances } from '../terrain/resources'
import type { TerrainTile } from '../terrain/terrain'
import { MAP_FILE_FORMAT, MAP_FILE_VERSION, parseMapFile, serialiseMap } from './mapFile'
import type { MapSnapshot } from './mapState'

const snapshot = (): MapSnapshot => ({
  terrain: { seed: 4242, scale: 65, seaLevel: -0.15, relief: 9.5 },
  worldRadius: 150,
  fog: true,
  revealed: false,
  fogSeeThrough: false,
  showSight: false,
  showHistory: true,
  dmView: false,
  turn: 1,
  selectedId: 'party-1',
  entities: [
    {
      id: 'party-1',
      name: 'the party',
      kind: 'party',
      owner: 'player',
      color: '#e0b25a',
      pacePerTurn: 1,
      sight: 5,
      hidden: false,
    },
    {
      id: 'ship-1',
      name: 'the ship',
      kind: 'ship',
      owner: 'dm',
      color: '#6fa8dc',
      pacePerTurn: 3,
      sight: 7,
      hidden: true,
    },
  ],
  origins: [{ entityId: 'party-1', turn: 0, hex: '0,0' as HexKey }],
  record: [
    {
      turn: 0,
      entityId: 'party-1',
      kind: 'move',
      from: '0,0' as HexKey,
      to: '1,0' as HexKey,
      entered: ['1,0'] as HexKey[],
      spent: 1,
      carry: 0.5,
    },
    {
      turn: 0,
      entityId: 'ship-1',
      kind: 'wait',
      from: null,
      to: null,
      entered: [],
      spent: 0,
      carry: 0,
    },
  ],
  states: [
    {
      turn: 0,
      entityId: 'party-1',
      at: '1,0' as HexKey,
      carry: 0.5,
      pending: ['2,-1'] as HexKey[],
      waypoints: ['2,-1'] as HexKey[],
      riding: 'ship-1',
    },
  ],
  queue: [
    {
      entityId: 'party-1',
      action: { kind: 'move', route: ['2,-1'] as HexKey[], waypoints: ['2,-1'] as HexKey[] },
    },
    { entityId: 'ship-1', action: { kind: 'camp' } },
  ],
  supplies: [{ entityId: 'party-1', turn: 1, food: 30, gold: 250 }],
  notes: [{ hex: '-3,2' as HexKey, text: 'ruined watchtower' }],
  events: [
    { hex: '1,0' as HexKey, id: 'event-1', title: 'ambush', description: 'goblins' },
    { hex: '0,0' as HexKey, id: 'event-2', title: 'wolves', description: '', turn: 3 },
  ],
  locations: [
    { hex: '0,0' as HexKey, id: 'loc-1', name: 'Oakvale', kind: 'village', description: '' },
  ],
  merchants: [{ id: 'merchant-1', caravanId: 'party-1', name: 'Bram', type: 'smith', level: 4 }],
  items: [
    { id: 'item-1', ownerId: 'party-1', name: 'rope', quantity: 2, notes: '', weight: 1.5 },
    { id: 'item-2', ownerId: 'party-1', name: 'map', quantity: 1, notes: 'torn', weight: null },
  ],
  catalogOverrides: [
    { id: 'smith.sharpen', op: 'edit', patch: { price: '12 gp', materials: [] } },
    { id: 'smith.armour', op: 'remove' },
    {
      id: 'cook.custom-1a2b3c4d',
      op: 'add',
      entry: {
        id: 'cook.custom-1a2b3c4d',
        merchant: 'cook',
        level: 2,
        kind: 'trade',
        name: 'Pickled eel',
        description: 'Keeps a month.',
        price: '2 sp',
        materials: ['fish'],
      },
    },
  ],
  resources: [{ id: 'res-1', hex: '2,-1' as HexKey, type: 'iron', origin: 'generated' }],
  resourceChances: { ...defaultResourceChances(), forest: 0.2 },
  resourceSpacing: 10,
  fogEdits: [{ hex: '3,3' as HexKey, revealed: true }],
  encounterOverrides: [
    { kind: 'change', id: 'forest.wolves', change: { weight: 6 } },
    { kind: 'remove', id: 'grass.bandits' },
    {
      kind: 'add',
      entry: {
        id: 'enc-1',
        terrain: 'sand',
        when: 'night',
        weight: 2,
        title: 'Sphinx',
        description: '',
      },
    },
  ],
  roads: [
    { a: '0,0' as HexKey, b: '1,0' as HexKey },
    { a: '1,0' as HexKey, b: '1,1' as HexKey },
  ],
  rivers: [{ a: '0,1' as HexKey, b: '1,0' as HexKey }],
  terrainOverrides: [{ hex: '1,0' as HexKey, terrain: 'mountains' }],
})

// Breaking the file in every way it can be broken is the point, so the edits
// reach into it without the types that would stop them.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any

/** A valid file with one thing in it changed by hand. */
const tampered = (
  edit: (file: { format: unknown; version: unknown; map: Loose }) => void,
): string => {
  const file = JSON.parse(serialiseMap(snapshot()))
  edit(file)
  return JSON.stringify(file)
}

const rejected = (text: string): string => {
  const result = parseMapFile(text)
  if (result.ok) throw new Error('expected the file to be rejected')
  return result.error
}

describe('serialiseMap', () => {
  it('stamps the file with its format and version', () => {
    const file = JSON.parse(serialiseMap(snapshot()))
    expect(file.format).toBe(MAP_FILE_FORMAT)
    expect(file.version).toBe(MAP_FILE_VERSION)
    expect(file.map).toEqual(snapshot())
  })

  it('reads back exactly what it wrote', () => {
    expect(parseMapFile(serialiseMap(snapshot()))).toEqual({ ok: true, snapshot: snapshot() })
  })

  it('keeps nothing from the file the snapshot does not have', () => {
    const result = parseMapFile(tampered((file) => (file.map.extra = 'stowaway')))
    expect(result.ok && 'extra' in result.snapshot).toBe(false)
  })
})

describe('parseMapFile', () => {
  it('turns away a file that is not JSON', () => {
    expect(rejected('{ not json')).toMatch(/not valid JSON/)
  })

  it('turns away JSON that is not a map file', () => {
    expect(rejected('[1, 2, 3]')).toMatch(/not a hexcrawl map/)
    expect(rejected(tampered((file) => (file.format = 'something-else')))).toMatch(
      /not a hexcrawl map/,
    )
  })

  it('turns away a version it does not know', () => {
    expect(rejected(tampered((file) => (file.version = 2)))).toMatch(/version 2/)
    expect(rejected(tampered((file) => delete file.version))).toMatch(/version undefined/)
  })

  it('turns away a file with no map in it', () => {
    expect(rejected(tampered((file) => (file.map = 'nothing')))).toMatch(/no map/)
  })

  it.each<[string, (map: Loose) => void, string]>([
    ['a missing field', (map) => delete map.fog, 'fog'],
    ['a field added later but malformed', (map) => (map.roads = null), 'roads'],
    ['a field of the wrong type', (map) => (map.worldRadius = '150'), 'worldRadius'],
    ['a number that is not finite', (map) => (map.terrain.relief = null), 'terrain'],
    ['a negative turn', (map) => (map.turn = -1), 'turn'],
    ['an unknown entity kind', (map) => (map.entities[0].kind = 'dragon'), 'entities'],
    ['an entity missing a field', (map) => delete map.entities[1].hidden, 'entities'],
    ['a list that is not a list', (map) => (map.notes = {}), 'notes'],
    ['a malformed hex key', (map) => (map.origins[0].hex = 'north'), 'origins'],
    ['a bad hex inside a path', (map) => map.record[0].entered.push('1;0'), 'record'],
    ['an unknown order', (map) => (map.queue[1].action.kind = 'fly'), 'queue'],
    ['a move with no route', (map) => delete map.queue[0].action.route, 'queue'],
    ['a rider that is not an id', (map) => (map.states[0].riding = 3), 'states'],
    ['an event without a title', (map) => delete map.events[0].title, 'events'],
    ['an encounter met on no turn', (map) => (map.events[1].turn = 'dusk'), 'events'],
    ['a null location', (map) => (map.locations[0] = null), 'locations'],
    ['an unknown merchant type', (map) => (map.merchants[0].type = 'jester'), 'merchants'],
    ['a merchant level past 10', (map) => (map.merchants[0].level = 11), 'merchants'],
    ['an item of none', (map) => (map.items[0].quantity = 0), 'items'],
    ['an item of half a rope', (map) => (map.items[0].quantity = 1.5), 'items'],
    ['an item weighing less than nothing', (map) => (map.items[0].weight = -1), 'items'],
    ['an item with no notes', (map) => delete map.items[1].notes, 'items'],
    [
      'an unknown catalog change',
      (map) => (map.catalogOverrides[1].op = 'hide'),
      'catalogOverrides',
    ],
    [
      'a catalog edit to a field there is none of',
      (map) => (map.catalogOverrides[0].patch.colour = 'red'),
      'catalogOverrides',
    ],
    [
      'a catalog unlock past 10',
      (map) => (map.catalogOverrides[0].patch.level = 11),
      'catalogOverrides',
    ],
    [
      'an added entry under another id',
      (map) => (map.catalogOverrides[2].entry.id = 'cook.other'),
      'catalogOverrides',
    ],
    [
      'an added entry needing an unknown resource',
      (map) => (map.catalogOverrides[2].entry.materials = ['mithril']),
      'catalogOverrides',
    ],
    [
      'two changes to one entry',
      (map) => (map.catalogOverrides[1].id = 'smith.sharpen'),
      'catalogOverrides',
    ],
    ['an unknown resource', (map) => (map.resources[0].type = 'mithril'), 'resources'],
    ['odds above certainty', (map) => (map.resourceChances.forest = 2), 'resourceChances'],
    ['a fractional spacing', (map) => (map.resourceSpacing = 2.5), 'resourceSpacing'],
    ['a fog edit with no side', (map) => (map.fogEdits[0].revealed = 1), 'fogEdits'],
    [
      'an unknown override',
      (map) => (map.encounterOverrides[1].kind = 'swap'),
      'encounterOverrides',
    ],
    [
      'a negative weight',
      (map) => (map.encounterOverrides[0].change.weight = -1),
      'encounterOverrides',
    ],
    [
      'an unknown changed field',
      (map) => (map.encounterOverrides[0].change.loot = 5),
      'encounterOverrides',
    ],
    ['a removal without an id', (map) => delete map.encounterOverrides[1].id, 'encounterOverrides'],
    [
      'an added line at noon',
      (map) => (map.encounterOverrides[2].entry.when = 'noon'),
      'encounterOverrides',
    ],
    [
      'an added line on lava',
      (map) => (map.encounterOverrides[2].entry.terrain = 'lava'),
      'encounterOverrides',
    ],
    [
      'an added line with no title',
      (map) => delete map.encounterOverrides[2].entry.title,
      'encounterOverrides',
    ],
    ['a negative food store', (map) => (map.supplies[0].food = -1), 'supplies'],
    ['gold past a full bar', (map) => (map.supplies[0].gold = 1e6), 'supplies'],
    ['a road end that is not a hex', (map) => (map.roads[0].b = 'east'), 'roads'],
    ['a road between hexes apart', (map) => (map.roads[0].b = '2,0'), 'roads'],
    ['a road from a hex to itself', (map) => (map.roads[0].b = '0,0'), 'roads'],
    ['a river between hexes apart', (map) => (map.rivers[0].b = '3,0'), 'rivers'],
    ['a river bank that is not a hex', (map) => (map.rivers[0].a = 'west'), 'rivers'],
    [
      'an unknown painted terrain',
      (map) => (map.terrainOverrides[0].terrain = 'lava'),
      'terrainOverrides',
    ],
    [
      'a painted hex that is not a hex',
      (map) => (map.terrainOverrides[0].hex = 'here'),
      'terrainOverrides',
    ],
  ])('turns away %s, naming the field', (_, edit, field) => {
    expect(rejected(tampered((file) => edit(file.map)))).toContain(`"${field}"`)
  })

  it.each([
    'terrain',
    'worldRadius',
    'fog',
    'showSight',
    'showHistory',
    'dmView',
    'turn',
    'selectedId',
    'entities',
    'origins',
    'record',
    'states',
    'queue',
    'notes',
    'events',
    'locations',
    'merchants',
    'resources',
    'resourceChances',
    'resourceSpacing',
  ])('turns away a file with no %s, which every export has had', (field) => {
    expect(rejected(tampered((file) => delete file.map[field]))).toContain(`"${field}"`)
  })

  it.each<[keyof MapSnapshot, unknown]>([
    ['fogEdits', []],
    ['encounterOverrides', []],
    ['catalogOverrides', []],
    ['roads', []],
    ['rivers', []],
    ['terrainOverrides', []],
    ['supplies', []],
    ['items', []],
  ])('opens a file from before %s existed with the default', (field, fallback) => {
    const result = parseMapFile(tampered((file) => delete file.map[field]))
    expect(result).toEqual({ ok: true, snapshot: { ...snapshot(), [field]: fallback } })
  })

  it('gives a terrain the file has no odds for the default odds', () => {
    const result = parseMapFile(tampered((file) => delete file.map.resourceChances.peaks))
    expect(result.ok && result.snapshot.resourceChances).toEqual({
      ...snapshot().resourceChances,
      peaks: defaultResourceChances().peaks,
    })
  })
})

describe('a map carried out and back in', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  const flatField = (): Map<HexKey, TerrainTile> =>
    new Map(
      range({ q: 0, r: 0 }, 6).map((hex) => [
        hexKey(hex),
        { hex, terrain: 'grass', height: 1, level: 1, elevation: 1.5, color: new Color3(0, 0, 0) },
      ]),
    )

  it('comes back identical on a fresh map', () => {
    const store = useHexMapStore()
    store.setTiles(flatField())
    store.setTerrain({ seed: 31337, relief: 6 })
    store.setWorldSize('small')
    store.select({ q: 0, r: 0 })
    store.select({ q: 4, r: 0 })
    store.advanceTurn()
    store.advanceTurn()
    store.addEntity(undefined, 'caravan', 'dm')
    store.setNote('1,0' as HexKey, 'smells of smoke')
    store.addEvent('2,0' as HexKey, { title: 'ambush', description: 'goblins' })
    store.addLocation('0,0' as HexKey, { name: 'Oakvale', kind: 'village', description: '' })
    store.setDmTool('fog')
    store.setFogMode('hide')
    store.click({ q: 0, r: 0 })
    store.setEncounter('forest.wolves', { weight: 7 })
    store.removeEncounter('grass.bandits')
    store.addEncounter({
      terrain: 'sand',
      when: 'night',
      weight: 2,
      title: 'Sphinx',
      description: '',
    })
    store.editCatalogEntry('smith.sharpen', { price: '12 gp', level: 5 })
    store.removeCatalogEntry('smith.armour')
    store.addCatalogEntry('cook', { name: 'Pickled eel', materials: ['fish'] })
    store.setDmTool('paint')
    store.setPaintTerrain('forest')
    store.click({ q: 2, r: -1 })
    expect(store.snapshot.terrainOverrides.length).toBeGreaterThan(0)
    store.fog = true
    store.dmView = true
    expect(store.snapshot.fogEdits.length).toBeGreaterThan(0)
    store.setDmTool('road')
    store.click({ q: 0, r: 1 })
    store.click({ q: 3, r: 1 })
    expect(store.snapshot.roads).toHaveLength(3)
    store.setDmTool('river')
    store.click({ q: 1, r: 0 })
    store.click({ q: 1, r: 1 })
    expect(store.snapshot.rivers).toHaveLength(1)
    expect(store.snapshot.record.length).toBeGreaterThan(0)
    const exported = serialiseMap(store.snapshot)

    setActivePinia(createPinia())
    const fresh = useHexMapStore()
    fresh.setTiles(flatField())
    const result = parseMapFile(exported)
    if (!result.ok) throw new Error(result.error)
    fresh.restore(result.snapshot)

    expect(fresh.snapshot).toEqual(store.snapshot)
    expect(fresh.catalog).toEqual(store.catalog)
    expect(serialiseMap(fresh.snapshot)).toBe(exported)
  })

  it('comes back with nobody on it when the file has no entities', () => {
    const store = useHexMapStore()
    store.setTiles(flatField())
    store.removeEntity(store.selectedId)
    const exported = serialiseMap(store.snapshot)

    setActivePinia(createPinia())
    const fresh = useHexMapStore()
    fresh.setTiles(flatField())
    const result = parseMapFile(exported)
    if (!result.ok) throw new Error(result.error)
    fresh.restore(result.snapshot)

    expect(fresh.entities).toEqual([])
    expect(fresh.snapshot).toEqual(store.snapshot)
    expect(serialiseMap(fresh.snapshot)).toBe(exported)
  })
})
