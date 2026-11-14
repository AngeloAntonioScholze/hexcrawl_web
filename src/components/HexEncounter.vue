<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { EncounterRoll } from '../encounters/tables'
import type { HexKey } from '../hex'
import { useHexMapStore } from '../stores/hexMap'
import { TERRAIN_LABELS } from '../terrain/terrain'
import EncounterTableEditor from './EncounterTableEditor.vue'
import PanelSection from './PanelSection.vue'
import PopupDialog from './PopupDialog.vue'

const props = defineProps<{ hex: HexKey }>()

const store = useHexMapStore()

const terrain = computed(() => store.tileAt(props.hex)?.terrain)
const editing = ref(false)

/** Undefined before a roll; null when the table had nothing to draw. */
const roll = ref<EncounterRoll | null | undefined>(undefined)

watch(
  () => props.hex,
  () => (roll.value = undefined),
)

const draw = (): void => {
  roll.value = store.rollEncounterOn(props.hex)
}

const dismiss = (): void => {
  roll.value = undefined
}

const accept = (): void => {
  if (!roll.value) return
  store.acceptEncounter(props.hex, roll.value.entry)
  roll.value = undefined
}
</script>

<template>
  <PanelSection fold-key="details.encounter" title="encounter">
    <template #actions>
      <!-- The editor's dialog sits by its button: a folded body is never drawn. -->
      <div v-if="terrain" class="actions">
        <button type="button" class="link" @click="editing = true">edit table</button>
        <PopupDialog v-model="editing" :title="`${TERRAIN_LABELS[terrain]} encounters`">
          <EncounterTableEditor :terrain="terrain" />
        </PopupDialog>
      </div>
    </template>
    <div class="encounter">
      <button v-if="roll === undefined" type="button" @click="draw">roll encounter</button>

      <template v-else>
        <div v-if="roll" class="result">
          <div class="head">
            <span class="title">{{ roll.entry.title }}</span>
            <span class="odds">{{ roll.entry.weight }} in {{ roll.total }}</span>
          </div>
          <p v-if="roll.entry.description" class="description">{{ roll.entry.description }}</p>
        </div>
        <p v-else class="dim">nothing on this table at {{ store.clock.phase }}</p>

        <div class="buttons">
          <button type="button" @click="draw">reroll</button>
          <button v-if="roll" type="button" @click="accept">accept</button>
          <button type="button" @click="dismiss">dismiss</button>
        </div>
      </template>
    </div>
  </PanelSection>
</template>

<style scoped>
.encounter {
  font-size: 0.78rem;
}

/* The editor inherits the size it had when it sat in the section body. */
.actions {
  font-size: 0.78rem;
}

.result {
  padding: 0.25rem 0.35rem;
  border-radius: 0.2rem;
  background: color-mix(in srgb, var(--line) 35%, transparent);
}

.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.4rem;
}

.title {
  overflow-wrap: anywhere;
}

.odds {
  flex: none;
  color: var(--ink-dim);
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
}

.description {
  margin: 0.15rem 0 0;
  color: var(--ink-dim);
  font-size: 0.75rem;
  overflow-wrap: anywhere;
}

.dim {
  margin: 0;
  color: var(--ink-dim);
  font-size: 0.75rem;
}

.buttons {
  display: flex;
  gap: 0.4rem;
  margin-top: 0.5rem;
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

button.link {
  width: auto;
  padding: 0;
  border: none;
  background: none;
  color: var(--ink-dim);
  font-size: 0.72rem;
  text-decoration: underline;
}

button.link:hover {
  color: var(--ink);
}
</style>
