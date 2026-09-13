<script setup lang="ts">
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { computed, ref, shallowRef, watch } from 'vue'
import { hexKey, parseKey, type HexKey } from '../hex/coords'
import { createLayout } from '../hex/layout'
import MiniMap from './MiniMap.vue'
import { maxZoomFor, useHexWindow, windowCost } from '../composables/useHexWindow'
import { useTurnPlayback } from '../composables/useTurnPlayback'
import { useHexScene } from '../engine/useHexScene'
import { useHexMapStore, WORLD_SIZES } from '../stores/hexMap'
import { createTerrainField } from '../terrain/field'
import type { HexTile } from '../engine/hexGrid'

const props = withDefaults(
  defineProps<{
    hexSize?: number
    gap?: number
    bevel?: number
    octaves?: number
  }>(),
  {
    hexSize: 2,
    gap: 0.06,
    bevel: 0.14,
    octaves: 4,
  },
)

const HOVER_TINT = new Color3(0.55, 0.62, 0.72)
/** How much of an entity's colour its trail keeps. */
const TRAIL_TINT = 0.72
const HEAD_TINT = new Color3(0.99, 0.93, 0.7)
const START_TINT = new Color3(0.44, 0.78, 0.5)
const GOAL_TINT = new Color3(0.86, 0.36, 0.36)

/** How much of a hex survives once the party has walked on past it. */
const REMEMBERED = 0.42

const canvas = ref<HTMLCanvasElement | null>(null)
const store = useHexMapStore()

const layout = createLayout(props.hexSize)

// The world is a function of the controls, so laying out a new one is making a
// new field rather than generating thousands of tiles: the ground is worked out
// as the window reaches it.
const makeWorld = (): void => {
  store.setField(
    createTerrainField(layout, {
      ...store.terrain,
      octaves: props.octaves,
      radius: store.worldRadius,
    }),
  )
}

makeWorld()

/** How far back this world may be looked at; a bigger one is allowed more. */
const maxZoom = (): number => maxZoomFor(layout, store.worldRadius)

// Sized for whichever of the offered worlds asks the most of the grid, so
// switching size moves the zoom limit without ever reallocating.
const capacity = Math.max(
  ...Object.values(WORLD_SIZES).map((radius) =>
    windowCost(layout, maxZoomFor(layout, radius), radius),
  ),
)

const { hexScene } = useHexScene(canvas, {
  layout,
  field: store.field,
  capacity,
  maxZoom: maxZoom(),
  gap: props.gap,
  bevel: props.bevel,
  onHover: store.setHovered,
  onSelect: store.select,
})

/** The hexes the grid is holding right now; the fog is drawn over these. */
const windowed = shallowRef<readonly HexTile[]>([])

useHexWindow(
  hexScene,
  layout,
  () => store.field,
  (tiles) => {
    windowed.value = tiles
  },
)

useTurnPlayback(hexScene, layout)

// Later writes win, so endpoints stay visible on top of the route and the
// route stays visible under the pointer.
const overlay = computed(() => {
  const result = new Map<HexKey, Color3>()
  if (store.hovered) result.set(store.hovered, HOVER_TINT)

  // Tinted in the entity's own colour, dimmed so the pawn standing on it still
  // reads as the brighter thing.
  for (const path of store.paths) {
    const tint = Color3.FromHexString(path.color).scale(TRAIL_TINT)
    for (const hex of path.hexes) result.set(hexKey(hex), tint)
  }

  // The hex the entity will stand on at the end of the next turn is brighter,
  // so what one press of the dial buys reads at a glance.
  const head = store.plannedHexes[0]
  if (head) result.set(hexKey(head), HEAD_TINT)

  if (store.start) result.set(store.start, START_TINT)
  if (store.goal) result.set(store.goal, GOAL_TINT)
  return result
})

// Everything the party has never seen is buried, and ground it has left behind
// keeps a dimmer copy of itself: the map remembers, the party does not watch.
const fog = computed(() => {
  const result = new Map<HexKey, number>()
  if (!store.fog) return result

  // Only the window is drawn, so only the window needs fogging: a fog map over
  // a world of a quarter of a million hexes would be rebuilt on every step.
  for (const tile of windowed.value) {
    const key = hexKey(tile.hex)
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
  () => store.paths,
  (paths) => hexScene.value?.arrows.setPaths(paths),
)

// The entity being given orders is the one whose next hex is worth marking.

// The sky over the map follows the same clock the dial draws: the sun swings
// across the four turns of the day and the ground goes cold after dark.
watch(
  () => store.clock,
  ({ phase, index }) => hexScene.value?.setDaylight(phase, index),
)

const tokens = computed(() =>
  store.tokens.map(({ id, hex, color }) => ({ id, hex: hex ? parseKey(hex) : null, color })),
)

// Everything the store knows, pushed at the scene in one go. Needed both when
// the scene first appears, since state settled before mount reaches no watcher,
// and after a new world, since every layer is pinned to heights that just moved.
const pushEverything = (created: NonNullable<typeof hexScene.value>): void => {
  created.grid.setOverlay(overlay.value)
  created.grid.setFog(fog.value)
  created.arrows.setPaths(store.paths)
  created.tokens.setEntries(tokens.value)
  created.vision.setField(sightField.value.lit, sightField.value.shadow)
  created.vision.setShown(store.showSight)
  created.setDaylight(store.clock.phase, store.clock.index)
}

watch(hexScene, (created) => {
  if (created) pushEverything(created)
})

// A new seed or a new size is a different world: the field is replaced, the
// scene is told its rim has moved, and the window rebuilds onto the new ground.
watch([() => store.terrain, () => store.worldRadius], () => {
  makeWorld()
  const created = hexScene.value
  if (!created) return
  created.setField(store.field)
  pushEverything(created)
})
</script>

<template>
  <canvas ref="canvas" touch-action="none" />
  <MiniMap :hex-scene="hexScene" :layout="layout" />
</template>

<style scoped>
canvas {
  display: block;
  width: 100%;
  height: 100%;
  outline: none;
}
</style>
