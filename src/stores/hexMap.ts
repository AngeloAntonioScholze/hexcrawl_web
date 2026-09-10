import { defineStore } from 'pinia'
import { computed, ref, shallowRef, watch } from 'vue'
import { hexKey, parseKey, type Axial, type HexKey } from '../hex/coords'
import type { TerrainTile } from '../terrain/terrain'
import { findRoute, stepCostKm, type Route } from '../terrain/travel'

/** Zero means show the whole route as soon as it is found. */
export const AUTO_SPEED = 0
export const MAX_SPEED = 3

export const useHexMapStore = defineStore('hexMap', () => {
  const tiles = shallowRef<ReadonlyMap<HexKey, TerrainTile>>(new Map())
  const hovered = ref<HexKey | null>(null)
  const start = ref<HexKey | null>(null)
  const goal = ref<HexKey | null>(null)
  const allowWater = ref(false)

  const speed = ref(AUTO_SPEED)
  const playing = ref(false)
  const revealed = ref(0)

  const setTiles = (next: ReadonlyMap<HexKey, TerrainTile>): void => {
    tiles.value = next
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
