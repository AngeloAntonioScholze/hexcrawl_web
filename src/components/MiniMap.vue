<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { worldBounds } from '../engine/hexWindow'
import type { HexScene } from '../engine/scene'
import { parseKey } from '../hex/coords'
import { hexToWorld, worldToHex, type Layout } from '../hex/layout'
import { useHexMapStore } from '../stores/hexMap'

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

const bounds = computed(() => worldBounds(props.layout, store.worldRadius))

/** World units to minimap pixels: the whole world squeezed into the square. */
const scaleOf = (): number => {
  const box = bounds.value
  return SIZE.value / Math.max(box.maxX - box.minX, box.maxZ - box.minZ)
}

/**
 * The camera sits south of its target and looks north, so the far edge of the
 * world is the top of the screen: z grows away from the viewer while canvas y
 * grows toward them, and the drawing is flipped to match what the map shows.
 */
const toPixels = (x: number, z: number): { x: number; y: number } => {
  const box = bounds.value
  const scale = scaleOf()
  return { x: (x - box.minX) * scale, y: (box.maxZ - z) * scale }
}

/**
 * The terrain, sampled every few hexes into an off-screen canvas. Sampling is
 * the whole cost of the minimap and the world only changes on a new seed or a
 * new size, so it is done once and then only copied.
 */
let terrain: HTMLCanvasElement | null = null

const sampleWorld = (): void => {
  const scale = scaleOf()
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
    for (let q = -store.worldRadius; q <= store.worldRadius; q += step) {
      const tile = store.field.at({ q, r })
      if (!tile) continue

      const world = hexToWorld(props.layout, { q, r })
      const point = toPixels(world.x, world.z)
      const { r: red, g, b } = tile.color
      ink.fillStyle = `rgb(${red * 255} ${g * 255} ${b * 255})`
      // Drawn up from the sample rather than down from it, so the flip does not
      // leave a gap along the top edge of each patch.
      ink.fillRect(point.x, point.y - step * 2, step * 2, step * 2)
    }
  }

  terrain = off
}

const draw = (): void => {
  const ink = canvas.value?.getContext('2d')
  if (!ink || !terrain) return

  const side = SIZE.value
  ink.clearRect(0, 0, side, side)
  ink.drawImage(terrain, 0, 0)

  // What the main view is looking at, so the minimap says where you are as well
  // as what is out there.
  const scene = props.hexScene
  if (scene) {
    const { x, z } = scene.iso.camera.target
    const scale = scaleOf()
    const aspect = scene.engine.getAspectRatio(scene.iso.camera)
    const width = Math.max(DOT, scene.iso.zoom * aspect * 2 * scale)
    const height = Math.max(DOT, scene.iso.zoom * 2 * scale)
    const middle = toPixels(x, z)

    ink.strokeStyle = 'rgba(240, 244, 255, 0.85)'
    ink.lineWidth = 1
    ink.strokeRect(middle.x - width / 2, middle.y - height / 2, width, height)
  }

  for (const token of store.tokens) {
    if (!token.hex) continue
    const world = hexToWorld(props.layout, parseKey(token.hex))
    const point = toPixels(world.x, world.z)

    ink.fillStyle = token.color
    ink.beginPath()
    ink.arc(point.x, point.y, DOT, 0, Math.PI * 2)
    ink.fill()
    ink.strokeStyle = 'rgba(8, 10, 16, 0.9)'
    ink.lineWidth = 1
    ink.stroke()
  }
}

let frame = 0

const loop = (): void => {
  draw()
  frame = requestAnimationFrame(loop)
}

watch(
  [canvas, () => store.field, () => store.worldRadius],
  () => {
    if (!canvas.value) return
    sampleWorld()
    draw()
  },
  { immediate: true, flush: 'post' },
)

watch(
  canvas,
  (element) => {
    cancelAnimationFrame(frame)
    if (element) frame = requestAnimationFrame(loop)
  },
  { immediate: true, flush: 'post' },
)

onBeforeUnmount(() => cancelAnimationFrame(frame))

/** Clicking the world moves the view there rather than moving anybody. */
const onClick = (event: MouseEvent): void => {
  const element = canvas.value
  const scene = props.hexScene
  if (!element || !scene) return

  const rect = element.getBoundingClientRect()
  const box = bounds.value
  const scale = scaleOf()
  const x = box.minX + (((event.clientX - rect.left) / rect.width) * SIZE.value) / scale
  const z = box.maxZ - (((event.clientY - rect.top) / rect.height) * SIZE.value) / scale

  const hex = worldToHex(props.layout, { x, z })
  const world = hexToWorld(props.layout, hex)
  scene.iso.focusOn(world.x, world.z)
}
</script>

<template>
  <canvas
    ref="canvas"
    class="minimap"
    :width="SIZE"
    :height="SIZE"
    :style="{ width: `${SIZE}px`, height: `${SIZE}px` }"
    title="click to look somewhere else"
    @click="onClick"
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
  cursor: crosshair;
  pointer-events: auto;
}

/* Nothing is worth covering a phone's map with; the minimap sits this one out. */
@media (max-width: 720px) {
  .minimap {
    display: none;
  }
}
</style>
