<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { HexKey } from '../hex'
import { useHexMapStore } from '../stores/hexMap'
import {
  nearestWithin,
  RESOURCE_LABELS,
  RESOURCE_TYPES,
  TERRAIN_RESOURCES,
  type ResourceType,
} from '../terrain/resources'

const props = defineProps<{ hex: HexKey }>()

const store = useHexMapStore()

const resources = computed(() => store.resourcesOn(props.hex))

const suited = computed<readonly ResourceType[]>(() => {
  const terrain = store.tileAt(props.hex)?.terrain
  return terrain ? TERRAIN_RESOURCES[terrain] : []
})
const others = computed(() => RESOURCE_TYPES.filter((type) => !suited.value.includes(type)))

const type = ref<ResourceType>(suited.value[0] ?? RESOURCE_TYPES[0])
watch(suited, (next) => (type.value = next[0] ?? RESOURCE_TYPES[0]))

const crowding = computed(() => nearestWithin(props.hex, store.resources, store.resourceSpacing))

const describe = (hex: HexKey, away: number): string =>
  away === 0 ? 'on this hex' : `${away} ${away === 1 ? 'hex' : 'hexes'} away at ${hex}`

const add = (): void => {
  store.addResource(props.hex, type.value)
}
</script>

<template>
  <section class="resources">
    <h2>resources</h2>
    <ul v-if="resources.length > 0">
      <li v-for="resource in resources" :key="resource.id">
        <span class="name">{{ RESOURCE_LABELS[resource.type] }}</span>
        <span class="origin">{{ resource.origin }}</span>
        <button
          class="drop"
          type="button"
          :aria-label="`remove ${RESOURCE_LABELS[resource.type]}`"
          title="remove"
          @click="store.removeResource(resource.id)"
        >
          ×
        </button>
      </li>
    </ul>
    <p v-else class="dim">no resources here</p>

    <form class="add" @submit.prevent="add">
      <select v-model="type" aria-label="resource type">
        <optgroup v-if="suited.length > 0" label="suits this terrain">
          <option v-for="one in suited" :key="one" :value="one">{{ RESOURCE_LABELS[one] }}</option>
        </optgroup>
        <optgroup label="other">
          <option v-for="one in others" :key="one" :value="one">{{ RESOURCE_LABELS[one] }}</option>
        </optgroup>
      </select>
      <p v-if="crowding" class="warning" role="status">
        {{ RESOURCE_LABELS[crowding.resource.type] }}
        {{ describe(crowding.resource.hex, crowding.distance) }}, inside the
        {{ store.resourceSpacing }}-hex spacing
      </p>
      <button type="submit">add resource</button>
    </form>
  </section>
</template>

<style scoped>
.resources {
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

li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto 1.4rem;
  align-items: baseline;
  gap: 0.4rem;
}

li + li {
  margin-top: 0.35rem;
}

.name {
  overflow: hidden;
  color: var(--ink);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.origin {
  color: var(--ink-dim);
  font-size: 0.72rem;
}

.dim {
  margin: 0;
  color: var(--ink-dim);
  font-size: 0.75rem;
}

.warning {
  margin: 0;
  color: #d8a657;
  font-size: 0.75rem;
}

.add {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-top: 0.6rem;
}

select {
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

select:focus {
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

button:hover {
  border-color: #7aa2c8;
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
