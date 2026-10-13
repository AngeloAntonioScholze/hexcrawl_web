<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { worldBounds } from '../engine/hexWindow'
import {
  boxContains,
  minimapScale,
  minimapToWorld,
  viewBox,
  worldToMinimap,
  type Pixel,
  type PixelBox,
} from '../engine/minimap'
import { RESOURCE_MARKER_COLOR, resourceMarks } from '../engine/resourceMarkers'
import { RIVER_COLOR, riverSpans, sharedSide } from '../engine/riverSegments'
import { ROAD_COLOR, roadSpans } from '../engine/roadSegments'
import type { HexScene } from '../engine/scene'
import { parseKey, type Axial, type HexKey } from '../hex/coords'
import { hexToWorld, worldToHex, type Layout } from '../hex/layout'
import { useHexMapStore } from '../stores/hexMap'
import { repainted } from '../terrain/field'

const props = defineProps<{
  /** The live scene; a template binding hands this over already unwrapped. */
  hexScene: HexScene | null
  layout: Layout
  /** Edge of the drawing, in pixels. */
  size?: number
}>()

const store = useHexMapStore()
const canvas = ref<HTMLCanvasElement | null>(null)

const SIZE = computed(() => props.size ?? 176)

/** Pixels of dot for an entity, and the thinnest the view box may draw. */
const DOT = 3

/** Minimap pixels a press must travel before it is a drag rather than a click. */
const DRAG_START = 3

const frame = computed(() => ({
  bounds: worldBounds(props.layout, store.worldRadius),
  size: SIZE.value,
}))

/** Pixels on a side of a resource's square: smaller than a token, which it sits under. */
const RESOURCE_DOT = 2

// Worked out when the resources or the view change rather than on every frame
// the minimap draws: the biggest world holds a couple of thousand.
const resourceDots = computed<readonly Pixel[]>(() =>
  resourceMarks(store.resources, {
    dmView: store.dmView,
    fog: store.fog,
    explored: store.known,
  }).map((mark) => {
    const world = hexToWorld(props.layout, parseKey(mark.hex))
    return worldToMinimap(frame.value, world.x, world.z)
  }),
)

const hexPixel = (hex: HexKey): Pixel => {
  const world = hexToWorld(props.layout, parseKey(hex))
  return worldToMinimap(frame.value, world.x, world.z)
}

const roadLines = computed<readonly [Pixel, Pixel][]>(() =>
  roadSpans(store.roads, {
    dmView: store.dmView,
    fog: store.fog,
    explored: store.explored,
  }).map((span) => [hexPixel(span.a), hexPixel(span.b)]),
)

const riverLines = computed<readonly [Pixel, Pixel][]>(() =>
  riverSpans(store.rivers, {
    dmView: store.dmView,
    fog: store.fog,
    explored: store.explored,
  }).map((span) => {
    const [from, to] = sharedSide(props.layout, parseKey(span.a), parseKey(span.b))
    return [worldToMinimap(frame.value, from.x, from.z), worldToMinimap(frame.value, to.x, to.z)]
  }),
)

/**
 * The terrain, sampled every few hexes into an off-screen canvas. Sampling is
 * the whole cost of the minimap and the world only changes on a new seed or a
 * new size, so it is done once and then only copied.
 */
let terrain: HTMLCanvasElement | null = null
/** Hexes between samples in the drawing as it stands. */
let sampleStep = 1

const dab = (ink: CanvasRenderingContext2D, hex: Axial, step: number): void => {
  const tile = store.field.at(hex)
  if (!tile) return

  const world = hexToWorld(props.layout, hex)
  const point = worldToMinimap(frame.value, world.x, world.z)
  const { r: red, g, b } = tile.color
  ink.fillStyle = `rgb(${red * 255} ${g * 255} ${b * 255})`
  // Drawn up from the sample rather than down from it, so the flip does not
  // leave a gap along the top edge of each patch.
  ink.fillRect(point.x, point.y - step * 2, step * 2, step * 2)
}

