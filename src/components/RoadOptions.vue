<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { useHexMapStore } from '../stores/hexMap'

const store = useHexMapStore()

const onKey = (event: KeyboardEvent): void => {
  if (event.key === 'Escape' && store.roadTail) store.finishRoad()
}

onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="road-options">
    <label>
      <input
        type="checkbox"
        :checked="store.roadErase"
        @change="store.setRoadErase(($event.target as HTMLInputElement).checked)"
      />
      <span>erase</span>
    </label>
    <button type="button" :disabled="!store.roadTail" @click="store.finishRoad()">
      finish road
    </button>
  </div>
</template>

<style scoped>
.road-options {
  display: flex;
  gap: 8px;
  align-items: center;
}

label {
  display: flex;
  gap: 4px;
  align-items: center;
  cursor: pointer;
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

button:hover:not(:disabled) {
  border-color: #7aa2c8;
}

button:disabled {
  opacity: 0.5;
  cursor: default;
}
</style>
