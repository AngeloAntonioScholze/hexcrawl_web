<script setup lang="ts">
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { computed, defineAsyncComponent, ref, watch, watchEffect } from 'vue'
import { hexKey, parseKey, type HexKey } from '../hex/coords'
import { createLayout } from '../hex/layout'
import MiniMap from './MiniMap.vue'
import { gridCapacity, maxZoomFor, useHexWindow } from '../composables/useHexWindow'
import { useZoomLimit } from '../composables/useZoomLimit'
import { useTurnPlayback } from '../composables/useTurnPlayback'
import { createFogStepper } from '../engine/fogStepper'
import type { HexGrid } from '../engine/hexGrid'
import { visiblePois } from '../engine/poiMarkers'
import { resourceMarks } from '../engine/resourceMarkers'
import { roadSpans } from '../engine/roadSegments'
import type { SkyGlow } from '../engine/sky'
import { useHexScene } from '../engine/useHexScene'
import { useHexMapStore } from '../stores/hexMap'
import { createTerrainField, repainted } from '../terrain/field'
import { TERRAIN_COLORS } from '../terrain/terrain'
import { timeOfDay } from '../time/clock'

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
/** How far a paint brush's footprint leans toward the terrain it lays down. */
const PAINT_LEAN = 0.4
const REVEAL_TINT = new Color3(0.82, 0.86, 0.92)
const HIDE_TINT = new Color3(0.26, 0.29, 0.36)
const SELECT_TINT = new Color3(0.98, 0.78, 0.25)
/** How much of an entity's colour its trail keeps. */
const TRAIL_TINT = 0.72
const HEAD_TINT = new Color3(0.99, 0.93, 0.7)
const START_TINT = new Color3(0.44, 0.78, 0.5)
const GOAL_TINT = new Color3(0.86, 0.36, 0.36)
const ROAD_TAIL_TINT = new Color3(0.78, 0.55, 0.3)

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

const zoomLimit = useZoomLimit()

// How far back this world may be looked at, a bigger one being allowed more;
// the panel's slider holds the camera anywhere short of it.
watchEffect(() => {
  zoomLimit.farthest.value = maxZoomFor(layout, store.worldRadius)
})
const maxZoom = (): number => zoomLimit.limit.value

// Sized for any world rather than for today's, so switching size moves the zoom
// limit without ever reallocating.
const capacity = gridCapacity(layout)

const glow = ref<SkyGlow | null>(null)

// Laid on the screen edge nearest the sun or moon, brightest off screen so
// only its spill reaches over the map, and blended so it lights rather than paints.
const glowStyle = computed(() => {
  if (!glow.value) return { display: 'none' }
  const { x, y, color, strength } = glow.value
  const [r, g, b] = color.map((channel) => Math.round(channel * 255))
  return {
    background: `radial-gradient(circle at ${x * 100}% ${y * 100}%, rgba(${r}, ${g}, ${b}, ${0.55 * strength}) 0%, rgba(${r}, ${g}, ${b}, ${0.18 * strength}) 35%, transparent 70%)`,
  }
})

const { hexScene } = useHexScene(canvas, {
  layout,
  field: store.field,
  capacity,
  maxZoom: maxZoom(),
  gap: props.gap,
  bevel: props.bevel,
  onHover: store.setHovered,
  onSelect: store.click,
  brushing: () => store.brushing,
  onStrokeStart: store.startStroke,
  onStrokeMove: store.continueStroke,
  onStrokeEnd: store.endStroke,
  onGlow: (next) => (glow.value = next),
})

/**
 * The keys the grid is holding right now; the fog is drawn over these. The grid
 * hands over its own live array, the same one every time, so what says the
 * window moved is the tick beside it rather than a new value.
 */
let windowKeys: readonly HexKey[] = []
const windowTick = ref(0)

const { repaint } = useHexWindow(
  hexScene,
  layout,
  () => store.field,
  (keys) => {
    windowKeys = keys
    windowTick.value += 1
  },
  () => store.ground,
)

