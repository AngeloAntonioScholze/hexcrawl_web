import { Color3 } from '@babylonjs/core/Maths/math.color'
import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import type { Entity } from '../entities/entity'
import { hexKey, range, type Axial, type HexKey } from '../hex/coords'
import type { MapSnapshot } from '../persistence/mapState'
import { useHexMapStore } from '../stores/hexMap'
import { fieldFromTiles } from '../terrain/field'
import { defaultResourceChances } from '../terrain/resources'
import type { TerrainTile } from '../terrain/terrain'
import { projectForPlayers, type PlayerProjection } from './projection'

const tile = (hex: Axial): TerrainTile => ({
  hex,
  terrain: 'grass',
  height: 1,
  level: 1,
  elevation: 1.5,
  color: new Color3(0, 0, 0),
})

const flatTiles = (radius: number): Map<HexKey, TerrainTile> =>
  new Map(range({ q: 0, r: 0 }, radius).map((hex) => [hexKey(hex), tile(hex)]))

const field = fieldFromTiles(flatTiles(9))

const entity = (id: string, kind: Entity['kind'], hidden: boolean): Entity => ({
  id,
  name: id,
  kind,
  owner: hidden ? 'dm' : 'player',
  color: '#ffffff',
  pacePerTurn: 1,
  sight: 2,
  hidden,
})

const still = { carry: 0, pending: [], waypoints: [], riding: null }

/**
 * A party walking from 0,0 to 1,0 to its caravan waiting there, and a hidden npc
 * and a hidden caravan far off to the west and east where nobody has looked.
 * A rider sits in the hidden caravan.
 */
