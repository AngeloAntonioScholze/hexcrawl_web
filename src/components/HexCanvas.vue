<script setup lang="ts">
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { computed, ref, watch } from 'vue'
import { hexKey, parseKey, spiral, type HexKey } from '../hex/coords'
import { createLayout } from '../hex/layout'
import { useRouteReveal } from '../composables/useRouteReveal'
import { useHexScene } from '../engine/useHexScene'
import { useHexMapStore } from '../stores/hexMap'
import { createTerrain, type TerrainTile } from '../terrain/terrain'
import type { HexTile } from '../engine/hexGrid'

const props = withDefaults(
  defineProps<{
    radius?: number
    hexSize?: number
    gap?: number
    bevel?: number
    octaves?: number
  }>(),
  {
    radius: 40,
    hexSize: 2,
    gap: 0.06,
    bevel: 0.14,
    octaves: 4,
  },
)

const HOVER_TINT = new Color3(0.55, 0.62, 0.72)
const ROUTE_TINT = new Color3(0.86, 0.7, 0.36)
const HEAD_TINT = new Color3(0.99, 0.93, 0.7)
const START_TINT = new Color3(0.44, 0.78, 0.5)
const GOAL_TINT = new Color3(0.86, 0.36, 0.36)

/** How much of a hex survives once the party has walked on past it. */
const REMEMBERED = 0.42

const canvas = ref<HTMLCanvasElement | null>(null)
const store = useHexMapStore()
useRouteReveal()

const layout = createLayout(props.hexSize)
const field = spiral({ q: 0, r: 0 }, props.radius)

// The hex set never changes, only what the terrain makes of it, so a new world
// rewrites the grid in place instead of tearing the scene down.
const generate = (): TerrainTile[] => {
  const terrain = createTerrain(layout, { ...store.terrain, octaves: props.octaves })
  const next = field.map(terrain)
  store.setTiles(new Map<HexKey, TerrainTile>(next.map((tile) => [hexKey(tile.hex), tile])))
  return next
}

const tiles = generate()

const { hexScene } = useHexScene(canvas, {
  layout,
  tiles,
  gap: props.gap,
  bevel: props.bevel,
  onHover: store.setHovered,
  onSelect: store.select,
})

// Later writes win, so endpoints stay visible on top of the route and the
// route stays visible under the pointer.
const overlay = computed(() => {
  const result = new Map<HexKey, Color3>()
  if (store.hovered) result.set(store.hovered, HOVER_TINT)

  const walked = store.visibleHexes
  for (const hex of walked) result.set(hexKey(hex), ROUTE_TINT)

  // The leading hex is brighter, so the party's position reads at a glance
  // while the route draws itself.
  const head = walked[walked.length - 1]
  if (head && !store.isAuto) result.set(hexKey(head), HEAD_TINT)

  if (store.start) result.set(store.start, START_TINT)
  if (store.goal) result.set(store.goal, GOAL_TINT)
  return result
})

// Everything the party has never seen is buried, and ground it has left behind
// keeps a dimmer copy of itself: the map remembers, the party does not watch.
const fog = computed(() => {
  const result = new Map<HexKey, number>()
  if (!store.fog) return result

  for (const key of store.tiles.keys()) {
    if (store.visible.has(key)) continue
    result.set(key, store.explored.has(key) ? REMEMBERED : 0)
  }
  return result
})

watch(overlay, (next) => hexScene.value?.grid.setOverlay(next))

watch(fog, (next) => hexScene.value?.grid.setFog(next))

// The disc the party can see, with the pockets the terrain hides carved out of
// it, so a ridge shows up as the shadow it casts rather than as missing fog.
const sightField = computed(() =>
  store.showSight
    ? { lit: [...store.visible].map(parseKey), shadow: [...store.blocked].map(parseKey) }
    : { lit: [], shadow: [] },
)

watch(sightField, ({ lit, shadow }) => hexScene.value?.vision.setField(lit, shadow))

watch(
  () => store.showSight,
  (shown) => hexScene.value?.vision.setShown(shown),
)

watch(
  () => store.pathHexes,
  (hexes) => hexScene.value?.arrows.setPath(hexes),
)

watch(
  () => store.partyHex,
  (key) => hexScene.value?.party.setHex(key ? parseKey(key) : null),
)

// Everything the store knows, pushed at the scene in one go. Needed both when
// the scene first appears, since state settled before mount reaches no watcher,
// and after a new world, since every layer is pinned to heights that just moved.
const pushEverything = (created: NonNullable<typeof hexScene.value>): void => {
  created.grid.setOverlay(overlay.value)
  created.grid.setFog(fog.value)
  created.arrows.setPath(store.pathHexes)
  created.party.setHex(store.partyHex ? parseKey(store.partyHex) : null)
  created.vision.setField(sightField.value.lit, sightField.value.shadow)
  created.vision.setShown(store.showSight)
}

watch(hexScene, (created) => {
  if (created) pushEverything(created)
})

watch(
  () => store.terrain,
  () => {
    const next: HexTile[] = generate()
    const created = hexScene.value
    if (!created) return
    created.setTiles(next)
    pushEverything(created)
  },
)
</script>

<template>
  <canvas ref="canvas" touch-action="none" />
</template>

<style scoped>
canvas {
  display: block;
  width: 100%;
  height: 100%;
  outline: none;
}
</style>
