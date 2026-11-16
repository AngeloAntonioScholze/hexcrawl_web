<script setup lang="ts">
import { computed } from 'vue'
import { orderOf, usePlayerView } from '../composables/usePlayerView'
import { useHexMapStore } from '../stores/hexMap'
import CaravanMerchants from './CaravanMerchants.vue'
import CaravanSupplies from './CaravanSupplies.vue'
import InventoryList from './InventoryList.vue'
import PanelSection from './PanelSection.vue'

const store = useHexMapStore()
// The players read what they see from their projection, as their map does. The
// DM's caravan opens as its own sub-panel instead (EntitySubPanel).
const player = usePlayerView()
const forPlayers = computed(() => !store.dmView)

// It never opens itself: that would fold away the entities list. The panel is
// always there and swaps what it shows.
const collapsed = computed(() => !store.panelsOpen.caravan)
const toggle = (): void => store.setPanelOpen('caravan', collapsed.value)

const caravan = computed(() => player.infoCaravan.value)
const riders = computed(() => (caravan.value ? player.ridersOf(caravan.value.id) : []))

const standing = computed(() =>
  caravan.value ? (player.scene.value.states.get(caravan.value.id)?.at ?? null) : null,
)
const headed = computed(() => {
  if (!caravan.value) return null
  const ahead = orderOf(player.scene.value, caravan.value.id)
  return ahead[ahead.length - 1] ?? null
})
</script>

<template>
  <aside v-if="forPlayers" class="panel caravan" :class="{ collapsed }">
    <header>
      <h2 class="title">
        <button
          id="panel-caravan-head"
          type="button"
          class="head"
          :aria-expanded="!collapsed"
          aria-controls="panel-caravan"
          @click="toggle"
        >
          <span v-if="caravan" class="label-row">
            <span class="pip" :style="{ background: caravan.color }" />
            <span class="name">{{ caravan.name }}</span>
          </span>
          <span v-else>caravan</span>
          <span class="chevron" aria-hidden="true">▾</span>
        </button>
      </h2>
    </header>

    <div
      v-show="!collapsed"
      id="panel-caravan"
      class="body"
      role="region"
      aria-labelledby="panel-caravan-head"
    >
      <p v-if="!caravan" class="dim empty">not travelling with a caravan</p>

      <template v-else>
        <dl class="summary">
          <dt>standing</dt>
          <dd>{{ standing ?? '—' }}</dd>

          <dt>headed</dt>
          <dd>{{ headed ?? '—' }}</dd>

          <dt>pace</dt>
          <dd>{{ caravan.pacePerTurn }} hex a turn</dd>
        </dl>

        <CaravanSupplies :caravan-id="caravan.id" />

        <InventoryList :owner-id="caravan.id" fold-key="caravan.inventory" />

        <PanelSection fold-key="caravan.riders" title="riders">
          <template #meta>{{ riders.length }}</template>
          <div class="section">
            <ul v-if="riders.length" class="list">
              <li v-for="rider in riders" :key="rider.id">
                <div v-if="!store.may('order', rider)" class="rider">
                  <span class="pip" :style="{ background: rider.color }" />
                  <span class="name">{{ rider.name }}</span>
                  <span class="label">{{ rider.kind }}</span>
                </div>
                <button
                  v-else
                  type="button"
                  :class="{ here: rider.id === store.selectedId }"
                  :aria-current="rider.id === store.selectedId ? 'true' : undefined"
                  :title="`give ${rider.name} the orders`"
                  @click="store.selectEntity(rider.id)"
                >
                  <span class="pip" :style="{ background: rider.color }" />
                  <span class="name">{{ rider.name }}</span>
                  <span class="label">{{ rider.kind }}</span>
                </button>
              </li>
            </ul>
            <p v-else class="label">nobody aboard</p>
          </div>
        </PanelSection>

        <CaravanMerchants :caravan-id="caravan.id" />
      </template>
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
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

/* The whole header row is the toggle. */
.head {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  min-width: 0;
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

.head:focus-visible {
  outline: 2px solid #7aa2c8;
  outline-offset: -2px;
  border-radius: 0.5rem 0.5rem 0 0;
}

.collapsed .head:focus-visible {
  border-radius: 0.5rem;
}

.label-row {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
}

.name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chevron {
  display: block;
  flex: none;
  color: var(--ink-dim);
  font-size: 1.7rem;
  line-height: 1;
  transition: transform 150ms ease;
}

.head:hover .chevron {
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

.section {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.78rem;
}

.label {
  color: var(--ink-dim);
}

p {
  margin: 0;
}

.summary {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.15rem 0.75rem;
  margin: 0;
  font-size: 0.8rem;
}

.summary dt {
  color: var(--ink-dim);
}

.summary dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
}

.dim {
  color: var(--ink-dim);
}

.empty {
  padding-top: 0.75rem;
  font-size: 0.78rem;
}

.list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.list button,
.list .rider {
  display: grid;
  width: 100%;
  grid-template-columns: 0.6rem 1fr auto;
  align-items: center;
  gap: 0.4rem;
  padding: 0.1rem 0.25rem;
  border: none;
  border-radius: 0.2rem;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.list button:hover {
  background: color-mix(in srgb, var(--line) 45%, transparent);
}

.list button.here {
  background: color-mix(in srgb, var(--line) 70%, transparent);
}

.list .rider {
  cursor: default;
}

.pip {
  flex: none;
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
}
</style>
