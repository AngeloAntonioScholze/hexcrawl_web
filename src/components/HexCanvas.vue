<script setup lang="ts">
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { computed, defineAsyncComponent, ref, watch, watchEffect } from 'vue'
import { hexKey, parseKey, type HexKey } from '../hex/coords'
import { createLayout } from '../hex/layout'
import MiniMap from './MiniMap.vue'
import { gridCapacity, maxZoomFor, useHexWindow } from '../composables/useHexWindow'
import { useTurnPlayback } from '../composables/useTurnPlayback'
import { createFogStepper } from '../engine/fogStepper'
import type { HexGrid } from '../engine/hexGrid'
import { resourceMarks } from '../engine/resourceMarkers'
import { useHexScene } from '../engine/useHexScene'
import { useHexMapStore } from '../stores/hexMap'
import { createTerrainField } from '../terrain/field'

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
const SELECT_TINT = new Color3(0.98, 0.78, 0.25)
/** How much of an entity's colour its trail keeps. */
const TRAIL_TINT = 0.72
const HEAD_TINT = new Color3(0.99, 0.93, 0.7)
const START_TINT = new Color3(0.44, 0.78, 0.5)
const GOAL_TINT = new Color3(0.86, 0.36, 0.36)

// Dev-only; the static DEV check lets the build drop the chunk entirely.
const RenderStats = import.meta.env.DEV
  ? defineAsyncComponent(() => import('./RenderStats.vue'))
  : null

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

// Sized for any world rather than for today's, so switching size moves the zoom
// limit without ever reallocating.
const capacity = gridCapacity(layout)

const { hexScene } = useHexScene(canvas, {
  layout,
  field: store.field,
  capacity,
  maxZoom: maxZoom(),
  gap: props.gap,
  bevel: props.bevel,
  onHover: store.setHovered,
  onSelect: store.click,
})

/**
 * The keys the grid is holding right now; the fog is drawn over these. The grid
 * hands over its own live array, the same one every time, so what says the
 * window moved is the tick beside it rather than a new value.
 */
let windowKeys: readonly HexKey[] = []
const windowTick = ref(0)

useHexWindow(
  hexScene,
  layout,
  () => store.field,
  (keys) => {
    windowKeys = keys
    windowTick.value += 1
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

  // Last of all: the hex the DM picked must read as picked whatever runs over it.
  if (store.selectedHex) result.set(store.selectedHex, SELECT_TINT)
  return result
})

const fogStepper = createFogStepper()

const paintFog = (grid: HexGrid): void =>
  fogStepper.paint(grid, {
    fog: store.fog,
    visible: store.visibleToPlayers,
    windowKeys,
    windowTick: windowTick.value,
    explored: store.knownState,
  })

watch(overlay, (next) => hexScene.value?.grid.setOverlay(next))

watchEffect(() => {
  const grid = hexScene.value?.grid
  if (grid) paintFog(grid)
})

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

// The entity being given orders is the one whose stops are worth marking.
watch(
  () => store.stops,
  ({ hexes, color }) => hexScene.value?.stops.setStops(hexes, color),
)

const marks = computed(() =>
  resourceMarks(store.resources, {
    dmView: store.dmView,
    fog: store.fog,
    explored: store.known,
  }),
)

watch(marks, (next) => hexScene.value?.resources.setMarks(next))

// The sky over the map follows the same clock the dial draws: the sun swings
// across the four turns of the day and the ground goes cold after dark.
watch(
  () => store.clock,
  ({ phase, index }) => hexScene.value?.setDaylight(phase, index),
)

const tokens = computed(() =>
  store.tokens.map((token) => ({ ...token, hex: token.hex ? parseKey(token.hex) : null })),
)

// Everything the store knows, pushed at the scene in one go. Needed both when
// the scene first appears, since state settled before mount reaches no watcher,
// and after a new world, since every layer is pinned to heights that just moved.
const pushEverything = (created: NonNullable<typeof hexScene.value>): void => {
  // First, and before the field watcher rebuilds the window: a view left wider
  // than the new world allows asks the grid for more than it holds.
  created.setMaxZoom(maxZoom())
  created.grid.setOverlay(overlay.value)
  // Neither the window nor the crawl is anything this fog has seen before, so
  // it goes down whole rather than as a step off the last painting.
  fogStepper.reset()
  paintFog(created.grid)
  created.arrows.setPaths(store.paths)
  created.tokens.setEntries(tokens.value)
  created.stops.setStops(store.stops.hexes, store.stops.color)
  created.resources.setMarks(marks.value)
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
  <component :is="RenderStats" v-if="RenderStats" :hex-scene="hexScene" />
</template>

<style scoped>
canvas {
  display: block;
  width: 100%;
  height: 100%;
  outline: none;
}
</style>