const sampleWorld = (): void => {
  const scale = minimapScale(frame.value)
  const side = Math.ceil(SIZE.value)

  const off = document.createElement('canvas')
  off.width = side
  off.height = side
  const ink = off.getContext('2d')
  if (!ink) return

  // One pixel per sample rather than one per hex: a world of a quarter of a
  // million hexes still draws in a couple of hundred thousand samples at most,
  // and most of those land on the same pixel anyway.
  const step = Math.max(1, Math.round(1 / (scale * props.layout.size * 1.5)))

  for (let r = -store.worldRadius; r <= store.worldRadius; r += step) {
    for (let q = -store.worldRadius; q <= store.worldRadius; q += step) dab(ink, { q, r }, step)
  }

  terrain = off
  sampleStep = step
}

/** Paint touches a few hexes, so only those are drawn again, not the world. */
const repaint = (hexes: readonly HexKey[]): void => {
  const ink = terrain?.getContext('2d')
  if (!ink) return
  for (const hex of hexes) dab(ink, parseKey(hex), sampleStep)
}

/** What the main view is looking at, in minimap pixels. */
const currentBox = (): PixelBox | null => {
  const scene = props.hexScene
  if (!scene) return null
  const aspect = scene.engine.getAspectRatio(scene.iso.camera)
  return viewBox(frame.value, scene.iso.camera.target, scene.iso.zoom, aspect, DOT)
}

const draw = (): void => {
  const ink = canvas.value?.getContext('2d')
  if (!ink || !terrain) return

  const side = SIZE.value
  ink.clearRect(0, 0, side, side)
  ink.drawImage(terrain, 0, 0)

  // The minimap says where you are as well as what is out there.
  const box = currentBox()
  if (box) {
    ink.strokeStyle = 'rgba(240, 244, 255, 0.85)'
    ink.lineWidth = 1
    ink.strokeRect(box.x - box.width / 2, box.y - box.height / 2, box.width, box.height)
  }

  if (riverLines.value.length > 0) {
    ink.strokeStyle = RIVER_COLOR
    ink.lineWidth = 1.5
    ink.beginPath()
    for (const [from, to] of riverLines.value) {
      ink.moveTo(from.x, from.y)
      ink.lineTo(to.x, to.y)
    }
    ink.stroke()
  }

  if (roadLines.value.length > 0) {
    ink.strokeStyle = ROAD_COLOR
    ink.lineWidth = 1
    ink.beginPath()
    for (const [from, to] of roadLines.value) {
      ink.moveTo(from.x, from.y)
      ink.lineTo(to.x, to.y)
    }
    ink.stroke()
  }

  ink.fillStyle = RESOURCE_MARKER_COLOR
  for (const dot of resourceDots.value) {
    ink.fillRect(dot.x - RESOURCE_DOT / 2, dot.y - RESOURCE_DOT / 2, RESOURCE_DOT, RESOURCE_DOT)
  }

  for (const token of store.tokens) {
    if (!token.hex || token.inside) continue
    const world = hexToWorld(props.layout, parseKey(token.hex))
    const point = worldToMinimap(frame.value, world.x, world.z)

    ink.fillStyle = token.color
    ink.beginPath()
    ink.arc(point.x, point.y, DOT, 0, Math.PI * 2)
    ink.fill()
    ink.strokeStyle = 'rgba(8, 10, 16, 0.9)'
    ink.lineWidth = 1
    ink.stroke()
  }
}

let frameRequest = 0

const loop = (): void => {
  draw()
  frameRequest = requestAnimationFrame(loop)
}

watch(
  [canvas, () => store.ground, () => store.worldRadius],
  () => {
    if (!canvas.value) return
    sampleWorld()
    draw()
  },
  { immediate: true, flush: 'post' },
)

watch(
  () => store.terrainOverrides,
  (next, previous) => repaint(repainted(previous, next)),
  { flush: 'post' },
)

watch(
  canvas,
  (element) => {
    cancelAnimationFrame(frameRequest)
    if (element) frameRequest = requestAnimationFrame(loop)
  },
  { immediate: true, flush: 'post' },
)