const snapshot = (): MapSnapshot => ({
  terrain: { seed: 1234, scale: 1, seaLevel: 0, relief: 1 },
  worldRadius: 9,
  fog: true,
  revealed: false,
  fogSeeThrough: false,
  showSight: true,
  showHistory: true,
  dmView: true,
  turn: 1,
  selectedId: 'spy',
  entities: [
    entity('party', 'party', false),
    entity('caravan', 'caravan', false),
    entity('spy', 'npc', true),
    entity('smugglers', 'caravan', true),
    entity('stowaway', 'party', false),
  ],
  origins: [
    { entityId: 'party', turn: 0, hex: '0,0' },
    { entityId: 'caravan', turn: 0, hex: '1,0' },
    { entityId: 'spy', turn: 0, hex: '-7,0' },
    { entityId: 'smugglers', turn: 0, hex: '7,0' },
    { entityId: 'stowaway', turn: 0, hex: '7,0' },
  ],
  record: [
    {
      turn: 0,
      entityId: 'party',
      kind: 'move',
      from: '0,0',
      to: '1,0',
      entered: ['1,0'],
      spent: 1,
      carry: 0,
    },
    {
      turn: 0,
      entityId: 'caravan',
      kind: 'wait',
      from: '1,0',
      to: '1,0',
      entered: [],
      spent: 0,
      carry: 0,
    },
    {
      turn: 0,
      entityId: 'spy',
      kind: 'move',
      from: '-7,0',
      to: '-7,1',
      entered: ['-7,1'],
      spent: 1,
      carry: 0,
    },
    {
      turn: 0,
      entityId: 'smugglers',
      kind: 'wait',
      from: '7,0',
      to: '7,0',
      entered: [],
      spent: 0,
      carry: 0,
    },
    {
      turn: 0,
      entityId: 'stowaway',
      kind: 'wait',
      from: '7,0',
      to: '7,0',
      entered: [],
      spent: 0,
      carry: 0,
    },
    // A turn the crawl was wound back from.
    {
      turn: 1,
      entityId: 'party',
      kind: 'move',
      from: '1,0',
      to: '2,0',
      entered: ['2,0'],
      spent: 1,
      carry: 0,
    },
  ],
  states: [
    { turn: 0, entityId: 'party', ...still, at: '1,0' },
    { turn: 0, entityId: 'caravan', ...still, at: '1,0' },
    { turn: 0, entityId: 'spy', ...still, at: '-7,1', pending: ['-7,2'], waypoints: ['-7,2'] },
    { turn: 0, entityId: 'smugglers', ...still, at: '7,0' },
    { turn: 0, entityId: 'stowaway', ...still, at: '7,0', riding: 'smugglers' },
    { turn: 1, entityId: 'party', ...still, at: '2,0' },
  ],
  queue: [
    { entityId: 'party', action: { kind: 'move', route: ['2,0'], waypoints: ['2,0'] } },
    { entityId: 'spy', action: { kind: 'move', route: ['-7,2'], waypoints: ['-7,2'] } },
  ],
  supplies: [
    { entityId: 'caravan', turn: 0, food: 10, gold: 20 },
    { entityId: 'smugglers', turn: 0, food: 77, gold: 999 },
  ],
  notes: [{ hex: '0,0', text: 'the innkeeper is the spy' }],
  events: [
    { hex: '0,0', id: 'written', title: 'a signpost', description: 'points north' },
    { hex: '1,0', id: 'met', title: 'wolves', description: 'a pack', turn: 1 },
    { hex: '1,0', id: 'unmet', title: 'bandits', description: 'not yet', turn: 3 },
    { hex: '-7,0', id: 'far-event', title: 'a lair', description: 'deep' },
  ],
  locations: [
    { hex: '1,1', id: 'near-place', name: 'a mill', kind: 'village', description: 'busy' },
    { hex: '-7,0', id: 'far-place', name: 'a keep', kind: 'castle', description: 'secret' },
  ],
  merchants: [
    { id: 'm-shown', caravanId: 'caravan', name: 'Ada', type: 'smith', level: 2 },
    { id: 'm-hidden', caravanId: 'smugglers', name: 'Bram', type: 'smith', level: 9 },
  ],
  items: [
    { id: 'i-party', ownerId: 'party', name: 'rope', quantity: 1, notes: '', weight: null },
    { id: 'i-caravan', ownerId: 'caravan', name: 'salt', quantity: 5, notes: '', weight: 1 },
    {
      id: 'i-smugglers',
      ownerId: 'smugglers',
      name: 'contraband',
      quantity: 3,
      notes: '',
      weight: 2,
    },
    { id: 'i-spy', ownerId: 'spy', name: 'poison', quantity: 1, notes: '', weight: null },
  ],
  catalogOverrides: [],
  resources: [
    { id: 'r-near', hex: '1,1', type: 'herbs', origin: 'generated' },
    { id: 'r-far', hex: '-7,0', type: 'herbs', origin: 'manual' },
    { id: 'r-fogged', hex: '0,1', type: 'herbs', origin: 'generated' },
  ],
  resourceChances: defaultResourceChances(),
  resourceSpacing: 3,
  fogEdits: [
    { hex: '-9,0', revealed: true },
    { hex: '0,1', revealed: false },
  ],
  encounterOverrides: [
    {
      kind: 'add',
      entry: {
        id: 'secret-encounter',
        terrain: 'grass',
        when: 'day',
        weight: 1,
        title: 'the dragon wakes',
        description: 'dm only',
      },
    },
  ],
  roads: [
    { a: '0,0', b: '1,0' },
    { a: '-7,0', b: '-6,0' },
  ],
  rivers: [
    { a: '1,0', b: '1,1' },
    { a: '-7,1', b: '-6,1' },
  ],
  terrainOverrides: [{ hex: '-8,0', terrain: 'peaks' }],
})

const project = (map: MapSnapshot = snapshot()): PlayerProjection => projectForPlayers(map, field)

const HIDDEN_IDS = ['spy', 'smugglers', 'm-hidden', 'i-smugglers', 'i-spy']

