<script setup lang="ts">
import type { FogMode } from '../hex/fogEdits'
import { BRUSH_LIMITS, BRUSH_TOOLS, DM_TOOLS, useHexMapStore, type DmTool } from '../stores/hexMap'
import RoadOptions from './RoadOptions.vue'

const store = useHexMapStore()

const TOOL_LABELS: Readonly<Record<DmTool, string>> = {
  select: 'select',
  paint: 'paint terrain',
  fog: 'fog',
  road: 'road',
}

const FOG_MODES: readonly FogMode[] = ['reveal', 'hide']

const onBrush = (event: Event): void => {
  store.setBrushSize(Number((event.target as HTMLInputElement).value))
}
</script>

<template>
  <div v-if="store.dmView" class="dm-toolbar" role="toolbar" aria-label="DM tools">
    <div class="tools">
      <button
        v-for="tool in DM_TOOLS"
        :key="tool"
        type="button"
        :class="{ here: store.dmTool === tool }"
        :aria-pressed="store.dmTool === tool"
        @click="store.setDmTool(tool)"
      >
        {{ TOOL_LABELS[tool] }}
      </button>
    </div>

    <label v-if="BRUSH_TOOLS.has(store.dmTool)" class="brush">
      <span>brush</span>
      <input
        :value="store.brushSize"
        type="range"
        :min="BRUSH_LIMITS.min"
        :max="BRUSH_LIMITS.max"
        :step="BRUSH_LIMITS.step"
        @input="onBrush"
      />
      <span class="value">{{ store.brushSize }}</span>
    </label>

    <div v-if="store.dmTool === 'fog'" class="fog-modes" role="group" aria-label="fog brush">
      <button
        v-for="mode in FOG_MODES"
        :key="mode"
        type="button"
        :class="{ here: store.fogMode === mode }"
        :aria-pressed="store.fogMode === mode"
        @click="store.setFogMode(mode)"
      >
        {{ mode }}
      </button>
    </div>
    <RoadOptions v-if="store.dmTool === 'road'" />
  </div>
</template>

<style scoped>
.dm-toolbar {
  position: absolute;
  bottom: 12px;
  left: 50%;
  translate: -50% 0;
  z-index: 10;
  display: grid;
  gap: 6px;
  justify-items: center;
  padding: 6px 8px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface-raised) 88%, transparent);
  color: var(--ink);
  font-size: 0.78rem;
}

.tools {
  display: flex;
  gap: 4px;
}

button {
  padding: 4px 10px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--surface);
  color: var(--ink-dim);
  font: inherit;
  cursor: pointer;
}

button:hover {
  border-color: #7aa2c8;
}

button.here {
  border-color: #7aa2c8;
  color: var(--ink);
  background: color-mix(in srgb, #7aa2c8 25%, var(--surface));
}

.brush {
  display: flex;
  gap: 8px;
  align-items: center;
}

.fog-modes {
  display: flex;
  gap: 4px;
}

.value {
  min-width: 1ch;
  font-variant-numeric: tabular-nums;
}
</style>
