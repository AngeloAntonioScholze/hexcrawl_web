import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref, shallowRef, watch, type WritableComputedRef } from 'vue'
import { hexKey, parseKey, type Axial, type HexKey } from '../hex/coords'
import type { VisionOptions } from '../hex/vision'
import type { MapSnapshot } from '../persistence/mapState'
import { sightFrom, type PartySight } from '../terrain/sight'
import { TERRAIN_DEFAULTS, type TerrainId, type TerrainTile } from '../terrain/terrain'
import { findRoute, stepCostKm, type Route } from '../terrain/travel'

/** Zero means show the whole route as soon as it is found. */
export const AUTO_SPEED = 0
export const MAX_SPEED = 3

const NOTHING_IN_SIGHT: PartySight = { radius: 0, visible: new Set(), blocked: new Set() }

/** One hex of ground the party has actually stood on, in the order it did. */
export interface JourneyStep {
  hex: HexKey
  /** What entering this hex cost; zero for the hex the journey started on. */
  km: number
  terrain: TerrainId
}

/**
 * Someone crossing the map. The party used to be implied by a start hex and a
 * goal; now it is one of these, and everything a single party owned — where it
 * stands, where it is headed, where it has been — belongs to one of them.
 */
export interface Traveler {
  id: string
  name: string
  color: string
  /** Hex it stands on, or null before it has been put on the map. */
  at: HexKey | null
  goal: HexKey | null
  journey: readonly JourneyStep[]
  /**
   * Which entry of the log it is standing on after being recalled back down it,
   * or null when it stands at the head. An index rather than a hex, because a
   * crawl can cross the same hex twice and only one of those rows is the one
   * the party went back to.
   */
  standing: number | null
  /** The leg it last walked, kept drawn behind it after it arrives. */
  walkedLeg: Axial[]
}

// Enough to tell a handful of parties apart on the map and in the list; it
// wraps rather than running out.
const TRAVELER_COLORS: readonly string[] = [
  '#e0b25a',
  '#6fa8dc',
  '#8fbc6a',
  '#c17f9e',
  '#d98b5f',
  '#7fc4bd',
]

/** The terrain knobs the map panel is allowed to turn. */
export interface TerrainControls {
  seed: number
  scale: number
  seaLevel: number
  relief: number
}

export const TERRAIN_LIMITS = {
  scale: { min: 15, max: 150, step: 5 },
  seaLevel: { min: -0.5, max: 0.5, step: 0.05 },
  relief: { min: 2, max: 14, step: 0.5 },
} as const

const MAX_SEED = 1_000_000

const newTraveler = (name: string, index: number): Traveler => ({
  id: crypto.randomUUID(),
  name,
  color: TRAVELER_COLORS[index % TRAVELER_COLORS.length],
  at: null,
  goal: null,
  journey: [],
  standing: null,
  walkedLeg: [],
})

export const MIN_SIGHT = 1
export const MAX_SIGHT = 10
export const DEFAULT_SIGHT = 5

