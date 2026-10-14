<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  DEFAULT_ENCOUNTERS,
  ENCOUNTER_WHENS,
  terrainRows,
  type EncounterEntry,
  type EncounterRow,
  type EncounterWhen,
} from '../encounters/tables'
import { useHexMapStore } from '../stores/hexMap'
import type { TerrainId } from '../terrain/terrain'

const props = defineProps<{ terrain: TerrainId }>()

const store = useHexMapStore()

const rows = computed<EncounterRow[]>(() =>
  terrainRows(DEFAULT_ENCOUNTERS, store.encounterOverrides, props.terrain),
)

const touched = computed(() => rows.value.some((row) => row.status !== 'default'))

const valueOf = (event: Event): string =>
  (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value

const onTitle = (entry: EncounterEntry, event: Event): void => {
  const input = event.target as HTMLInputElement
  const title = input.value.trim()
  if (title) store.setEncounter(entry.id, { title })
  else input.value = entry.title
}

const onDescription = (entry: EncounterEntry, event: Event): void => {
  store.setEncounter(entry.id, { description: valueOf(event).trim() })
}

const onWhen = (entry: EncounterEntry, event: Event): void => {
  store.setEncounter(entry.id, { when: valueOf(event) as EncounterWhen })
}

// The store refuses a bad weight without changing, so nothing would re-render
// the field: put the standing weight back by hand.
const onWeight = (entry: EncounterEntry, event: Event): void => {
  const input = event.target as HTMLInputElement
  const weight = input.value === '' ? NaN : Number(input.value)
  if (Number.isFinite(weight) && weight >= 0) store.setEncounter(entry.id, { weight })
  else input.value = String(entry.weight)
}

const title = ref('')
const description = ref('')
const when = ref<EncounterWhen>('any')
const weight = ref(1)

const canAdd = computed(
  () => title.value.trim().length > 0 && Number.isFinite(weight.value) && weight.value >= 0,
)

const add = (): void => {
  if (!canAdd.value) return
  store.addEncounter({
    terrain: props.terrain,
    when: when.value,
    weight: weight.value,
    title: title.value.trim(),
    description: description.value.trim(),
  })
  title.value = ''
  description.value = ''
  when.value = 'any'
  weight.value = 1
}
</script>

<template>
  <div class="editor">
    <div class="top">
      <button
        type="button"
        class="reset"
        :disabled="!touched"
        @click="store.resetEncounters(props.terrain)"
      >
        reset to defaults
      </button>
    </div>

    <ul class="rows">
      <li v-for="row in rows" :key="row.entry.id" :class="row.status">
        <template v-if="row.status === 'removed'">
          <div class="head">
            <span class="struck">{{ row.entry.title }}</span>
            <button
              type="button"
              class="link"
              :title="`put ${row.entry.title} back`"
              @click="store.restoreEncounter(row.entry.id)"
            >
              restore
            </button>
          </div>
        </template>

        <template v-else>
          <div class="head">
            <input
              type="text"
              :value="row.entry.title"
              aria-label="title"
              @change="onTitle(row.entry, $event)"
            />
            <button
              type="button"
              class="drop"
              :title="`remove ${row.entry.title}`"
              @click="store.removeEncounter(row.entry.id)"
            >
              ×
            </button>
          </div>
          <div class="odds">
            <select :value="row.entry.when" aria-label="when" @change="onWhen(row.entry, $event)">
              <option v-for="one in ENCOUNTER_WHENS" :key="one" :value="one">{{ one }}</option>
            </select>
            <label class="weight">
              <span>weight</span>
              <input
                type="number"
                min="0"
                step="1"
                :value="row.entry.weight"
                @change="onWeight(row.entry, $event)"
              />
            </label>
          </div>
          <textarea
            :value="row.entry.description"
            rows="2"
            aria-label="description"
            placeholder="description"
            @change="onDescription(row.entry, $event)"
          ></textarea>
          <div v-if="row.status !== 'default'" class="mark">
            <span>{{ row.status === 'added' ? 'your own line' : 'edited' }}</span>
            <button
              v-if="row.status === 'changed'"
              type="button"
              class="link"
              @click="store.restoreEncounter(row.entry.id)"
            >
              restore
            </button>
          </div>
        </template>
      </li>
    </ul>

    <form class="add" @submit.prevent="add">
      <input v-model="title" type="text" placeholder="title" />
      <textarea v-model="description" rows="2" placeholder="description"></textarea>
      <div class="odds">
        <select v-model="when" aria-label="when">
          <option v-for="one in ENCOUNTER_WHENS" :key="one" :value="one">{{ one }}</option>
        </select>
        <label class="weight">
          <span>weight</span>
          <input v-model.number="weight" type="number" min="0" step="1" />
        </label>
      </div>
      <button type="submit" :disabled="!canAdd">add line</button>
    </form>
  </div>
</template>

<style scoped>
.editor {
  font-size: 0.78rem;
}

.top {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 0.4rem;
}

.rows {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.rows li {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.3rem 0.35rem;
  border-radius: 0.2rem;
  background: color-mix(in srgb, var(--line) 35%, transparent);
}

.rows li.removed {
  background: none;
}

.head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.4rem;
}

.struck {
  color: var(--ink-dim);
  text-decoration: line-through;
  overflow-wrap: anywhere;
}

.odds {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  gap: 0.4rem;
}

.weight {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  color: var(--ink-dim);
  font-size: 0.72rem;
}

.mark {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  color: var(--ink-dim);
  font-size: 0.7rem;
}

.add {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-top: 0.5rem;
}

input,
textarea,
select {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
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
textarea:focus,
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

button:hover:not(:disabled) {
  border-color: #7aa2c8;
}

button:disabled {
  color: var(--ink-dim);
  cursor: default;
}

button.reset {
  width: auto;
  padding: 0.15rem 0.45rem;
  font-size: 0.72rem;
}

button.drop,
button.link {
  width: auto;
  padding: 0;
  border: none;
  background: none;
  color: var(--ink-dim);
  line-height: 1.2;
}

button.link {
  font-size: 0.7rem;
  text-decoration: underline;
}

button.drop:hover,
button.link:hover {
  color: var(--ink);
}
</style>
