import { createPinia, setActivePinia } from 'pinia'
import { describe, expect, it } from 'vitest'
import { useHexMapStore } from '../stores/hexMap'
import { useMapLibraryStore } from '../stores/mapLibrary'
import {
  allowed,
  DM,
  HEX_MAP_RULES,
  MAP_LIBRARY_RULES,
  PLAYER,
  type Action,
  type EntityRef,
} from './permissions'

const playerParty: EntityRef = { owner: 'player', hidden: false }
const hiddenPlayerParty: EntityRef = { owner: 'player', hidden: true }
const dmCaravan: EntityRef = { owner: 'dm', hidden: false }
const hiddenDmCaravan: EntityRef = { owner: 'dm', hidden: true }

const ENTITY_ACTIONS: readonly Action[] = [
  'order',
  'renameEntity',
  'recolorEntity',
  'editInventory',
]

// Putting an entity on the map is where it starts, which is the DM's call.
const DM_ONLY: readonly Action[] = [
  'place',
  'addEntity',
  'removeEntity',
  'entitySettings',
  'clock',
  'supplies',
  'merchants',
  'fog',
  'terrain',
  'roads',
  'mapTools',
  'resources',
  'notes',
  'locations',
  'events',
  'encounters',
  'maps',
  'clearHistory',
  'undo',
]

describe('entity actions', () => {
  it.each(ENTITY_ACTIONS)('%s: players may on their own entities, hidden or not', (action) => {
    expect(allowed(PLAYER, action, playerParty)).toBe(true)
    expect(allowed(PLAYER, action, hiddenPlayerParty)).toBe(true)
  })

  it.each(ENTITY_ACTIONS)('%s: players may not on DM entities, even visible ones', (action) => {
    expect(allowed(PLAYER, action, dmCaravan)).toBe(false)
    expect(allowed(PLAYER, action, hiddenDmCaravan)).toBe(false)
  })

  it.each(ENTITY_ACTIONS)('%s: players are refused with no entity to judge', (action) => {
    expect(allowed(PLAYER, action)).toBe(false)
  })

  it.each(ENTITY_ACTIONS)('%s: the DM may on anything, or nothing', (action) => {
    for (const target of [playerParty, hiddenPlayerParty, dmCaravan, hiddenDmCaravan]) {
      expect(allowed(DM, action, target)).toBe(true)
    }
    expect(allowed(DM, action)).toBe(true)
  })

  it('a transfer is not an entity to judge', () => {
    expect(allowed(PLAYER, 'order', { from: playerParty, to: playerParty })).toBe(false)
  })
})

describe('handing items across', () => {
  it('players may between their own entities', () => {
    expect(allowed(PLAYER, 'transferItem', { from: playerParty, to: hiddenPlayerParty })).toBe(true)
  })

  it('players may to or from a visible DM carrier, from their own side', () => {
    expect(allowed(PLAYER, 'transferItem', { from: playerParty, to: dmCaravan })).toBe(true)
    expect(allowed(PLAYER, 'transferItem', { from: dmCaravan, to: playerParty })).toBe(true)
  })

  it('players may not reach a hidden DM carrier', () => {
    expect(allowed(PLAYER, 'transferItem', { from: playerParty, to: hiddenDmCaravan })).toBe(false)
    expect(allowed(PLAYER, 'transferItem', { from: hiddenDmCaravan, to: playerParty })).toBe(false)
  })

  it('players may not move things between DM entities', () => {
    expect(allowed(PLAYER, 'transferItem', { from: dmCaravan, to: dmCaravan })).toBe(false)
  })

  it('players are refused with no transfer, or a lone entity, to judge', () => {
    expect(allowed(PLAYER, 'transferItem')).toBe(false)
    expect(allowed(PLAYER, 'transferItem', playerParty)).toBe(false)
  })

  it('the DM may between anything', () => {
    expect(allowed(DM, 'transferItem', { from: hiddenDmCaravan, to: dmCaravan })).toBe(true)
    expect(allowed(DM, 'transferItem')).toBe(true)
  })
})

describe('DM-only actions', () => {
  it.each(DM_ONLY)('%s: the DM may, players may not, whatever the target', (action) => {
    expect(allowed(DM, action)).toBe(true)
    expect(allowed(PLAYER, action)).toBe(false)
    expect(allowed(PLAYER, action, playerParty)).toBe(false)
    expect(allowed(PLAYER, action, dmCaravan)).toBe(false)
  })

  it('a specific player is held to the same rules', () => {
    const one = { role: 'player', playerId: 'p1' } as const
    expect(allowed(one, 'order', playerParty)).toBe(true)
    expect(allowed(one, 'order', dmCaravan)).toBe(false)
    expect(allowed(one, 'clock')).toBe(false)
  })
})

// Functions that change nothing shared: reads, and this viewer's own view.
const HEX_MAP_FREE = new Set([
  'selectEntity',
  'tileAt',
  'shoreAt',
  'setHovered',
  'selectHex',
  'setPanelOpen',
  'positionsAt',
  'recordsOn',
  'sightAt',
  'carrierOf',
  'ridersOf',
  'atSea',
  'merchantsOf',
  'itemsOf',
  'inventoryPartners',
  'suppliesOf',
  'resourcesOn',
  'encounterTable',
  // The check itself, and running the guarded functions as somebody else.
  'may',
  'actAs',
])

const MAP_LIBRARY_FREE = new Set(['connect', 'show'])

const functionsOf = (store: object): string[] =>
  Object.entries(store)
    .filter(([name, value]) => !/^[$_]/.test(name) && typeof value === 'function')
    .map(([name]) => name)
    .sort()

describe('every store function has a rule', () => {
  it('the map store', () => {
    setActivePinia(createPinia())
    const ruled = new Set(Object.keys(HEX_MAP_RULES))
    const names = functionsOf(useHexMapStore())
    expect(names.filter((name) => !ruled.has(name) && !HEX_MAP_FREE.has(name))).toEqual([])
    expect([...ruled, ...HEX_MAP_FREE].filter((name) => !names.includes(name))).toEqual([])
  })

  it('the map library store', () => {
    setActivePinia(createPinia())
    const ruled = new Set(Object.keys(MAP_LIBRARY_RULES))
    const names = functionsOf(useMapLibraryStore())
    expect(names.filter((name) => !ruled.has(name) && !MAP_LIBRARY_FREE.has(name))).toEqual([])
    expect([...ruled, ...MAP_LIBRARY_FREE].filter((name) => !names.includes(name))).toEqual([])
  })
})
