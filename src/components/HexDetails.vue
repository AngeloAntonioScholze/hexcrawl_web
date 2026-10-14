<script setup lang="ts">
import { computed, watch } from 'vue'
import { parseKey } from '../hex'
import { useHexMapStore } from '../stores/hexMap'
import HexEncounter from './HexEncounter.vue'
import HexEvents from './HexEvents.vue'
import HexLocations from './HexLocations.vue'
import HexResources from './HexResources.vue'

const store = useHexMapStore()

/** Matches the left panels' breakpoint, so all open collapsed on the same windows. */
const NARROW = 720

const narrow = (): boolean => window.innerWidth < NARROW

store.setPanelOpen('details', !narrow(), narrow())
const collapsed = computed(() => !store.panelsOpen.details)
const toggle = (): void => store.setPanelOpen('details', collapsed.value, narrow())

const hex = computed(() => store.selectedHex)
const tile = computed(() => (hex.value ? store.tileAt(hex.value) : undefined))
const position = computed(() => (hex.value ? parseKey(hex.value) : null))
const shore = computed(() => (hex.value ? store.shoreAt(hex.value) : null))
const SHORE_LABELS = { water: 'open water · ships only', coast: 'coast · ships put in here' }
const note = computed(() => (hex.value ? (store.notes.get(hex.value) ?? '') : ''))

// A phone keeps whatever the DM last chose: popping open on every tap would
// bury the map they are tapping on.
watch(hex, (next) => {
  if (next && !narrow()) store.setPanelOpen('details', true, false)
})

const onNote = (event: Event): void => {
  if (!hex.value) return
  store.setNote(hex.value, (event.target as HTMLTextAreaElement).value)
}
</script>

<template>
  <aside v-if="store.dmView && hex" class="details" :class="{ collapsed }">
    <header>
      <h2>hex {{ hex }}</h2>
      <div class="actions">
        <button
          type="button"
          class="toggle"
          :aria-expanded="!collapsed"
          :aria-label="collapsed ? 'open the hex details' : 'collapse the hex details'"
          @click="toggle"
        >
          <span aria-hidden="true">▾</span>
        </button>
        <button
          type="button"
          class="close"
          aria-label="deselect the hex"
          @click="store.selectHex(null)"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </header>

    <div v-show="!collapsed" class="body">
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
/* Sibling of the left panel, mirrored: same chrome, same scroll-inside rule.
   It starts under the view toggle and runs to the foot of the map; the
   minimap steps aside to its left while it is open. */
aside {
  position: absolute;
  top: 56px;
  right: 1rem;
  bottom: 1rem;
  box-sizing: border-box;
  width: min(var(--panel-width), calc(100vw - 2rem));
  padding: 0.75rem 1rem;
  border: 1px solid var(--line);
  border-radius: 0.5rem;
  background: color-mix(in srgb, var(--surface-raised) 88%, transparent);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--line) transparent;
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
}

h2 {
  margin: 0;
  font-size: 0.9rem;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.actions {
  display: flex;
  align-items: center;
}

.body {
  margin-top: 0.5rem;
}

aside.collapsed {
  width: auto;
  bottom: auto;
  max-height: none;
  overflow: visible;
}

.toggle,
.close {
  width: auto;
  padding: 0.1rem 0.35rem;
  border: none;
  background: none;
  color: var(--ink-dim);
  font: inherit;
  font-size: 1.7rem;
  line-height: 1;
  cursor: pointer;
}

.close {
  font-size: 1.3rem;
}

.toggle:hover,
.close:hover {
  color: var(--ink);
}

.toggle span {
  display: block;
  transition: transform 150ms ease;
}

/* Points the other way from the left panel's, towards the edge it folds into. */
aside.collapsed .toggle span {
  transform: rotate(90deg);
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

/* On a phone the left panel owns the top-left row, so this one drops a row
   lower and stays clear of it, and sits over the left one if both are opened. */
@media (max-width: 720px) {
  aside {
    top: 4.5rem;
    right: 0.5rem;
    z-index: 1;
    bottom: auto;
    max-height: calc(100% - 5rem);
    max-width: calc(100vw - 1rem);
  }
}
</style>
