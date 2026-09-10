import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { hexKey, parseKey, type Axial, type HexKey } from '../hex/coords'
import type { VisionOptions } from '../hex/vision'
import { sightFrom, type PartySight } from '../terrain/sight'
import type { TerrainTile } from '../terrain/terrain'
import { findRoute, stepCostKm, type Route } from '../terrain/travel'

/** Zero means show the whole route as soon as it is found. */
export const AUTO_SPEED = 0
export const MAX_SPEED = 3

const NOTHING_IN_SIGHT: PartySight = { radius: 0, visible: new Set(), blocked: new Set() }

export const MIN_SIGHT = 1
export const MAX_SIGHT = 10
export const DEFAULT_SIGHT = 5

export const useHexMapStore = defineStore('hexMap', () => {
  const tiles = shallowRef<ReadonlyMap<HexKey, TerrainTile>>(new Map())
  const hovered = ref<HexKey | null>(null)
  const start = ref<HexKey | null>(null)
  const goal = ref<HexKey | null>(null)
  const allowWater = ref(false)

  const speed = ref(AUTO_SPEED)
  const playing = ref(false)
  const revealed = ref(0)

  const fog = ref(true)
  const showSight = ref(false)
  const sight = ref(DEFAULT_SIGHT)
  const explored = shallowRef<ReadonlySet<HexKey>>(new Set())

  const setTiles = (next: ReadonlyMap<HexKey, TerrainTile>): void => {
    tiles.value = next
    explored.value = new Set()
  }

  const setHovered = (hex: Axial | null): void => {
    hovered.value = hex ? hexKey(hex) : null
  }

  // Clicks cycle through the two endpoints: first sets the start, second the
  // goal, third starts a fresh route.
  const select = (hex: Axial | null): void => {
    if (!hex) return
    const key = hexKey(hex)

    if (!start.value || goal.value) {
      start.value = key
      goal.value = null
    } else if (key === start.value) {
      start.value = null
    } else {
      goal.value = key
    }
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

  /** The stretch of the route drawn right now: all of it unless animating. */
  const visibleHexes = computed<Axial[]>(() => {
    const hexes = route.value?.hexes ?? []
    return isAuto.value ? hexes : hexes.slice(0, revealed.value)
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
    if (!isAuto.value && walked.length > 0) return hexKey(walked[walked.length - 1])
    return start.value
  })

  const canArrive = computed(() => route.value !== null && (isAuto.value || finished.value))

  /** Commits the journey: the party takes up the destination as its new start. */
  const arrive = (): void => {
    if (!canArrive.value || !goal.value) return
    start.value = goal.value
    goal.value = null
  }

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

  const setSight = (next: number): void => {
    sight.value = Math.min(MAX_SIGHT, Math.max(MIN_SIGHT, Math.round(next)))
  }

  /** Wipes the map back to what the party can see from where it stands. */
  const forget = (): void => {
    explored.value = new Set(visible.value)
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
    fog,
    showSight,
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
  }
})

// Without this the store instance outlives every hot update, so a component
// reloading against a store that has since grown a new field crashes on it.
if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(useHexMapStore, import.meta.hot))
}
