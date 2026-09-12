import { Color3 } from '@babylonjs/core/Maths/math.color'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { distance, hexKey, range, type Axial, type HexKey } from '../hex/coords'
import { TERRAIN_DEFAULTS, type TerrainTile } from '../terrain/terrain'
import { KM_PER_HEX } from '../terrain/travel'
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

const setup = (): ReturnType<typeof useHexMapStore> => {
  const store = useHexMapStore()
  store.setTiles(flatField(6))
  return store
}

// On auto the party arrives the instant a leg is planned, so a route only sits
// still to be looked at once there is a walk to watch.
const route = (store: ReturnType<typeof useHexMapStore>, speed = 1): void => {
  store.setSpeed(speed)
  store.select({ q: 0, r: 0 })
  store.select({ q: 4, r: 0 })
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('selection', () => {
  it('puts the party down, then plans a leg', () => {
    const store = setup()
    store.setSpeed(1)

    store.select({ q: 0, r: 0 })
    expect(store.start).toBe('0,0')
    expect(store.goal).toBeNull()

    store.select({ q: 2, r: 0 })
    expect(store.goal).toBe('2,0')
  })

  it('walks the leg on the click that plans it while on auto', () => {
    const store = setup()
    store.select({ q: 0, r: 0 })

    store.select({ q: 2, r: 0 })

    expect(store.start).toBe('2,0')
    expect(store.goal).toBeNull()
    expect(store.journey.map((step) => step.hex)).toEqual(['0,0', '1,0', '2,0'])
  })

  it('replans instead of committing while the party is still walking', () => {
    const store = setup()
    store.setSpeed(2)
    store.select({ q: 0, r: 0 })
    store.select({ q: 2, r: 0 })
    store.play()

    store.select({ q: 0, r: 2 })

    expect(store.start).toBe('0,0')
    expect(store.goal).toBe('0,2')
    expect(store.journey).toEqual([])
  })

  it('calls off the planned leg when the party is clicked where it stands', () => {
    const store = setup()
    store.select({ q: 1, r: 1 })
    store.select({ q: 3, r: 1 })

    store.select({ q: 1, r: 1 })

    expect(store.start).toBe('1,1')
    expect(store.goal).toBeNull()
  })

  it('finds a route once both ends are set', () => {
    const store = setup()
    route(store)

    expect(store.route?.steps).toBe(4)
    expect(store.route?.km).toBe(40)
  })
})

describe('auto reveal', () => {
  it('walks the leg at once and leaves the path it took on the map', () => {
    const store = setup()
    route(store, 0)

    expect(store.isAuto).toBe(true)
    expect(store.start).toBe('4,0')
    expect(store.visibleHexes).toHaveLength(5)
  })

  it('ignores play while on auto', () => {
    const store = setup()
    route(store, 0)
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

  it('stops, and arrives, once the destination is reached', () => {
    const store = setup()
    route(store, 3)
    store.play()
    store.advanceReveal(99)

    expect(store.playing).toBe(false)
    expect(store.start).toBe('4,0')
    expect(store.visibleHexes).toHaveLength(5)
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
    expect(store.revealedKm).toBe(4 * KM_PER_HEX)
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

  it('stands at the far end of a leg it has walked at once', () => {
    const store = setup()
    route(store, 0)

    expect(store.isAuto).toBe(true)
    expect(store.partyHex).toBe('4,0')
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
    store.play()
    store.advanceReveal(99)

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

  it('arrives on its own once the animation reaches the destination', () => {
    const store = setup()
    route(store)
    store.play()
    store.advanceReveal(store.route!.hexes.length)

    expect(store.start).toBe('4,0')
    expect(store.journey.map((step) => step.hex)).toEqual(['0,0', '1,0', '2,0', '3,0', '4,0'])
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

  it('carves the same corridor on auto as it does at a walking speed', () => {
    const walk = (speed: number): Set<HexKey> => {
      setActivePinia(createPinia())
      const store = useHexMapStore()
      store.setTiles(flatField(6))
      store.setSight(1)
      store.setSpeed(speed)
      store.select({ q: -4, r: 0 })
      store.select({ q: 4, r: 0 })
      if (speed !== 0) {
        store.play()
        store.advanceReveal(99)
      }
      return new Set(store.explored)
    }

    const animated = walk(1)
    const auto = walk(0)

    expect(auto).toEqual(animated)
    expect(auto.has('0,0')).toBe(true)
  })

  it('carves a corridor of explored ground along the walked route', () => {
    const store = setup()
    store.setSight(1)
    store.setSpeed(1)
    store.select({ q: -4, r: 0 })
    store.select({ q: 4, r: 0 })
    store.play()

    // Held on to before the walk: reaching the far end arrives, and arriving
    // takes the route down behind the party.
    const walked = [...store.route!.hexes]
    for (let step = 0; step < walked.length; step++) store.advanceReveal(1)

    for (const hex of walked) {
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

    store.setTerrain({ seed: TERRAIN_DEFAULTS.seed + 1 })
    expect(store.explored.has('-3,0')).toBe(false)
  })

  // Restoring a session hands the tiles back before the memory of them, so
  // tiles arriving on their own must not count as a new world.
  it('keeps the map when the same world is handed back tile by tile', () => {
    const store = setup()
    store.setSight(1)
    store.select({ q: -3, r: 0 })
    store.select({ q: 3, r: 0 })
    store.arrive()

    store.setTiles(flatField(6))
    expect(store.explored.has('-3,0')).toBe(true)
  })

  it('clamps the sight setting to the slider range', () => {
    const store = setup()
    store.setSight(99)
    expect(store.sight).toBe(MAX_SIGHT)
    store.setSight(-4)
    expect(store.sight).toBe(MIN_SIGHT)
  })
})

describe('terrain controls', () => {
  it('starts on the generator defaults', () => {
    const store = setup()
    expect(store.terrain.seed).toBe(TERRAIN_DEFAULTS.seed)
    expect(store.terrain.relief).toBe(TERRAIN_DEFAULTS.relief)
  })

  it('patches one knob without disturbing the rest', () => {
    const store = setup()
    const before = store.terrain.scale
    store.setTerrain({ relief: 9 })

    expect(store.terrain.relief).toBe(9)
    expect(store.terrain.scale).toBe(before)
  })

  it('holds every knob inside its slider range', () => {
    const store = setup()
    store.setTerrain({ scale: 9999, seaLevel: -40, relief: -2 })

    expect(store.terrain.scale).toBe(TERRAIN_LIMITS.scale.max)
    expect(store.terrain.seaLevel).toBe(TERRAIN_LIMITS.seaLevel.min)
    expect(store.terrain.relief).toBe(TERRAIN_LIMITS.relief.min)
  })

  it('keeps the seed a whole number', () => {
    const store = setup()
    store.setTerrain({ seed: 12.7 })
    expect(store.terrain.seed).toBe(13)
  })

  it('rolls a fresh seed and leaves the shape of the world alone', () => {
    const store = setup()
    store.setTerrain({ relief: 6 })
    const seeds = new Set<number>()
    for (let i = 0; i < 20; i++) {
      store.reseed()
      seeds.add(store.terrain.seed)
    }

    expect(seeds.size).toBeGreaterThan(1)
    expect(store.terrain.relief).toBe(6)
  })
})

describe('saving and restoring', () => {
  it('describes the whole session in one snapshot', () => {
    const store = setup()
    store.setSight(2)
    store.setSpeed(2)
    store.setTerrain({ seed: 99, relief: 6 })
    store.select({ q: 0, r: 0 })
    store.select({ q: 2, r: 0 })
    store.allowWater = true

    const snapshot = store.snapshot

    expect(snapshot.terrain.seed).toBe(99)
    expect(snapshot.terrain.relief).toBe(6)
    expect(snapshot.start).toBe('0,0')
    expect(snapshot.goal).toBe('2,0')
    expect(snapshot.sight).toBe(2)
    expect(snapshot.speed).toBe(2)
    expect(snapshot.allowWater).toBe(true)
    expect([...snapshot.explored]).toContain('0,0')
  })

  it('puts a saved session back where it was', () => {
    const store = setup()
    store.restore({
      terrain: { seed: 77, scale: 60, seaLevel: 0.1, relief: 8 },
      start: '1,0',
      goal: '3,0',
      allowWater: true,
      fog: false,
      showSight: true,
      showHistory: true,
      sight: 4,
      speed: 1,
      explored: ['-5,0', '-4,0'] as HexKey[],
      journey: [{ hex: '1,0' as HexKey, km: 0, terrain: 'grass' }],
      standing: null,
    })

    expect(store.terrain).toEqual({ seed: 77, scale: 60, seaLevel: 0.1, relief: 8 })
    expect(store.start).toBe('1,0')
    expect(store.goal).toBe('3,0')
    expect(store.allowWater).toBe(true)
    expect(store.fog).toBe(false)
    expect(store.showSight).toBe(true)
    expect(store.showHistory).toBe(true)
    expect(store.sight).toBe(4)
    expect(store.speed).toBe(1)
    expect(store.explored.has('-5,0')).toBe(true)
    expect(store.journey).toEqual([{ hex: '1,0', km: 0, terrain: 'grass' }])
    expect(store.route).not.toBeNull()
  })

  // The restored terrain is a new world as far as the store is concerned, and
  // a new world forgets: the explored set has to survive that on the way in.
  it('keeps the remembered ground it was handed with a new seed', () => {
    const store = setup()
    store.restore({
      terrain: { seed: TERRAIN_DEFAULTS.seed + 5, scale: 55, seaLevel: 0, relief: 7 },
      start: null,
      goal: null,
      allowWater: false,
      fog: true,
      showSight: false,
      showHistory: false,
      sight: 3,
      speed: 0,
      explored: ['2,2'] as HexKey[],
      journey: [],
      standing: null,
    })

    expect(store.explored.has('2,2')).toBe(true)
  })

  it('does not treat a knob set back to its own value as a new world', () => {
    const store = setup()
    store.setSight(1)
    store.select({ q: 0, r: 0 })
    const before = store.terrain

    store.setTerrain({ relief: store.terrain.relief })

    expect(store.terrain).toBe(before)
    expect(store.explored.has('0,0')).toBe(true)
  })
})

describe('the journey log', () => {
  it('starts empty', () => {
    const store = setup()
    expect(store.journey).toEqual([])
    expect(store.travelledKm).toBe(0)
  })

  it('writes down every hex of a committed leg, the hex it set out from first', () => {
    const store = setup()
    store.select({ q: 0, r: 0 })
    store.select({ q: 2, r: 0 })
    store.arrive()

    expect(store.journey.map((step) => step.hex)).toEqual(['0,0', '1,0', '2,0'])
    expect(store.journey[0].km).toBe(0)
    expect(store.travelledKm).toBe(2 * KM_PER_HEX)
  })

  it('chains one leg onto the last without repeating the hex between them', () => {
    const store = setup()
    store.select({ q: 0, r: 0 })
    store.select({ q: 2, r: 0 })
    store.arrive()
    store.select({ q: 4, r: 0 })
    store.arrive()

    expect(store.journey.map((step) => step.hex)).toEqual(['0,0', '1,0', '2,0', '3,0', '4,0'])
    expect(store.travelledKm).toBe(4 * KM_PER_HEX)
  })

  it('records what each step cost, so a climb reads as one', () => {
    setActivePinia(createPinia())
    const store = useHexMapStore()
    const raised = flatField(6)
    raised.set('1,0', tile({ q: 1, r: 0 }, 3))
    store.setTiles(raised)

    store.select({ q: 0, r: 0 })
    store.select({ q: 1, r: 0 })
    store.arrive()

    expect(store.journey[1]).toEqual({ hex: '1,0', km: KM_PER_HEX * 2, terrain: 'grass' })
  })

  it('leaves a route the party never walked out of the history', () => {
    const store = setup()
    store.setSpeed(2)
    store.select({ q: 0, r: 0 })
    store.select({ q: 2, r: 0 })

    expect(store.journey).toEqual([])
  })

  it('stands the party back on a step it has already walked', () => {
    const store = setup()
    store.select({ q: 0, r: 0 })
    store.select({ q: 4, r: 0 })

    store.recall(2)

    expect(store.start).toBe('2,0')
    expect(store.goal).toBeNull()
    expect(store.journey).toHaveLength(5)
    expect(store.selectedTraveler.standing).toBe(2)
  })

  it('refuses to recall the party to a step that is not in the log', () => {
    const store = setup()
    store.select({ q: 0, r: 0 })
    store.select({ q: 2, r: 0 })

    store.recall(99)
    store.recall(-1)

    expect(store.start).toBe('2,0')
    expect(store.selectedTraveler.standing).toBeNull()
  })

  it('starts the record again from where the party stands', () => {
    const store = setup()
    store.select({ q: 0, r: 0 })
    store.select({ q: 4, r: 0 })

    store.clearLog()

    expect(store.journey).toEqual([{ hex: '4,0', km: 0, terrain: 'grass' }])
    expect(store.travelledKm).toBe(0)
    expect(store.selectedTraveler.standing).toBeNull()
  })

  it('leaves the log alone when the party retraces the path it recorded', () => {
    const store = setup()
    store.select({ q: 0, r: 0 })
    store.select({ q: 4, r: 0 })
    const recorded = store.journey

    store.recall(1)
    store.select({ q: 3, r: 0 })

    expect(store.journey).toEqual(recorded)
    expect(store.start).toBe('3,0')
    expect(store.selectedTraveler.standing).toBe(3)
  })

  it('adds only the new ground when the party walks on past the record', () => {
    const store = setup()
    store.select({ q: 0, r: 0 })
    store.select({ q: 2, r: 0 })

    store.recall(1)
    store.select({ q: 4, r: 0 })

    expect(store.journey.map((step) => step.hex)).toEqual(['0,0', '1,0', '2,0', '3,0', '4,0'])
    expect(store.selectedTraveler.standing).toBeNull()
  })

  it('starts the record over where the party turns off the recorded path', () => {
    const store = setup()
    store.select({ q: 0, r: 0 })
    store.select({ q: 4, r: 0 })

    store.recall(2)
    store.select({ q: 2, r: 2 })

    expect(store.journey.map((step) => step.hex)).toEqual(['2,0', '2,1', '2,2'])
    expect(store.start).toBe('2,2')
    expect(store.selectedTraveler.standing).toBeNull()
  })

  it('takes the map back with the party when it winds back down the log', () => {
    const store = setup()
    store.setSight(1)
    store.select({ q: 0, r: 0 })
    store.select({ q: 4, r: 0 })
    expect(store.explored.has('4,0')).toBe(true)

    store.recall(1)

    // Seen from the first two steps and still seen; the far end was only ever
    // reached by the steps that have just been wound back.
    expect(store.explored.has('0,0')).toBe(true)
    expect(store.explored.has('2,0')).toBe(true)
    expect(store.explored.has('4,0')).toBe(false)
  })

  it('reveals the ground again when the party walks back up its own path', () => {
    const store = setup()
    store.setSight(1)
    store.select({ q: 0, r: 0 })
    store.select({ q: 4, r: 0 })

    store.recall(1)
    expect(store.explored.has('4,0')).toBe(false)

    store.select({ q: 4, r: 0 })
    expect(store.explored.has('4,0')).toBe(true)
  })

  it('keeps what another party has seen when this one winds back', () => {
    const store = setup()
    store.setSight(1)
    const scouts = store.addTraveler('scouts')
    store.selectTraveler(scouts.id)
    store.select({ q: 0, r: 3 })
    store.select({ q: 0, r: 5 })

    store.selectTraveler(store.travelers[0].id)
    store.select({ q: 0, r: 0 })
    store.select({ q: 4, r: 0 })
    store.recall(1)

    expect(store.explored.has('4,0')).toBe(false)
    expect(store.explored.has('0,5')).toBe(true)
  })

  it('stands the token on the recalled hex even at a walking speed', () => {
    const store = setup()
    route(store)
    store.play()
    store.advanceReveal(99)
    expect(store.partyHex).toBe('4,0')

    store.recall(1)

    expect(store.partyHex).toBe('1,0')
  })

  it('recalls only the party that is selected', () => {
    const store = setup()
    store.select({ q: 0, r: 0 })
    store.select({ q: 4, r: 0 })

    const scouts = store.addTraveler('scouts')
    store.selectTraveler(scouts.id)
    store.select({ q: -1, r: 0 })
    store.select({ q: -4, r: 0 })
    store.recall(1)

    expect(store.start).toBe('-2,0')
    expect(store.travelers[0].at).toBe('4,0')
    expect(store.travelers[0].standing).toBeNull()
  })

  it('starts the history over when the party is put in a new world', () => {
    const store = setup()
    store.select({ q: 0, r: 0 })
    store.select({ q: 2, r: 0 })
    store.arrive()

    store.setTerrain({ seed: TERRAIN_DEFAULTS.seed + 3 })
    expect(store.journey).toEqual([])
    expect(store.travelledKm).toBe(0)
  })
})

describe('travelers', () => {
  it('starts with one party on the map, already selected', () => {
    const store = setup()

    expect(store.travelers).toHaveLength(1)
    expect(store.selectedTraveler.name).toBe('the party')
    expect(store.selectedTraveler.at).toBeNull()
  })

  it('adds a party without handing it the map', () => {
    const store = setup()
    const first = store.selectedTraveler.id

    const added = store.addTraveler('scouts')

    expect(store.travelers).toHaveLength(2)
    expect(store.travelers[1].name).toBe('scouts')
    expect(store.selectedTraveler.id).toBe(first)
    expect(added.color).not.toBe(store.travelers[0].color)
  })

  it('moves whichever party is selected, and only that one', () => {
    const store = setup()
    store.select({ q: 0, r: 0 })

    const scouts = store.addTraveler('scouts')
    store.selectTraveler(scouts.id)
    store.select({ q: 3, r: 0 })

    expect(store.travelers[0].at).toBe('0,0')
    expect(store.travelers[1].at).toBe('3,0')
    expect(store.start).toBe('3,0')
  })

  it('keeps a journey with the party that walked it', () => {
    const store = setup()
    store.select({ q: 0, r: 0 })
    store.select({ q: 2, r: 0 })

    const scouts = store.addTraveler('scouts')
    store.selectTraveler(scouts.id)

    expect(store.journey).toEqual([])
    expect(store.travelledKm).toBe(0)
    expect(store.travelers[0].journey.map((step) => step.hex)).toEqual(['0,0', '1,0', '2,0'])
  })

  it('hands the map to somebody else when the selected party is removed', () => {
    const store = setup()
    const scouts = store.addTraveler('scouts')
    store.selectTraveler(scouts.id)

    store.removeTraveler(scouts.id)

    expect(store.travelers).toHaveLength(1)
    expect(store.selectedTraveler.name).toBe('the party')
  })

  it('will not leave the map with nobody on it', () => {
    const store = setup()
    store.removeTraveler(store.selectedTraveler.id)
    expect(store.travelers).toHaveLength(1)
  })

  it('renames a party, but not to nothing', () => {
    const store = setup()
    const id = store.selectedTraveler.id

    store.renameTraveler(id, '  the caravan  ')
    expect(store.selectedTraveler.name).toBe('the caravan')

    store.renameTraveler(id, '   ')
    expect(store.selectedTraveler.name).toBe('the caravan')
  })

  it('ignores a selection that names nobody', () => {
    const store = setup()
    const id = store.selectedTraveler.id

    store.selectTraveler('nobody')
    expect(store.selectedTraveler.id).toBe(id)
  })

  it('starts every party over when the world underneath them changes', () => {
    const store = setup()
    store.select({ q: 0, r: 0 })
    store.select({ q: 2, r: 0 })

    const scouts = store.addTraveler('scouts')
    store.selectTraveler(scouts.id)
    store.select({ q: -2, r: 0 })
    store.select({ q: -4, r: 0 })

    store.setTerrain({ seed: TERRAIN_DEFAULTS.seed + 7 })

    expect(store.travelers.every((one) => one.journey.length === 0)).toBe(true)
  })
})

describe('the path the arrows trace', () => {
  it('follows only the last leg while the history is off', () => {
    const store = setup()
    store.select({ q: 0, r: 0 })
    store.select({ q: 2, r: 0 })
    store.select({ q: 2, r: 2 })

    expect(store.pathHexes).toEqual(store.visibleHexes)
    expect(store.pathHexes).toHaveLength(3)
  })

  it('follows the whole record once the history is on', () => {
    const store = setup()
    store.select({ q: 0, r: 0 })
    store.select({ q: 2, r: 0 })
    store.select({ q: 2, r: 2 })

    store.showHistory = true

    expect(store.pathHexes.map(hexKey)).toEqual(store.journey.map((step) => step.hex))
  })

  it('never draws the same leg twice', () => {
    const store = setup()
    store.showHistory = true
    store.select({ q: 0, r: 0 })
    store.select({ q: 2, r: 0 })

    const drawn = store.pathHexes.map(hexKey)
    expect(new Set(drawn).size).toBe(drawn.length)
  })

  it('stops at the party when it has been recalled back down the log', () => {
    const store = setup()
    store.showHistory = true
    store.select({ q: 0, r: 0 })
    store.select({ q: 4, r: 0 })

    store.recall(2)

    expect(store.pathHexes.map(hexKey)).toEqual(['0,0', '1,0', '2,0'])
  })

  // The arrows are line segments between neighbours, so a gap would draw one
  // straight across the map.
  it('draws one unbroken line while a leg is still being walked', () => {
    const store = setup()
    store.showHistory = true
    store.setSpeed(1)
    store.select({ q: 0, r: 0 })
    store.select({ q: 2, r: 0 })
    store.play()
    store.advanceReveal(99)
    store.select({ q: 2, r: 2 })
    store.play()
    store.advanceReveal(1)

    const drawn = store.pathHexes
    for (let i = 1; i < drawn.length; i++) {
      expect(distance(drawn[i - 1], drawn[i])).toBe(1)
    }
    expect(drawn.length).toBeGreaterThan(3)
  })
})
