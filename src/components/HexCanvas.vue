<script setup lang="ts">
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { computed, ref, watch } from 'vue'
import { hexKey, spiral, type HexKey } from '../hex/coords'
import { createLayout } from '../hex/layout'
import { useHexScene } from '../engine/useHexScene'
import { useHexMapStore } from '../stores/hexMap'
import { createTerrain, type TerrainTile } from '../terrain/terrain'

const props = withDefaults(
  defineProps<{
    radius?: number
    hexSize?: number
    gap?: number
    bevel?: number
    seed?: number
    scale?: number
    octaves?: number
  }>(),
  {
    radius: 40,
    hexSize: 2,
    gap: 0.06,
    bevel: 0.14,
    seed: 1337,
    scale: 55,
    octaves: 4,
  },
)

const HOVER_TINT = new Color3(0.55, 0.62, 0.72)
const ROUTE_TINT = new Color3(0.86, 0.7, 0.36)
const START_TINT = new Color3(0.44, 0.78, 0.5)
const GOAL_TINT = new Color3(0.86, 0.36, 0.36)

const canvas = ref<HTMLCanvasElement | null>(null)
const store = useHexMapStore()

const layout = createLayout(props.hexSize)
const terrain = createTerrain(layout, {
  seed: props.seed,
  scale: props.scale,
  octaves: props.octaves,
})
const tiles = spiral({ q: 0, r: 0 }, props.radius).map(terrain)
store.setTiles(new Map<HexKey, TerrainTile>(tiles.map((tile) => [hexKey(tile.hex), tile])))

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
  for (const hex of store.route?.hexes ?? []) result.set(hexKey(hex), ROUTE_TINT)
  if (store.start) result.set(store.start, START_TINT)
  if (store.goal) result.set(store.goal, GOAL_TINT)
  return result
})

watch(overlay, (next) => hexScene.value?.grid.setOverlay(next))
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