describe('what the players never get', () => {
  it('leaves hidden entities out, and their ids appear nowhere', () => {
    const view = project()
    expect(view.entities.map((one) => one.id)).toEqual(['party', 'caravan', 'stowaway'])

    const text = JSON.stringify(view)
    for (const id of HIDDEN_IDS) expect(text).not.toContain(`"${id}"`)
  })

  it("leaves out hidden entities' states, routes and queued orders", () => {
    const view = project()
    expect(view.states.map((one) => one.entityId)).toEqual(['party', 'caravan', 'stowaway'])
    expect(view.origins.map((one) => one.entityId)).toEqual(['party', 'caravan', 'stowaway'])
    expect(view.queue.map((one) => one.entityId)).toEqual(['party'])
    expect(JSON.stringify(view)).not.toContain('-7,2')
  })

  it("leaves out hidden entities' journey rows", () => {
    const view = project()
    expect(view.record.every((row) => row.entityId !== 'spy' && row.entityId !== 'smugglers')).toBe(
      true,
    )
  })

  it('leaves out turns the crawl was wound back from', () => {
    expect(project().record.every((row) => row.turn < 1)).toBe(true)
  })

  it('leaves out inventories, merchants and supplies of hidden entities', () => {
    const view = project()
    expect(view.items.map((one) => one.id)).toEqual(['i-party', 'i-caravan'])
    expect(view.merchants.map((one) => one.id)).toEqual(['m-shown'])
    expect(view.supplies).toEqual([{ entityId: 'caravan', food: 10, gold: 20 }])
  })

  it('does not name a hidden carrier its riders are in', () => {
    const stowaway = project().states.find((one) => one.entityId === 'stowaway')
    expect(stowaway).toMatchObject({ at: '7,0', riding: null })
  })

  it('keeps ground only a hidden entity saw out of the explored set', () => {
    const view = project()
    expect(view.explored).not.toContain('-7,0')
    expect(view.explored).not.toContain('-7,1')
    expect(view.visible).not.toContain('-7,1')
  })

  it('leaves out DM notes and encounter tables', () => {
    const text = JSON.stringify(project())
    expect(text).not.toContain('innkeeper')
    expect(text).not.toContain('dragon')
    expect(project()).not.toHaveProperty('notes')
    expect(project()).not.toHaveProperty('encounterOverrides')
  })

  it('sends no seed or generation controls, and terrain only for explored hexes', () => {
    const view = project()
    expect(view).not.toHaveProperty('terrain')
    expect(view).not.toHaveProperty('terrainOverrides')
    expect(view).not.toHaveProperty('resourceChances')
    expect(view).not.toHaveProperty('resourceSpacing')
    expect(JSON.stringify(view)).not.toContain('1234')
    expect(view.tiles.map((one) => one.hex)).toEqual(view.explored)
    expect(view.tiles.some((one) => one.hex === '-8,0')).toBe(false)
  })

  it('sends the result of the fog edits, not the edits', () => {
    const view = project()
    expect(view).not.toHaveProperty('fogEdits')
    expect(view.explored).toContain('-9,0')
    expect(view.explored).not.toContain('0,1')
    expect(view.visible).not.toContain('0,1')
  })

  it('leaves out resources off explored ground, and their origin everywhere', () => {
    expect(project().resources).toEqual([{ id: 'r-near', hex: '1,1', type: 'herbs' }])
  })

  it('leaves out locations and events off explored ground', () => {
    const view = project()
    expect(view.locations.map((one) => one.id)).toEqual(['near-place'])
    expect(view.events.map((one) => one.id)).not.toContain('far-event')
  })

  it('leaves out encounters met after this turn', () => {
    expect(project().events.map((one) => one.id)).toEqual(['written', 'met'])
  })

  it('leaves out roads and rivers off explored ground', () => {
    const view = project()
    expect(view.roads).toEqual([{ a: '0,0', b: '1,0' }])
    expect(view.rivers).toEqual([{ a: '1,0', b: '1,1' }])
  })

  it("leaves out the DM's view state", () => {
    const view = project()
    for (const key of [
      'dmView',
      'selectedId',
      'showSight',
      'showHistory',
      'fog',
      'fogSeeThrough',
    ]) {
      expect(view).not.toHaveProperty(key)
    }
  })
})