onBeforeUnmount(() => cancelAnimationFrame(frameRequest))

const cursor = ref<'crosshair' | 'grab' | 'grabbing'>('crosshair')

interface Grab {
  pointerId: number
  start: Pixel
  /** Where the box was held, from its centre; null when pressed outside it. */
  offset: Pixel | null
  dragging: boolean
}

let grab: Grab | null = null

const toPixel = (event: PointerEvent): Pixel | null => {
  const element = canvas.value
  if (!element) return null
  const rect = element.getBoundingClientRect()
  return {
    x: ((event.clientX - rect.left) / rect.width) * SIZE.value,
    y: ((event.clientY - rect.top) / rect.height) * SIZE.value,
  }
}

const hoverCursor = (pixel: Pixel): void => {
  const box = currentBox()
  cursor.value = box && boxContains(box, pixel) ? 'grab' : 'crosshair'
}

const onPointerDown = (event: PointerEvent): void => {
  const pixel = toPixel(event)
  const box = currentBox()
  if (event.button !== 0 || !pixel || !box) return

  // Captured so a drag that runs off the minimap keeps steering the view.
  canvas.value?.setPointerCapture(event.pointerId)
  const inside = boxContains(box, pixel)
  grab = {
    pointerId: event.pointerId,
    start: pixel,
    offset: inside ? { x: pixel.x - box.x, y: pixel.y - box.y } : null,
    dragging: false,
  }
  if (inside) cursor.value = 'grabbing'
}

const onPointerMove = (event: PointerEvent): void => {
  const pixel = toPixel(event)
  const scene = props.hexScene
  if (!pixel || !scene) return

  if (!grab || grab.pointerId !== event.pointerId) {
    hoverCursor(pixel)
    return
  }

  if (!grab.dragging) {
    if (Math.hypot(pixel.x - grab.start.x, pixel.y - grab.start.y) < DRAG_START) return
    grab.dragging = true
    cursor.value = 'grabbing'
  }

  // Pressed outside the box, the box jumps under the pointer and is dragged from its centre.
  const offset = grab.offset ?? { x: 0, y: 0 }
  const world = minimapToWorld(frame.value, { x: pixel.x - offset.x, y: pixel.y - offset.y })
  scene.iso.moveTo(world.x, world.z)
}

/** A click moves the view to the hex under it rather than moving anybody. */
const focusAt = (pixel: Pixel): void => {
  const scene = props.hexScene
  if (!scene) return
  const hex = worldToHex(props.layout, minimapToWorld(frame.value, pixel))
  const world = hexToWorld(props.layout, hex)
  scene.iso.focusOn(world.x, world.z)
}

const onPointerUp = (event: PointerEvent): void => {
  if (!grab || grab.pointerId !== event.pointerId) return
  const clicked = !grab.dragging
  grab = null

  const pixel = toPixel(event)
  if (!pixel) return
  if (clicked) focusAt(pixel)
  hoverCursor(pixel)
}

const onPointerCancel = (): void => {
  grab = null
  cursor.value = 'crosshair'
}
</script>

<template>
  <canvas
    ref="canvas"
    class="minimap"
    :class="{ beside: store.dmView && store.selectedHex }"
    :width="SIZE"
    :height="SIZE"
    :style="{ width: `${SIZE}px`, height: `${SIZE}px`, cursor }"
    title="click to look somewhere else, drag the box to pan"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerCancel"
  />
</template>

<style scoped>
.minimap {
  position: absolute;
  right: 1rem;
  bottom: 1rem;
  border: 1px solid var(--line);
  border-radius: 0.4rem;
  background: color-mix(in srgb, var(--surface-raised) 88%, transparent);
  pointer-events: auto;
  touch-action: none;
}

.minimap.beside {
  right: calc(1rem + var(--details-width) + 0.75rem);
}

/* Nothing is worth covering a phone's map with; the minimap sits this one out. */
@media (max-width: 720px) {
  .minimap {
    display: none;
  }
}
</style>
