<script setup lang="ts">
import { nextTick, ref } from 'vue'
import type { MapEntry } from '../persistence/mapIndex'
import { useMapLibraryStore } from '../stores/mapLibrary'

const library = useMapLibraryStore()

const editing = ref<string | null>(null)
const draft = ref('')
const nameInput = ref<HTMLInputElement[]>([])

const startRename = async (map: MapEntry): Promise<void> => {
  editing.value = map.id
  draft.value = map.name
  await nextTick()
  nameInput.value[0]?.select()
}

// Enter and the blur that follows it both land here; only the first one counts.
const commitRename = (): void => {
  const id = editing.value
  if (id === null) return
  editing.value = null
  void library.rename(id, draft.value)
}

const remove = (map: MapEntry): void => {
  if (!window.confirm(`Delete ${map.name}? This cannot be undone.`)) return
  void library.remove(map.id)
}
</script>

<template>
  <section v-if="library.maps.length > 0" class="maps" aria-label="saved maps">
    <div class="row">
      <span>maps</span>
      <button type="button" :disabled="library.busy" @click="library.create">new map</button>
    </div>
    <ul>
      <li v-for="map in library.maps" :key="map.id" :class="{ here: map.id === library.currentId }">
        <input
          v-if="editing === map.id"
          ref="nameInput"
          v-model="draft"
          class="name"
          aria-label="map name"
          maxlength="60"
          @keydown.enter="commitRename"
          @keydown.escape="editing = null"
          @blur="commitRename"
        />
        <button
          v-else
          type="button"
          class="name"
          :disabled="library.busy"
          :aria-current="map.id === library.currentId"
          @click="library.open(map.id)"
        >
          {{ map.name }}
        </button>
        <button
          type="button"
          class="icon"
          :aria-label="`rename ${map.name}`"
          title="rename"
          @click="startRename(map)"
        >
          ✎
        </button>
        <button
          type="button"
          class="icon"
          :aria-label="`delete ${map.name}`"
          :disabled="library.busy || library.maps.length < 2"
          :title="library.maps.length < 2 ? 'the only map cannot be deleted' : 'delete'"
          @click="remove(map)"
        >
          ×
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.maps {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

ul {
  max-height: 9rem;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  list-style: none;
}

li {
  display: grid;
  grid-template-columns: 1fr 1.4rem 1.4rem;
  align-items: center;
  gap: 0.2rem;
  border-radius: 0.2rem;
}

li.here {
  background: color-mix(in srgb, var(--line) 70%, transparent);
}

.name {
  min-width: 0;
  padding: 0.1rem 0.25rem;
  overflow: hidden;
  border: none;
  border-radius: 0.2rem;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

button.name:hover {
  background: color-mix(in srgb, var(--line) 45%, transparent);
}

input.name {
  background: var(--surface);
  outline: 1px solid var(--line);
  cursor: text;
}

.icon {
  padding: 0;
  border: none;
  background: none;
  color: var(--ink-dim);
  font: inherit;
  line-height: 1.2;
  cursor: pointer;
}

.icon:hover:not(:disabled) {
  color: var(--ink);
}

.icon:disabled {
  opacity: 0.35;
  cursor: default;
}
</style>
