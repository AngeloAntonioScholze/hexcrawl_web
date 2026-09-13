import { Color3 } from '@babylonjs/core/Maths/math.color'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { hexKey, range, type Axial, type HexKey } from '../hex/coords'
import { TERRAIN_DEFAULTS, type TerrainTile } from '../terrain/terrain'
import { TURNS_PER_PHASE } from '../time/clock'
import { MAX_SIGHT, MIN_SIGHT, TERRAIN_LIMITS, useHexMapStore } from './hexMap'

// The number is the mechanical level; sight and climbs read that, and the
// rendered height only trails along behind it.
const tile = (hex: Axial, level = 1): TerrainTile => ({
  hex,
  terrain: 'grass',
  height: level,
  level,
  elevation: 0.5 + level,
  color: new Color3(0, 0, 0),
})

const flatField = (radius: number): Map<HexKey, TerrainTile> =>
  new Map(range({ q: 0, r: 0 }, radius).map((hex) => [hexKey(hex), tile(hex)]))

type Store = ReturnType<typeof useHexMapStore>

const setup = (): Store => {
  const store = useHexMapStore()
  store.setTiles(flatField(6))
  return store
}

/** Puts the party down and sends it east, which is what a click pair does. */
const sendEast = (store: Store, distance = 4): void => {
  store.select({ q: 0, r: 0 })
  store.select({ q: distance, r: 0 })
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('giving orders', () => {
  it('puts the entity down on the first click, then plans a route', () => {
    const store = setup()

    store.select({ q: 0, r: 0 })
    expect(store.start).toBe('0,0')
    expect(store.goal).toBeNull()

    store.select({ q: 2, r: 0 })
    expect(store.goal).toBe('2,0')
    expect(store.start).toBe('0,0')
  })

  it('moves nobody until a turn passes', () => {
    const store = setup()
    sendEast(store, 2)

    expect(store.start).toBe('0,0')
    expect(store.turn).toBe(0)

    store.advanceTurn()

    expect(store.start).toBe('1,0')
    expect(store.turn).toBe(1)
  })

  it('keeps walking a standing order turn after turn', () => {
    const store = setup()
    sendEast(store, 3)

    store.advanceTurn()
    store.advanceTurn()
    store.advanceTurn()

    expect(store.start).toBe('3,0')
    expect(store.goal).toBeNull()
  })

  it('calls the order off when the entity is clicked where it stands', () => {
    const store = setup()
    sendEast(store, 3)

    store.select({ q: 0, r: 0 })
    store.advanceTurn()

    expect(store.start).toBe('0,0')
    expect(store.goal).toBeNull()
  })

  it('takes a caravan two turns over the hex a party crosses in one', () => {
    const store = setup()
    const caravan = store.addEntity('the caravan', 'caravan')
    store.selectEntity(caravan.id)
    sendEast(store, 2)

    store.advanceTurn()
    expect(store.start).toBe('0,0')

    store.advanceTurn()
    expect(store.start).toBe('1,0')
  })
})

describe('the clock', () => {
  it('turns the phase over after four turns', () => {
    const store = setup()
    expect(store.clock.phase).toBe('day')

    for (let i = 0; i < TURNS_PER_PHASE; i++) store.advanceTurn()

    expect(store.clock.phase).toBe('night')
    expect(store.clock.index).toBe(0)
  })

  it('camps out the rest of the phase in one press', () => {
    const store = setup()
    store.advanceTurn()

    store.skipPhase()

    expect(store.turn).toBe(TURNS_PER_PHASE)
    expect(store.clock.phase).toBe('night')
  })

  it('cuts sight down after dark and hands it back at dawn', () => {
    const store = setup()
    store.select({ q: 0, r: 0 })
    store.setSight(6)
    const byDay = store.reach

    store.skipPhase()

    expect(store.reach).toBeLessThan(byDay)
    expect(store.reach).toBeGreaterThanOrEqual(1)

    store.skipPhase()
    expect(store.reach).toBe(byDay)
  })
})

describe('winding the crawl back', () => {
  it('walks the entity back down the record', () => {
    const store = setup()
    sendEast(store, 3)
    store.advanceTurn()
    store.advanceTurn()
    expect(store.start).toBe('2,0')

    store.rewindTurn()

    expect(store.turn).toBe(1)
    expect(store.start).toBe('1,0')
  })

  it('has nothing to wind back on the first turn', () => {
    const store = setup()
    expect(store.canRewind).toBe(false)

    store.rewindTurn()
    expect(store.turn).toBe(0)
  })

  it('closes the fog behind the party', () => {
    const store = setup()
    store.setSight(2)
    sendEast(store, 4)
    for (let i = 0; i < 4; i++) store.advanceTurn()
    const far = store.explored.size

    store.goToTurn(1)

    expect(store.explored.size).toBeLessThan(far)
  })

  it('drops the future the party turned away from', () => {
    const store = setup()
    sendEast(store, 4)
    store.advanceTurn()
    store.advanceTurn()

    store.rewindTurn()
    store.select({ q: 0, r: 2 })
    store.advanceTurn()

    expect(store.turn).toBe(2)
    expect(store.start).toBe('0,1')
    expect(store.journey.map((row) => row.hex)).toEqual(['1,0', '0,1'])
  })
})

describe('the record', () => {
  it('writes a row for every turn spent, walked or not', () => {
    const store = setup()
    store.select({ q: 0, r: 0 })
    store.advanceTurn()
    store.advanceTurn()

    expect(store.journey).toHaveLength(2)
    expect(store.journey.every((row) => row.kind === 'wait')).toBe(true)
    expect(store.hexesWalked).toBe(0)
  })

  it('crosses one hex on the press after a long wait, not five', () => {
    const store = setup()
    store.select({ q: 0, r: 0 })
    for (let i = 0; i < 5; i++) store.advanceTurn()

    store.select({ q: 5, r: 0 })
    store.advanceTurn()

    expect(store.start).toBe('1,0')
    expect(store.journey.at(-1)?.entered).toBe(1)
  })

  it('counts the ground covered', () => {
    const store = setup()
    sendEast(store, 3)
    store.advanceTurn()
    store.advanceTurn()

    expect(store.hexesWalked).toBe(2)
    expect(store.travelledKm).toBe(20)
  })
})

describe('entities', () => {
  it('lets the map be cleared of everybody', () => {
    const store = setup()
    sendEast(store, 2)
    store.advanceTurn()

    store.removeEntity(store.selectedId)

    expect(store.entities).toEqual([])
    expect(store.selectedEntity).toBeNull()
    expect(store.start).toBeNull()
    expect(store.tokens).toEqual([])
  })

  it('has no orders to take on an empty map', () => {
    const store = setup()
    store.removeEntity(store.selectedId)

    store.select({ q: 0, r: 0 })

    expect(store.start).toBeNull()
    expect(store.goal).toBeNull()
  })

  it('hands the map back to whoever is left when one is removed', () => {
    const store = setup()
    const scout = store.addEntity('the scout')
    store.selectEntity(scout.id)

    store.removeEntity(scout.id)

    expect(store.entities).toHaveLength(1)
    expect(store.selectedEntity?.name).toBe('the party')
  })

  it('moves everybody on the same turn', () => {
    const store = setup()
    const scout = store.addEntity('the scout')
    store.setPace(scout.id, 2)

    sendEast(store, 4)
    store.selectEntity(scout.id)
    sendEast(store, 4)

    store.advanceTurn()

    expect(store.start).toBe('2,0')
    store.selectEntity(store.entities[0].id)
    expect(store.start).toBe('1,0')
  })

  it('keeps every entity to its own sight', () => {
    const store = setup()
    const caravan = store.addEntity('the caravan', 'caravan')

    store.setSight(MAX_SIGHT)
    store.selectEntity(caravan.id)

    expect(store.sight).toBeLessThan(MAX_SIGHT)
    expect(store.sight).toBeGreaterThanOrEqual(MIN_SIGHT)
  })
})

describe('the world', () => {
  it('starts the crawl over on a new world', () => {
    const store = setup()
    sendEast(store, 3)
    store.advanceTurn()

    store.setTerrain({ seed: TERRAIN_DEFAULTS.seed + 1 })

    expect(store.turn).toBe(0)
    expect(store.journey).toEqual([])
    expect(store.start).toBeNull()
  })

  it('keeps the terrain knobs inside their limits', () => {
    const store = setup()

    store.setTerrain({ scale: TERRAIN_LIMITS.scale.max + 100 })

    expect(store.terrain.scale).toBe(TERRAIN_LIMITS.scale.max)
  })
})

describe('the adventure log', () => {
  it('keeps the turns the crawl has been wound back past', () => {
    const store = setup()
    sendEast(store, 3)
    store.advanceTurn()
    store.advanceTurn()
    store.advanceTurn()

    store.goToTurn(1)

    expect(store.journey).toHaveLength(3)
    expect(store.journey.filter((row) => row.spent)).toHaveLength(1)
  })

  it('puts the crawl back as it stood at the end of a logged turn', () => {
    const store = setup()
    sendEast(store, 3)
    for (let i = 0; i < 3; i++) store.advanceTurn()

    const row = store.journey[0]
    store.goToTurn(row.turn + 1)

    expect(store.turn).toBe(1)
    expect(store.start).toBe('1,0')
  })

  it('wipes every record and everybody off the map when cleared', () => {
    const store = setup()
    sendEast(store, 3)
    store.advanceTurn()
    store.advanceTurn()

    store.clearHistory()

    expect(store.turn).toBe(0)
    expect(store.journey).toEqual([])
    expect(store.start).toBeNull()
    expect(store.explored.size).toBe(0)
  })
})

describe('the paths drawn on the map', () => {
  it('draws only the selected entity by default', () => {
    const store = setup()
    const scout = store.addEntity('the scout')
    sendEast(store, 2)
    store.selectEntity(scout.id)
    sendEast(store, 2)

    expect(store.paths).toHaveLength(1)
  })

  it('draws a line for every entity once asked to', () => {
    const store = setup()
    const scout = store.addEntity('the scout')
    sendEast(store, 2)
    store.selectEntity(scout.id)
    store.select({ q: 0, r: 1 })
    store.select({ q: 0, r: 3 })

    store.showAllPaths = true

    expect(store.paths).toHaveLength(2)
    expect(store.paths.every((path) => path.hexes.length > 1)).toBe(true)
  })

  it('leaves hidden entities off the player map', () => {
    const store = setup()
    const lurker = store.addEntity('the lurker', 'npc', 'dm')
    sendEast(store, 2)
    store.selectEntity(lurker.id)
    store.select({ q: 0, r: 1 })
    store.showAllPaths = true

    expect(store.paths).toHaveLength(2)

    store.dmView = false
    expect(store.paths).toHaveLength(1)
  })
})

describe('chained orders', () => {
  /** Puts the party down at the middle and gives it a chain of stops. */
  const chain = (store: Store, stops: Axial[]): void => {
    store.select({ q: 0, r: 0 })
    for (const stop of stops) store.select(stop, true)
  }

  it('has no legs before any order is given', () => {
    const store = setup()
    store.select({ q: 0, r: 0 })

    expect(store.legs).toEqual([])
    expect(store.route).toBeNull()
  })

  it('reads a plain click as a chain of one leg', () => {
    const store = setup()
    sendEast(store, 3)

    expect(store.legs).toEqual([{ to: '3,0', steps: 3, km: 30, turns: 3 }])
    expect(store.route?.km).toBe(30)
  })

  it('appends a stop on shift-click and reports every leg and the total', () => {
    const store = setup()
    chain(store, [
      { q: 2, r: 0 },
      { q: 2, r: 2 },
      { q: 0, r: 2 },
    ])

    expect(store.legs.map((leg) => leg.to)).toEqual(['2,0', '2,2', '0,2'])
    expect(store.legs.map((leg) => leg.km)).toEqual([20, 20, 20])
    expect(store.route?.km).toBe(60)
    expect(store.routeTurns).toBe(6)
    expect(store.goal).toBe('0,2')
    expect(store.plannedHexes).toHaveLength(6)
  })

  it('replaces the whole chain on a plain click', () => {
    const store = setup()
    chain(store, [
      { q: 2, r: 0 },
      { q: 2, r: 2 },
    ])

    store.select({ q: 0, r: 1 })

    expect(store.legs.map((leg) => leg.to)).toEqual(['0,1'])
  })

  it('ignores a stop added on top of the last one', () => {
    const store = setup()
    chain(store, [
      { q: 2, r: 0 },
      { q: 2, r: 0 },
    ])

    expect(store.legs).toHaveLength(1)
  })

  it('removes a stop and re-routes the legs either side of it', () => {
    const store = setup()
    chain(store, [
      { q: 2, r: 0 },
      { q: 2, r: 2 },
      { q: 0, r: 2 },
    ])

    store.removeWaypoint(1)

    expect(store.legs.map((leg) => leg.to)).toEqual(['2,0', '0,2'])
    expect(store.route?.km).toBe(40)
  })

  it('calls the order off once the last stop is removed', () => {
    const store = setup()
    sendEast(store, 2)

    store.removeWaypoint(0)
    store.advanceTurn()

    expect(store.start).toBe('0,0')
    expect(store.legs).toEqual([])
  })

  it('walks leg after leg and forgets the stops behind it', () => {
    const store = setup()
    chain(store, [
      { q: 1, r: 0 },
      { q: 1, r: 1 },
    ])

    store.advanceTurn()
    expect(store.legs.map((leg) => leg.to)).toEqual(['1,1'])

    store.advanceTurn()
    expect(store.start).toBe('1,1')
    expect(store.legs).toEqual([])
  })

  it('adds a stop onto an order already being walked', () => {
    const store = setup()
    chain(store, [
      { q: 2, r: 0 },
      { q: 2, r: 2 },
    ])
    store.advanceTurn()

    store.select({ q: 0, r: 2 }, true)

    expect(store.legs.map((leg) => leg.to)).toEqual(['2,0', '2,2', '0,2'])
  })
})