useTurnPlayback(hexScene, layout)

const hoverTint = computed(() => {
  if (!store.dmView) return HOVER_TINT
  if (store.dmTool === 'paint')
    return Color3.Lerp(HOVER_TINT, TERRAIN_COLORS[store.paintTerrain], PAINT_LEAN)
  if (store.dmTool === 'fog') return store.fogMode === 'reveal' ? REVEAL_TINT : HIDE_TINT
  return HOVER_TINT
})

// Later writes win, so endpoints stay visible on top of the route and the
// route stays visible under the pointer.
const overlay = computed(() => {
  const result = new Map<HexKey, Color3>()
  const tint = hoverTint.value
  for (const key of store.hoverFootprint) result.set(key, tint)

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

  if (store.roadTail) result.set(store.roadTail, ROAD_TAIL_TINT)

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

const pois = computed(() =>
  visiblePois(store.locations, store.events, {
    dmView: store.dmView,
    fog: store.fog,
    explored: store.known,
  }),
)

watch(pois, (next) => hexScene.value?.pois.setPois(next))

const spans = computed(() =>
  roadSpans(store.roads, { dmView: store.dmView, fog: store.fog, explored: store.explored }),
)

watch(spans, (next) => {
  hexScene.value?.roads.setSpans(next)
  hexScene.value?.bridges.setRoads(next)
})

const riverLines = computed(() =>
  roadSpans(store.rivers, { dmView: store.dmView, fog: store.fog, explored: store.explored }),
)

watch(riverLines, (next) => {
  hexScene.value?.rivers.setSpans(next)
  hexScene.value?.bridges.setRivers(next)
})

// The sky over the map follows the same clock the dial draws: each turn of the
// day has a light of its own.
watch(
  () => store.clock,
  (clock) => hexScene.value?.setDaylight(timeOfDay(clock)),
)

const tokens = computed(() =>
  store.tokens.map((token) => ({ ...token, hex: token.hex ? parseKey(token.hex) : null })),
)

// Everything standing on the ground, set down again on the heights as they are now.
const pushHeights = (created: NonNullable<typeof hexScene.value>): void => {
  created.arrows.setPaths(store.paths)
  created.tokens.setEntries(tokens.value)
  created.stops.setStops(store.stops.hexes, store.stops.color)
  created.resources.setMarks(marks.value)
  created.pois.setPois(pois.value)
  created.roads.setSpans(spans.value)
  created.rivers.setSpans(riverLines.value)
  created.bridges.setRoads(spans.value)
  created.bridges.setRivers(riverLines.value)
  created.vision.setField(sightField.value.lit, sightField.value.shadow)
}

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
  pushHeights(created)
  created.vision.setShown(store.showSight)
  created.setDaylight(timeOfDay(store.clock))
}

watch(hexScene, (created) => {
  if (created) pushEverything(created)
})

watch(zoomLimit.limit, (limit) => hexScene.value?.setMaxZoom(limit))

// A new seed or a new size is a different world: the field is replaced, the
// scene is told its rim has moved, and the window rebuilds onto the new ground.
watch([() => store.terrain, () => store.worldRadius], () => {
  makeWorld()
  const created = hexScene.value
  if (!created) return
  created.setField(store.field)
  pushEverything(created)
})

// Paint is the same world with a few hexes changed: only those are built
// again, and whatever stands on the ground is set back down on it.
watch(
  () => store.terrainOverrides,
  (next, previous) => {
    const created = hexScene.value
    if (!created) return
    created.setField(store.field)
    repaint(repainted(previous, next).map(parseKey))
    pushHeights(created)
  },
)
</script>

<template>
  <canvas ref="canvas" touch-action="none" />
  <div class="sky-glow" :style="glowStyle" aria-hidden="true" />
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

.sky-glow {
  position: absolute;
  inset: 0;
  pointer-events: none;
  mix-blend-mode: screen;
}
</style>
