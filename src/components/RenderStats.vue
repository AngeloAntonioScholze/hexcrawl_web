<script setup lang="ts">
import { SceneInstrumentation } from '@babylonjs/core/Instrumentation/sceneInstrumentation'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { HexScene } from '../engine/scene'

const props = defineProps<{
  hexScene: HexScene | null
}>()

// Matches the instrumentation's one-second averages, so each snapshot is one window.
const SNAPSHOT_MS = 1000
/** Ten minutes of snapshots; older ones fall off the front. */
const HISTORY = 600
const TOGGLE_KEY = '}'

interface Stats {
  fps: number
  frameMs: number
  renderMs: number
  drawCalls: number
  instances: number
  triangles: number
  zoom: number
}

interface Snapshot extends Stats {
  /** Seconds since the readout was opened. */
  at: number
  /** What taking and logging the previous snapshot cost: the probe's own weight. */
  costMs: number
}

const SUMMARY_FIELDS = ['fps', 'frameMs', 'renderMs', 'drawCalls', 'instances', 'costMs'] as const

const shown = ref(false)
const stats = ref<Stats | null>(null)

// Kept on window so a session can be pulled out of devtools with copy(renderSnapshots).
const snapshots: Snapshot[] = []
Object.assign(window, { renderSnapshots: snapshots })

// Instrumentation hooks every frame, so it only exists while the readout is up.
let instrumentation: SceneInstrumentation | null = null
let poll = 0
let openedAt = 0
let lastCost = 0

const round = (value: number): number => Math.round(value * 100) / 100

const summarize = (): void => {
  if (snapshots.length === 0) return

  const rows = Object.fromEntries(
    SUMMARY_FIELDS.map((field) => {
      const values = snapshots.map((snapshot) => snapshot[field]).sort((a, b) => a - b)
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length
      return [
        field,
        {
          min: values[0],
          avg: round(mean),
          p95: values[Math.floor((values.length - 1) * 0.95)],
          max: values[values.length - 1],
        },
      ]
    }),
  )

  console.log(`[render] summary of ${snapshots.length} snapshots`)
  console.table(rows)
}

const stop = (): void => {
  clearInterval(poll)
  if (instrumentation) summarize()
  instrumentation?.dispose()
  instrumentation = null
  stats.value = null
}

const sample = (scene: HexScene, probe: SceneInstrumentation): void => {
  const started = performance.now()

  const next: Stats = {
    fps: round(scene.engine.getFps()),
    frameMs: round(probe.frameTimeCounter.lastSecAverage),
    renderMs: round(probe.renderTimeCounter.lastSecAverage),
    drawCalls: probe.drawCallsCounter.current,
    instances: scene.grid.count,
    triangles: (scene.grid.mesh.getTotalIndices() / 3) * scene.grid.count,
    zoom: round(scene.iso.zoom),
  }
  stats.value = next

  const snapshot: Snapshot = {
    at: Math.round((started - openedAt) / 1000),
    ...next,
    costMs: round(lastCost),
  }
  snapshots.push(snapshot)
  if (snapshots.length > HISTORY) snapshots.shift()

  // A string rather than the object: devtools holds logged objects live, which
  // over a long session is a leak the readout would be measuring itself with.
  console.log(
    `[render] ${snapshot.at}s fps ${snapshot.fps} frame ${snapshot.frameMs}ms ` +
      `render ${snapshot.renderMs}ms draws ${snapshot.drawCalls} ` +
      `hexes ${snapshot.instances} zoom ${snapshot.zoom} probe ${snapshot.costMs}ms`,
  )

  lastCost = performance.now() - started
}

watch(
  [shown, () => props.hexScene],
  ([visible, scene]) => {
    stop()
    if (!visible || !scene) return

    const probe = new SceneInstrumentation(scene.scene)
    probe.captureFrameTime = true
    probe.captureRenderTime = true
    instrumentation = probe
    snapshots.length = 0
    openedAt = performance.now()
    lastCost = 0
    poll = window.setInterval(() => sample(scene, probe), SNAPSHOT_MS)
  },
  { immediate: true },
)

const onKey = (event: KeyboardEvent): void => {
  if (event.key !== TOGGLE_KEY) return
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)
    return
  shown.value = !shown.value
}

onMounted(() => window.addEventListener('keydown', onKey))

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  stop()
})
</script>

<template>
  <dl v-if="shown && stats" class="stats">
    <dt>fps</dt>
    <dd>{{ stats.fps.toFixed(0) }}</dd>
    <dt>frame</dt>
    <dd>{{ stats.frameMs.toFixed(2) }} ms</dd>
    <dt>render</dt>
    <dd>{{ stats.renderMs.toFixed(2) }} ms</dd>
    <dt>draws</dt>
    <dd>{{ stats.drawCalls }}</dd>
    <dt>hexes</dt>
    <dd>{{ stats.instances.toLocaleString() }}</dd>
    <dt>grid tris</dt>
    <dd>{{ (stats.triangles / 1e6).toFixed(2) }}M</dd>
  </dl>
</template>

<style scoped>
.stats {
  position: absolute;
  left: 1rem;
  bottom: 1rem;
  display: grid;
  grid-template-columns: auto auto;
  gap: 0.1rem 0.75rem;
  margin: 0;
  padding: 0.5rem 0.7rem;
  border: 1px solid var(--line);
  border-radius: 0.4rem;
  background: color-mix(in srgb, var(--surface-raised) 88%, transparent);
  font:
    12px/1.3 ui-monospace,
    monospace;
  pointer-events: none;
}

dd {
  margin: 0;
  text-align: right;
}
</style>
