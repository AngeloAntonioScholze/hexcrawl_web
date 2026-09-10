import { Color3 } from '@babylonjs/core/Maths/math.color'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { hexKey, range, type Axial, type HexKey } from '../hex/coords'
import type { TerrainTile } from '../terrain/terrain'
import { KM_PER_HEX } from '../terrain/travel'
import { MAX_SIGHT, MIN_SIGHT, useHexMapStore } from './hexMap'

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

const setup = (): ReturnType<typeof useHexMapStore> => {
  const store = useHexMapStore()
  store.setTiles(flatField(6))
  return store
}

const route = (store: ReturnType<typeof useHexMapStore>): void => {
  store.select({ q: 0, r: 0 })
  store.select({ q: 4, r: 0 })
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('selection', () => {
  it('sets start then goal, and starts over on the third click', () => {
    const store = setup()

    store.select({ q: 0, r: 0 })
    expect(store.start).toBe('0,0')
    expect(store.goal).toBeNull()

    store.select({ q: 2, r: 0 })
    expect(store.goal).toBe('2,0')

    store.select({ q: 3, r: 1 })
    expect(store.start).toBe('3,1')
    expect(store.goal).toBeNull()
  })

  it('clears the start when it is clicked again', () => {
    const store = setup()
    store.select({ q: 1, r: 1 })
    store.select({ q: 1, r: 1 })
    expect(store.start).toBeNull()
  })

  it('finds a route once both ends are set', () => {
    const store = setup()
    route(store)
    expect(store.route?.steps).toBe(4)
    expect(store.route?.km).toBe(40)
  })
})

describe('auto reveal', () => {
  it('shows the whole route immediately', () => {
    const store = setup()
    route(store)
    expect(store.isAuto).toBe(true)
    expect(store.visibleHexes).toHaveLength(5)
  })

  it('ignores play while on auto', () => {
    const store = setup()
    route(store)
    store.play()
    expect(store.playing).toBe(false)
  })
})

describe('animated reveal', () => {
  it('shows nothing until play is pressed', () => {
    const store = setup()
    route(store)
    store.setSpeed(2)
    expect(store.visibleHexes).toHaveLength(0)
  })

  it('starts at the first hex when played', () => {
    const store = setup()
    route(store)
    store.setSpeed(1)
    store.play()

    expect(store.playing).toBe(true)
    expect(store.visibleHexes).toEqual([{ q: 0, r: 0 }])
  })

  it('reveals the route in order', () => {
    const store = setup()
    route(store)
    store.setSpeed(1)
    store.play()
    store.advanceReveal(2)

    expect(store.visibleHexes).toHaveLength(3)
    expect(store.visibleHexes).toEqual(store.route!.hexes.slice(0, 3))
  })

  it('stops once the destination is reached', () => {
    const store = setup()
    route(store)
    store.setSpeed(3)
    store.play()
    store.advanceReveal(99)

    expect(store.playing).toBe(false)
    expect(store.finished).toBe(true)
    expect(store.visibleHexes).toHaveLength(store.route!.hexes.length)
  })

  it('counts kilometres as the route is walked', () => {
    const store = setup()
    route(store)
    store.setSpeed(1)
    store.play()

    expect(store.revealedKm).toBe(0)
    store.advanceReveal(2)
    expect(store.revealedKm).toBe(2 * KM_PER_HEX)
    store.advanceReveal(99)
    expect(store.revealedKm).toBe(store.route!.km)
  })

  it('rewinds when the route changes', () => {
    const store = setup()
    route(store)
    store.setSpeed(2)
    store.play()
    store.advanceReveal(2)

    store.select({ q: -2, r: 0 })
    store.select({ q: 2, r: 0 })

    expect(store.playing).toBe(false)
    expect(store.revealed).toBe(0)
    expect(store.visibleHexes).toHaveLength(0)
  })

  it('rewinds when the speed changes', () => {
    const store = setup()
    route(store)
    store.setSpeed(1)
    store.play()
    store.advanceReveal(2)

    store.setSpeed(3)
    expect(store.playing).toBe(false)
    expect(store.revealed).toBe(0)
  })

  it('shows the whole route again when set back to auto', () => {
    const store = setup()
    route(store)
    store.setSpeed(2)
    store.play()
    store.setSpeed(0)

    expect(store.isAuto).toBe(true)
    expect(store.visibleHexes).toHaveLength(5)
  })

  it('clamps the speed to the slider range', () => {
    const store = setup()
    store.setSpeed(9)
    expect(store.speed).toBe(3)
    store.setSpeed(-4)
    expect(store.speed).toBe(0)
  })

  it('does nothing when played without a route', () => {
    const store = setup()
    store.setSpeed(2)
    store.play()
    expect(store.playing).toBe(false)
    expect(store.visibleHexes).toHaveLength(0)
  })

  it('stops on demand and resumes from where it stopped', () => {
    const store = setup()
    route(store)
    store.setSpeed(1)
    store.play()
    store.advanceReveal(2)
    store.stop()

    expect(store.playing).toBe(false)
    expect(store.visibleHexes).toHaveLength(3)
  })
})

describe('party', () => {
  it('has no position until a start is chosen', () => {
    const store = setup()
    expect(store.partyHex).toBeNull()

    store.select({ q: 0, r: 0 })
    expect(store.partyHex).toBe('0,0')
  })

  it('stays on the start hex while the whole route is shown at once', () => {
    const store = setup()
    route(store)

    expect(store.isAuto).toBe(true)
    expect(store.partyHex).toBe('0,0')
  })

  it('rides the head of the walked stretch while the route animates', () => {
    const store = setup()
    store.setSpeed(1)
    route(store)
    store.play()

    expect(store.partyHex).toBe('0,0')
    store.advanceReveal(2)
    expect(store.partyHex).toBe(hexKey(store.route!.hexes[2]))
  })

  it('takes up the destination as its new start on arrival', () => {
    const store = setup()
    route(store)

    expect(store.canArrive).toBe(true)
    store.arrive()

    expect(store.start).toBe('4,0')
    expect(store.goal).toBeNull()
    expect(store.route).toBeNull()
    expect(store.partyHex).toBe('4,0')
  })

  it('will not arrive mid-journey', () => {
    const store = setup()
    store.setSpeed(1)
    route(store)
    store.play()
    store.advanceReveal(1)

    expect(store.canArrive).toBe(false)
    store.arrive()
    expect(store.start).toBe('0,0')
  })

  it('arrives once the animation reaches the destination', () => {
    const store = setup()
    store.setSpeed(1)
    route(store)
    store.play()
    store.advanceReveal(store.route!.hexes.length)

    expect(store.finished).toBe(true)
    expect(store.canArrive).toBe(true)
    store.arrive()
    expect(store.start).toBe('4,0')
  })
})

describe('fog of war', () => {
  it('knows nothing until the party stands somewhere', () => {
    const store = setup()
    expect(store.visible.size).toBe(0)
    expect(store.explored.size).toBe(0)
  })

  it('reveals what the party can see from where it stands', () => {
    const store = setup()
    store.setSight(2)
    store.select({ q: 0, r: 0 })

    // The field is level 1, below the treeline, so it buys no extra reach.
    expect(store.visible.has('0,0')).toBe(true)
    expect(store.visible.has('2,0')).toBe(true)
    expect(store.visible.has('3,0')).toBe(false)
  })

  it('remembers ground the party has left behind', () => {
    const store = setup()
    store.setSight(1)
    store.select({ q: -3, r: 0 })
    store.select({ q: 3, r: 0 })
    store.arrive()

    expect(store.visible.has('-3,0')).toBe(false)
    expect(store.explored.has('-3,0')).toBe(true)
    expect(store.explored.has('3,0')).toBe(true)
  })

  it('carves a corridor of explored ground along the walked route', () => {
    const store = setup()
    store.setSight(1)
    store.setSpeed(1)
    store.select({ q: -4, r: 0 })
    store.select({ q: 4, r: 0 })
    store.play()

    const walked = store.route!.hexes.length
    for (let step = 0; step < walked; step++) store.advanceReveal(1)

    for (const hex of store.route!.hexes) {
      expect(store.explored.has(hexKey(hex))).toBe(true)
    }
  })

  it('sees further from higher ground', () => {
    const flat = setup()
    flat.setSight(3)
    flat.select({ q: 0, r: 0 })
    const onTheFlat = flat.visible.size

    setActivePinia(createPinia())
    const summit = useHexMapStore()
    const raised = flatField(6)
    raised.set('0,0', tile({ q: 0, r: 0 }, 4))
    summit.setTiles(raised)
    summit.setSight(3)
    summit.select({ q: 0, r: 0 })

    expect(summit.visible.size).toBeGreaterThan(onTheFlat)
  })

  it('forgets everything but the ground the party is standing in', () => {
    const store = setup()
    store.setSight(1)
    store.select({ q: -3, r: 0 })
    store.select({ q: 3, r: 0 })
    store.arrive()
    expect(store.explored.size).toBeGreaterThan(store.visible.size)

    store.forget()
    expect(store.explored.size).toBe(store.visible.size)
    expect(store.explored.has('3,0')).toBe(true)
    expect(store.explored.has('-3,0')).toBe(false)
  })

  it('forgets the map when the terrain underneath it is replaced', () => {
    const store = setup()
    store.setSight(1)
    store.select({ q: -3, r: 0 })
    store.select({ q: 3, r: 0 })
    store.arrive()

    store.setTiles(flatField(6))
    expect(store.explored.has('-3,0')).toBe(false)
  })

  it('clamps the sight setting to the slider range', () => {
    const store = setup()
    store.setSight(99)
    expect(store.sight).toBe(MAX_SIGHT)
    store.setSight(-4)
    expect(store.sight).toBe(MIN_SIGHT)
  })
})