export const useHexMapStore = defineStore('hexMap', () => {
  const tiles = shallowRef<ReadonlyMap<HexKey, TerrainTile>>(new Map())
  const hovered = ref<HexKey | null>(null)
  const allowWater = ref(false)

  // Travelers are held as whole records and replaced rather than mutated, so a
  // journey thousands of steps long never becomes thousands of reactive proxies.
  const travelers = shallowRef<readonly Traveler[]>([newTraveler('the party', 0)])
  const selectedId = ref<string>(travelers.value[0].id)

  /**
   * Whoever the map is currently listening to. The list is never allowed to run
   * empty, so there is always one, and callers never have to test for it.
   */
  const selectedTraveler = computed<Traveler>(
    () => travelers.value.find((one) => one.id === selectedId.value) ?? travelers.value[0],
  )

  const patch = (id: string, change: Partial<Traveler>): void => {
    travelers.value = travelers.value.map((one) => (one.id === id ? { ...one, ...change } : one))
  }

  const patchSelected = (change: Partial<Traveler>): void => patch(selectedId.value, change)

  const field = <K extends keyof Traveler>(key: K): WritableComputedRef<Traveler[K]> =>
    computed({
      get: () => selectedTraveler.value[key],
      set: (value) => patchSelected({ [key]: value } as Partial<Traveler>),
    })

  // The map, the scene and the save file all still speak of one party. They are
  // reading the selected traveler through these.
  const start = field('at')
  const goal = field('goal')
  const journey = field('journey')
  const walkedLeg = field('walkedLeg')

  const selectTraveler = (id: string): void => {
    if (travelers.value.some((one) => one.id === id)) selectedId.value = id
  }

  const addTraveler = (name?: string): Traveler => {
    const made = newTraveler(name ?? `party ${travelers.value.length + 1}`, travelers.value.length)
    travelers.value = [...travelers.value, made]
    return made
  }

  /** The map always has somebody on it, so the last traveler cannot be removed. */
  const removeTraveler = (id: string): void => {
    if (travelers.value.length === 1) return
    const remaining = travelers.value.filter((one) => one.id !== id)
    if (remaining.length === travelers.value.length) return

    travelers.value = remaining
    if (selectedId.value === id) selectedId.value = remaining[0].id
  }

  const renameTraveler = (id: string, name: string): void => {
    const trimmed = name.trim()
    if (trimmed) patch(id, { name: trimmed })
  }

  const speed = ref(AUTO_SPEED)
  const playing = ref(false)
  const revealed = ref(0)

  const terrain = ref<TerrainControls>({
    seed: TERRAIN_DEFAULTS.seed,
    scale: TERRAIN_DEFAULTS.scale,
    seaLevel: TERRAIN_DEFAULTS.seaLevel,
    relief: TERRAIN_DEFAULTS.relief,
  })

  const fog = ref(true)
  const showSight = ref(false)
  const showHistory = ref(false)
  const sight = ref(DEFAULT_SIGHT)
  const explored = shallowRef<ReadonlySet<HexKey>>(new Set())

  const setTiles = (next: ReadonlyMap<HexKey, TerrainTile>): void => {
    tiles.value = next
  }

  const setHovered = (hex: Axial | null): void => {
    hovered.value = hex ? hexKey(hex) : null
  }

  // One click, one leg. The first puts the party on the map; after that a click
  // is the journey itself, so the party sets off for it and arrives under its
  // own steam: at once on auto, and at the end of the walk on any other speed.
  const select = (hex: Axial | null): void => {
    if (!hex) return
    const key = hexKey(hex)

    if (!start.value) {
      start.value = key
      return
    }

    // Clicking the ground the party stands on calls off the leg it was about to
    // walk rather than taking the party off the map.
    if (key === start.value) {
      goal.value = null
      return
    }

    goal.value = key
    if (isAuto.value) arrive()
  }

  const clear = (): void => {
    start.value = null
    goal.value = null
  }

  const route = computed<Route | null>(() => {
    if (!start.value || !goal.value) return null
    return findRoute(tiles.value, parseKey(start.value), parseKey(goal.value), {
      allowWater: allowWater.value,
    })
  })

  const hoveredTile = computed<TerrainTile | null>(() =>
    hovered.value ? (tiles.value.get(hovered.value) ?? null) : null,
  )

  const isAuto = computed(() => speed.value === AUTO_SPEED)

  /**
   * The stretch of the route drawn right now: all of it unless animating, and
   * the leg just walked once the party has arrived and the route behind it is
   * gone, so the path it took does not blink off the map on arrival.
   */
  const visibleHexes = computed<Axial[]>(() => {
    const hexes = route.value?.hexes
    if (!hexes) return walkedLeg.value
    return isAuto.value ? hexes : hexes.slice(0, revealed.value)
  })

  /**
   * What the arrows trace. Off, that is the leg being walked or the one just
   * finished. On, it is the whole record up to the row the party stands on,
   * continuing into a route still being walked — one unbroken line ending at
   * the party, rather than a trail that jumps wherever it was recalled from.
   */
  const pathHexes = computed<Axial[]>(() => {
    if (!showHistory.value) return visibleHexes.value

    const log = journey.value
    const last = selectedTraveler.value.standing ?? log.length - 1
    const behind = log.slice(0, last + 1).map((step) => parseKey(step.hex))
    if (behind.length === 0) return visibleHexes.value

    // Only a route still under way is missing from the record; the leg drawn
    // after arrival is already in it and would be laid on top of itself.
    const ahead = route.value ? visibleHexes.value.slice(1) : []
    return [...behind, ...ahead]
  })

  const revealedKm = computed(() => {
    const hexes = visibleHexes.value
    let km = 0
    for (let i = 1; i < hexes.length; i++) {
      const from = tiles.value.get(hexKey(hexes[i - 1]))
      const to = tiles.value.get(hexKey(hexes[i]))
      if (from && to) km += stepCostKm(from, to)
    }
    return km
  })

  const finished = computed(
    () => !isAuto.value && route.value !== null && revealed.value >= route.value.hexes.length,
  )

  // The pawn rides the head of the walked stretch while the route animates and
  // otherwise stands on the start hex, so the party is never a second source of
  // truth that can drift away from the route.
  const partyHex = computed<HexKey | null>(() => {
    const walked = visibleHexes.value

    // Only while a route is actually being walked: once it is committed the
    // drawn path is a record of where the party went, and the party is at the
    // hex it stands on — which a recall back down the log can move.
    const walking = route.value !== null && !isAuto.value
    if (walking && walked.length > 0) return hexKey(walked[walked.length - 1])
    return start.value
  })

  const canArrive = computed(() => route.value !== null && (isAuto.value || finished.value))

  // Only committed travel is history: a route half walked and then abandoned
  // never happened, and auto mode logs the same hexes as a walked animation.
  const stepsFor = (hexes: readonly Axial[]): JourneyStep[] => {
    const steps: JourneyStep[] = []
    for (let i = 1; i < hexes.length; i++) {
      const from = tiles.value.get(hexKey(hexes[i - 1]))
      const to = tiles.value.get(hexKey(hexes[i]))
      if (from && to) {
        steps.push({ hex: hexKey(hexes[i]), km: stepCostKm(from, to), terrain: to.terrain })
      }
    }
    return steps
  }

  /** Where a record begins: standing somewhere cost nothing to do. */
  const originStep = (hex: HexKey): JourneyStep[] => {
    const tile = tiles.value.get(hex)
    return tile ? [{ hex, km: 0, terrain: tile.terrain }] : []
  }

  type LogState = Pick<Traveler, 'journey' | 'standing'>

  /**
   * What a walked leg does to the record. From the head of the log it simply
   * adds to it. From a hex the party was recalled back to, the leg either
   * retraces what the log already says — which changes nothing, the party just
   * moves along it — or contradicts it, and a recorded future the party turned
   * away from never happened, so the record starts again at the turn.
   */
  const logAfter = (walked: Route): LogState => {
    const log = journey.value
    const from = selectedTraveler.value.standing
    const entered = walked.hexes.length - 1

    if (from === null || from >= log.length - 1) {
      const opening = log.length === 0 ? originStep(hexKey(walked.hexes[0])) : []
      return { journey: [...log, ...opening, ...stepsFor(walked.hexes)], standing: null }
    }

    const ahead = log.length - 1 - from
    const shared = Math.min(ahead, entered)
    const retraced = log
      .slice(from + 1, from + 1 + shared)
      .every((step, i) => step.hex === hexKey(walked.hexes[i + 1]))

    if (!retraced) {
      return {
        journey: [...originStep(log[from].hex), ...stepsFor(walked.hexes)],
        standing: null,
      }
    }

    // Retraced as far as the record went. Anything past its end is new ground,
    // and the party is only still on the record if the leg ended inside it.
    return {
      journey: [...log, ...stepsFor(walked.hexes.slice(ahead))],
      standing: entered < ahead ? from + entered : null,
    }
  }

  /**
   * Ground the party saw on its way through, rather than only from where it
   * ended up. An animated walk reveals this hex by hex as it goes; auto travel
   * is never anywhere in between, so without this the same leg would leave a
   * different map depending on the speed it was walked at.
   */
  const revealAlong = (hexes: readonly Axial[]): void => {
    const seen = new Set(explored.value)
    for (const hex of hexes) {
      for (const key of sightFrom(tiles.value, hex, vision.value).visible) seen.add(key)
    }
    explored.value = seen
  }

  /** Commits the journey: the party takes up the destination as its new start. */
  const arrive = (): void => {
    const walked = route.value
    if (!canArrive.value || !goal.value || !walked) return

    patchSelected({ ...logAfter(walked), walkedLeg: walked.hexes, at: goal.value, goal: null })
    revealAlong(walked.hexes)
  }

  /**
   * Puts the party back on ground it has already crossed. The log is a record
   * of where it has been, not of where it is, so stepping back down it leaves
   * the history it was read off intact.
   */
  const recall = (step: number): void => {
    const log = journey.value
    if (step < 0 || step >= log.length) return

    patchSelected({ at: log[step].hex, goal: null, standing: step, walkedLeg: [] })
    explored.value = exploredSoFar()
  }

  /**
   * Everything the parties can account for having seen: what each could see
   * from every step of its own log up to the one it is standing on. Winding a
   * party back down its log takes the map back with it, so recalling does not
   * leave it looking at ground it has not reached yet.
   *
   * Read with the sight the parties have now rather than whatever the slider
   * said at the time; the record is of where they stood, not of how far they
   * could see while standing there.
   */
  const exploredSoFar = (): Set<HexKey> => {
    const seen = new Set<HexKey>()
    for (const one of travelers.value) {
      const last = one.standing ?? one.journey.length - 1
      for (let i = 0; i <= last; i++) {
        const field = sightFrom(tiles.value, parseKey(one.journey[i].hex), vision.value)
        for (const key of field.visible) seen.add(key)
      }
    }
    return seen
  }

  /** Starts the record again from wherever the party is standing now. */
  const clearLog = (): void => {
    const at = start.value
    patchSelected({ journey: at ? originStep(at) : [], standing: null, walkedLeg: [] })
  }

  /** Everything the party has walked so far, over every leg it has committed. */
  const travelledKm = computed(() => journey.value.reduce((total, step) => total + step.km, 0))

  const vision = computed<VisionOptions>(() => ({ radius: sight.value }))

  /** Everything within reach of the party, split by what the terrain hides. */
  const sightField = computed<PartySight>(() =>
    partyHex.value
      ? sightFrom(tiles.value, parseKey(partyHex.value), vision.value)
      : NOTHING_IN_SIGHT,
  )

  const visible = computed<ReadonlySet<HexKey>>(() => sightField.value.visible)

  /** Within reach but behind something; the shadows the sight overlay draws. */
  const blocked = computed<ReadonlySet<HexKey>>(() => sightField.value.blocked)

  const reach = computed(() => sightField.value.radius)

  const clamp = (value: number, { min, max }: { min: number; max: number }): number =>
    Math.min(max, Math.max(min, value))

  const sameTerrain = (a: TerrainControls, b: TerrainControls): boolean =>
    a.seed === b.seed && a.scale === b.scale && a.seaLevel === b.seaLevel && a.relief === b.relief

  const setTerrain = (patch: Partial<TerrainControls>): void => {
    const merged = { ...terrain.value, ...patch }
    const next: TerrainControls = {
      seed: Math.round(merged.seed),
      scale: clamp(merged.scale, TERRAIN_LIMITS.scale),
      seaLevel: clamp(merged.seaLevel, TERRAIN_LIMITS.seaLevel),
      relief: clamp(merged.relief, TERRAIN_LIMITS.relief),
    }

    // A slider dragged back to where it started is not a new world: without
    // this the map would regenerate, and forget itself, over an identical seed.
    if (sameTerrain(next, terrain.value)) return
    terrain.value = next
  }

  const reseed = (): void => {
    setTerrain({ seed: Math.floor(Math.random() * MAX_SEED) })
  }

  const setSight = (next: number): void => {
    sight.value = Math.min(MAX_SIGHT, Math.max(MIN_SIGHT, Math.round(next)))
  }

  /** Wipes the map back to what the party can see from where it stands. */
  const forget = (): void => {
    explored.value = new Set(visible.value)
  }

  /** Everything a saved session is made of, ready for the persistence layer. */
  const snapshot = computed<MapSnapshot>(() => ({
    terrain: terrain.value,
    start: start.value,
    goal: goal.value,
    allowWater: allowWater.value,
    fog: fog.value,
    showSight: showSight.value,
    showHistory: showHistory.value,
    sight: sight.value,
    speed: speed.value,
    explored: [...explored.value],
    journey: journey.value,
    standing: selectedTraveler.value.standing,
  }))

  // Terrain goes in first: laying down a new world is what wipes the map, so
  // the remembered ground has to be handed back after it, not before.
  const restore = (saved: MapSnapshot): void => {
    setTerrain(saved.terrain)
    allowWater.value = saved.allowWater
    fog.value = saved.fog
    showSight.value = saved.showSight
    showHistory.value = saved.showHistory
    setSight(saved.sight)
    setSpeed(saved.speed)
    start.value = saved.start
    goal.value = saved.goal
    explored.value = new Set(saved.explored)
    patchSelected({ journey: saved.journey, standing: saved.standing })
  }

  const play = (): void => {
    if (!route.value || isAuto.value) return
    revealed.value = 1
    playing.value = true
  }

  const stop = (): void => {
    playing.value = false
  }

  const advanceReveal = (steps: number): void => {
    const total = route.value?.hexes.length ?? 0
    revealed.value = Math.min(total, revealed.value + steps)
    if (revealed.value >= total) playing.value = false
  }

  const setSpeed = (next: number): void => {
    speed.value = Math.min(MAX_SPEED, Math.max(AUTO_SPEED, Math.round(next)))
    playing.value = false
    revealed.value = 0
  }

  // A new world is a different place, so nothing the party learned about the
  // last one still describes the ground under it. Flushed synchronously so a
  // restore can hand a remembered map back on the line after it sets the seed.
  watch(
    terrain,
    () => {
      explored.value = new Set()
      travelers.value = travelers.value.map((one) => ({
        ...one,
        journey: [],
        standing: null,
        walkedLeg: [],
      }))
    },
    { flush: 'sync' },
  )

  // Sight is momentary but exploration is not: every hex the party has ever
  // laid eyes on stays on the map, so travelling carves a corridor of known
  // ground behind it. Flushed synchronously because a party stepping along a
  // route is gone from each hex before a queued watcher would ever run.
  watch(
    visible,
    (seen) => {
      if (seen.size === 0) return
      const next = new Set(explored.value)
      for (const key of seen) next.add(key)
      if (next.size !== explored.value.size) explored.value = next
    },
    { flush: 'sync', immediate: true },
  )

  // The party walks itself in: an animated leg is committed the moment the
  // reveal reaches the far end, which is what the arrival button used to do by
  // hand. Auto has no walk to wait on and commits in select.
  watch(
    finished,
    (arrived) => {
      if (arrived) arrive()
    },
    { flush: 'sync' },
  )

  // A new route is never half-played: picking new endpoints or toggling water
  // rewinds the animation. Flushed synchronously so no frame can draw a stale
  // reveal against a route that has already changed.
  watch(
    route,
    () => {
      playing.value = false
      revealed.value = 0
    },
    { flush: 'sync' },
  )

  return {
    tiles,
    hovered,
    start,
    goal,
    allowWater,
    speed,
    playing,
    revealed,
    route,
    hoveredTile,
    isAuto,
    visibleHexes,
    revealedKm,
    finished,
    partyHex,
    canArrive,
    arrive,
    journey,
    travelledKm,
    recall,
    clearLog,
    travelers,
    selectedTraveler,
    selectTraveler,
    addTraveler,
    removeTraveler,
    renameTraveler,
    terrain,
    setTerrain,
    reseed,
    fog,
    showSight,
    showHistory,
    pathHexes,
    sight,
    reach,
    explored,
    visible,
    blocked,
    setSight,
    forget,
    setTiles,
    setHovered,
    select,
    clear,
    play,
    stop,
    advanceReveal,
    setSpeed,
    snapshot,
    restore,
  }
})

// Without this the store instance outlives every hot update, so a component
// reloading against a store that has since grown a new field crashes on it.
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useHexMapStore, import.meta.hot))
}
