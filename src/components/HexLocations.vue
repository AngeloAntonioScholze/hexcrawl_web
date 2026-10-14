<script setup lang="ts">
import { computed, ref } from 'vue'
import type { HexKey } from '../hex'
import { useHexMapStore } from '../stores/hexMap'
import PopupDialog from './PopupDialog.vue'

const props = defineProps<{ hex: HexKey }>()

const KINDS = ['settlement', 'dungeon', 'ruin', 'lair', 'landmark', 'shrine']

const store = useHexMapStore()

const locations = computed(() => store.locations.get(props.hex) ?? [])

const name = ref('')
const kind = ref('')
const description = ref('')
const adding = ref(false)

const canAdd = computed(() => name.value.trim() !== '')

const add = (): void => {
  if (!canAdd.value) return
  store.addLocation(props.hex, {
    name: name.value.trim(),
    kind: kind.value.trim(),
    description: description.value.trim(),
  })
  name.value = ''
  kind.value = ''
  description.value = ''
  adding.value = false
}

const listId = computed(() => `location-kinds-${props.hex}`)
</script>

<template>
  <section class="locations">
    <h2>locations</h2>
    <ul v-if="locations.length > 0">
      <li v-for="location in locations" :key="location.id">
        <div class="row">
          <span class="name">{{ location.name }}</span>
          <span v-if="location.kind" class="kind">{{ location.kind }}</span>
          <button
            class="drop"
            type="button"
            :aria-label="`remove ${location.name}`"
            title="remove"
            @click="store.removeLocation(hex, location.id)"
          >
            ×
          </button>
        </div>
        <p v-if="location.description" class="description">{{ location.description }}</p>
      </li>
    </ul>
    <p v-else class="dim">no locations here</p>

    <button type="button" class="open" @click="adding = true">add location</button>

    <PopupDialog v-model="adding" :title="`new location · hex ${hex}`">
      <form class="add" @submit.prevent="add">
        <input v-model="name" type="text" placeholder="name" required />
        <input v-model="kind" type="text" placeholder="kind" :list="listId" />
        <datalist :id="listId">
          <option v-for="k in KINDS" :key="k" :value="k" />
        </datalist>
        <textarea v-model="description" rows="3" placeholder="description" />
        <button type="submit" :disabled="!canAdd">add location</button>
      </form>
    </PopupDialog>
  </section>
</template>

<style scoped>
.locations {
  margin-top: 0.75rem;
  padding-top: 0.6rem;
  border-top: 1px solid var(--line);
  font-size: 0.78rem;
}

h2 {
  margin: 0 0 0.4rem;
  color: var(--ink-dim);
  font-size: 0.72rem;
  font-weight: normal;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

li + li {
  margin-top: 0.35rem;
}

.row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 1.4rem;
  align-items: baseline;
  gap: 0.4rem;
}

.name {
  overflow: hidden;
  color: var(--ink);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kind {
  color: var(--ink-dim);
  font-size: 0.72rem;
}

.description {
  margin: 0.1rem 0 0;
  color: var(--ink-dim);
  font-size: 0.75rem;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.dim {
  margin: 0;
  color: var(--ink-dim);
  font-size: 0.75rem;
}

.add {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.78rem;
}

.open {
  margin-top: 0.6rem;
}

input,
textarea {
  box-sizing: border-box;
  width: 100%;
  padding: 0.3rem 0.45rem;
  border: 1px solid var(--line);
  border-radius: 0.35rem;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-size: 0.78rem;
}

textarea {
  resize: vertical;
}

input:focus,
textarea:focus {
  border-color: #7aa2c8;
  outline: none;
}

button {
  width: 100%;
  padding: 0.35rem 0.6rem;
  border: 1px solid var(--line);
  border-radius: 0.35rem;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-size: 0.78rem;
  cursor: pointer;
}

button:hover:not(:disabled) {
  border-color: #7aa2c8;
}

button:disabled {
  color: var(--ink-dim);
  cursor: default;
}

button.drop {
  width: auto;
  padding: 0;
  border: none;
  background: none;
  color: var(--ink-dim);
  line-height: 1.2;
}

button.drop:hover {
  color: var(--ink);
}
</style>
