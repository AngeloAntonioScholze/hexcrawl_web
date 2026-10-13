<script setup lang="ts">
import { computed, ref } from 'vue'
import type { HexKey } from '../hex'
import type { HexEvent } from '../hex/content'
import { useHexMapStore } from '../stores/hexMap'

const props = defineProps<{ hex: HexKey }>()

const store = useHexMapStore()

const events = computed<readonly HexEvent[]>(() => store.events.get(props.hex) ?? [])

const title = ref('')
const description = ref('')

const canAdd = computed(() => title.value.trim().length > 0)

const add = (): void => {
  if (!canAdd.value) return
  store.addEvent(props.hex, { title: title.value.trim(), description: description.value.trim() })
  title.value = ''
  description.value = ''
}
</script>

<template>
  <section class="events">
    <h2>events</h2>

    <ul v-if="events.length" class="list">
      <li
        v-for="event in events"
        :key="event.id"
        :class="{ ahead: event.turn !== undefined && event.turn > store.turn }"
      >
        <div class="head">
          <span class="title">
            {{ event.title }}
            <span v-if="event.turn !== undefined" class="met">turn {{ event.turn }}</span>
          </span>
          <button
            type="button"
            class="drop"
            :title="`remove ${event.title}`"
            @click="store.removeEvent(props.hex, event.id)"
          >
            ×
          </button>
        </div>
        <p v-if="event.description" class="description">{{ event.description }}</p>
      </li>
    </ul>
    <p v-else class="dim">nothing happens here yet</p>

    <form class="add" @submit.prevent="add">
      <input v-model="title" type="text" placeholder="title" />
      <textarea v-model="description" rows="2" placeholder="description"></textarea>
      <button type="submit" :disabled="!canAdd">add event</button>
    </form>
  </section>
</template>

<style scoped>
.events {
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

.list {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.list li {
  padding: 0.25rem 0.35rem;
  border-radius: 0.2rem;
  background: color-mix(in srgb, var(--line) 35%, transparent);
}

.head {
  display: grid;
  grid-template-columns: 1fr 1.4rem;
  align-items: start;
  gap: 0.4rem;
}

.title {
  overflow-wrap: anywhere;
}

.met {
  color: var(--ink-dim);
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
}

/* Met on a turn the crawl has been wound back past: still recorded, not yet lived. */
.list li.ahead {
  color: var(--ink-dim);
}

.description {
  margin: 0.15rem 0 0;
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
  gap: 0.4rem;
  margin-top: 0.5rem;
}

input,
textarea {
  box-sizing: border-box;
  width: 100%;
  padding: 0.3rem;
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
