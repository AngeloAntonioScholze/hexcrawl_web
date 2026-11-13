<script setup lang="ts">
import { computed, watch } from 'vue'
import { parseKey } from '../hex'
import { useHexMapStore } from '../stores/hexMap'
import HexEncounter from './HexEncounter.vue'
import HexEvents from './HexEvents.vue'
import HexLocations from './HexLocations.vue'
import HexResources from './HexResources.vue'

const store = useHexMapStore()

/** The phone layout: the column spans the window there. */
const narrow = (): boolean => window.innerWidth <= 720

const collapsed = computed(() => !store.panelsOpen.details)
const toggle = (): void => store.setPanelOpen('details', collapsed.value)

const hex = computed(() => store.selectedHex)
const tile = computed(() => (hex.value ? store.tileAt(hex.value) : undefined))
const position = computed(() => (hex.value ? parseKey(hex.value) : null))
const shore = computed(() => (hex.value ? store.shoreAt(hex.value) : null))
const SHORE_LABELS = { water: 'open water · ships only', coast: 'coast · board ships from here' }
const note = computed(() => (hex.value ? (store.notes.get(hex.value) ?? '') : ''))

// A phone keeps whatever the DM last chose: popping open on every tap would
// bury the map they are tapping on.
watch(hex, (next) => {
  if (next && store.may('notes') && !narrow()) store.revealPanel('details')
})

const onNote = (event: Event): void => {
  if (!hex.value) return
  store.setNote(hex.value, (event.target as HTMLTextAreaElement).value)
}
</script>

<template>
  <!-- The DM's notebook on a hex: whoever may not write in it has no use for it open. -->
  <aside v-if="store.may('notes') && hex" class="panel details" :class="{ collapsed }">
    <header>
      <h2 class="title">
        <button
          id="panel-details-head"
          type="button"
          class="head"
          :aria-expanded="!collapsed"
          aria-controls="panel-details"
          @click="toggle"
        >
          <span>hex {{ hex }}</span>
          <span class="chevron" aria-hidden="true">▾</span>
        </button>
      </h2>
      <button
        type="button"
        class="close"
        aria-label="deselect the hex"
        @click="store.selectHex(null)"
      >
        <span aria-hidden="true">×</span>
      </button>
    </header>

    <div
      v-show="!collapsed"
      id="panel-details"
      class="body"
      role="region"
      aria-labelledby="panel-details-head"
    >
      <dl>
        <dt>terrain</dt>
        <dd>
          {{ tile?.terrain ?? '—' }}
          <span v-if="tile" class="dim">lv {{ tile.level }}</span>
        </dd>

        <template v-if="shore === 'water' || shore === 'coast'">
          <dt>shore</dt>
          <dd>{{ SHORE_LABELS[shore] }}</dd>
        </template>

        <dt>position</dt>
        <dd v-if="position">q {{ position.q }} · r {{ position.r }}</dd>
      </dl>

      <label class="control">
        <span>notes</span>
        <textarea :value="note" rows="4" placeholder="what the DM knows here" @input="onNote" />
      </label>

      <HexEncounter :hex="hex" />
      <HexEvents :hex="hex" />
      <HexLocations :hex="hex" />
      <HexResources :hex="hex" />
    </div>
  </aside>
</template>

<style scoped>
header {
  display: flex;
  flex: none;
  min-height: var(--dock-row);
}

.title {
  display: flex;
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 0.9rem;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

/* The whole header row but the close is the toggle. */
.head {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-height: var(--dock-row);
  padding: 0 1rem;
  border: none;
  background: none;
  color: var(--ink);
  font: inherit;
  letter-spacing: inherit;
  text-align: left;
  text-transform: inherit;
  cursor: pointer;
}

.close {
  flex: none;
  width: var(--dock-row);
  height: var(--dock-row);
  padding: 0;
  border: none;
  background: none;
  color: var(--ink-dim);
  font: inherit;
  font-size: 1.3rem;
  line-height: 1;
  cursor: pointer;
}

.head:focus-visible,
.close:focus-visible {
  outline: 2px solid #7aa2c8;
  outline-offset: -2px;
}

.head:focus-visible {
  border-radius: 0.5rem 0 0;
}

.collapsed .head:focus-visible {
  border-radius: 0.5rem 0 0 0.5rem;
}

.close:focus-visible {
  border-radius: 0 0.5rem 0 0;
}

.collapsed .close:focus-visible {
  border-radius: 0 0.5rem 0.5rem 0;
}

.chevron {
  display: block;
  color: var(--ink-dim);
  font-size: 1.7rem;
  line-height: 1;
  transition: transform 150ms ease;
}

.head:hover .chevron,
.close:hover {
  color: var(--ink);
}

.collapsed .chevron {
  transform: rotate(-90deg);
}

.body {
  flex: 1 1 auto;
  min-height: 0;
  padding: 0 1rem 0.75rem;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--line) transparent;
}

dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.15rem 0.75rem;
  margin: 0;
  font-size: 0.8rem;
}

dt {
  color: var(--ink-dim);
}

dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
}

.dim {
  color: var(--ink-dim);
}

.control {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.4rem;
  margin-top: 0.75rem;
  padding-top: 0.6rem;
  border-top: 1px solid var(--line);
  font-size: 0.78rem;
}

.control > span {
  color: var(--ink-dim);
  font-size: 0.72rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 4.5rem;
  padding: 0.35rem 0.5rem;
  border: 1px solid var(--line);
  border-radius: 0.35rem;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-size: 0.78rem;
  resize: vertical;
}

textarea:focus {
  border-color: #7aa2c8;
  outline: none;
}
</style>
