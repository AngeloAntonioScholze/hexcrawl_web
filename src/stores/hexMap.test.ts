import { Color3 } from '@babylonjs/core/Maths/math.color'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { hexKey, range, type Axial, type HexKey } from '../hex/coords'
import type { TerrainTile } from '../terrain/terrain'
import { KM_PER_HEX } from '../terrain/travel'
import { useHexMapStore } from './hexMap'

const tile = (hex: Axial, elevation = 1): TerrainTile => ({
  hex,
  terrain: 'grass',
  height: elevation,
  elevation,
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