describe('what the players do get', () => {
  it('has the clock and the world size', () => {
    const view = project()
    expect(view.turn).toBe(1)
    expect(view.clock.turn).toBe(1)
    expect(view.worldRadius).toBe(9)
  })

  it('has every visible entity where it stands now, with its orders', () => {
    const view = project()
    expect(view.states.find((one) => one.entityId === 'party')).toMatchObject({ at: '1,0' })
    expect(view.queue).toEqual([
      { entityId: 'party', action: { kind: 'move', route: ['2,0'], waypoints: ['2,0'] } },
    ])
    expect(view.record.map((row) => row.entityId)).toEqual(['party', 'caravan', 'stowaway'])
  })

  it('has what the visible entities saw on every turn so far, and what is in sight now', () => {
    const view = project()
    for (const hex of ['-2,0', '0,0', '1,0', '3,0', '7,0']) expect(view.explored).toContain(hex)
    expect(view.visible).toContain('3,0')
    expect(view.visible).not.toContain('-2,0')
    expect(view.visible.every((hex) => view.explored.includes(hex))).toBe(true)
  })

  it('has the whole world, roads and all, once the DM reveals the map', () => {
    const view = project({ ...snapshot(), revealed: true })
    expect(view.explored).toHaveLength(3 * 9 * 10 + 1)
    expect(view.tiles).toHaveLength(view.explored.length)
    expect(view.roads.length).toBeGreaterThanOrEqual(project().roads.length)
  })

  it('has the ground of every explored hex', () => {
    const view = project()
    expect(view.tiles.find((one) => one.hex === '1,0')).toEqual({
      hex: '1,0',
      terrain: 'grass',
      height: 1,
      level: 1,
      elevation: 1.5,
    })
  })
})

describe('the projection as data', () => {
  it('gives equal output for equal input', () => {
    expect(project(snapshot())).toEqual(project(structuredClone(snapshot())))
  })

  it('survives JSON unchanged', () => {
    const view = project()
    expect(JSON.parse(JSON.stringify(view))).toEqual(view)
  })

  it('lists hexes in a fixed order whatever order they were found in', () => {
    const explored = project().explored
    const reversed = snapshot()
    reversed.fogEdits = [...reversed.fogEdits].reverse()
    expect(project(reversed).explored).toEqual(explored)
  })

  it('shares nothing with the snapshot it came from', () => {
    const map = snapshot()
    const view = project(map)
    view.entities[0].name = 'changed'
    view.queue[0].action = { kind: 'wait' }
    expect(map.entities[0].name).toBe('party')
    expect(map.queue[0].action.kind).toBe('move')
  })
})

describe('against the store', () => {
  it("matches the player view's fog, whichever view the DM is in", () => {
    setActivePinia(createPinia())
    const store = useHexMapStore()
    store.setTiles(flatTiles(6))
    store.setEntitySight(store.selectedId, 2)
    store.select({ q: 0, r: 0 })
    store.select({ q: 4, r: 0 })

    const spy = store.addEntity('the spy', 'npc', 'dm')!
    store.selectEntity(spy.id)
    store.select({ q: -4, r: 0 })
    store.select({ q: -4, r: 3 })
    for (let i = 0; i < 3; i++) store.advanceTurn()
    store.selectEntity(store.entities[0].id)

    store.dmView = false
    const known = [...store.known].sort()
    const view = projectForPlayers(store.snapshot, store.field)
    expect([...view.explored].sort()).toEqual(known)
    expect([...view.visible].sort()).toEqual([...store.visibleToPlayers].sort())

    store.dmView = true
    expect(store.known.has('-4,3')).toBe(true)
    expect(projectForPlayers(store.snapshot, store.field).explored).toEqual(view.explored)
  })
})
