import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { hexKey, parseKey, type Axial, type HexKey } from '../hex/coords'
import type { TerrainTile } from '../terrain/terrain'
import { findRoute, type Route } from '../terrain/travel'

export const useHexMapStore = defineStore('hexMap', () => {
  const tiles = shallowRef<ReadonlyMap<HexKey, TerrainTile>>(new Map())
  const hovered = ref<HexKey | null>(null)
  const start = ref<HexKey | null>(null)
  const goal = ref<HexKey | null>(null)
  const allowWater = ref(false)

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

  return {
    tiles,
    hovered,
    start,
    goal,
    allowWater,
    route,
    hoveredTile,
    setTiles,
    setHovered,
    select,
    clear,
  }
})
