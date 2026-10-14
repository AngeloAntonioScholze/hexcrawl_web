<script setup lang="ts">
import { computed, watch } from 'vue'
import { MERCHANT_INFO } from '../entities/merchant'
import { useHexMapStore } from '../stores/hexMap'
import CaravanSupplies from './CaravanSupplies.vue'

const store = useHexMapStore()

/** Matches the other panels' breakpoint, so all open collapsed on the same windows. */
const NARROW = 720

const narrow = (): boolean => window.innerWidth < NARROW

store.setPanelOpen('caravan', !narrow(), narrow())
const collapsed = computed(() => !store.panelsOpen.caravan)
const toggle = (): void => store.setPanelOpen('caravan', collapsed.value, narrow())

const caravan = computed(() => store.shownCaravan)
const riders = computed(() => (caravan.value ? store.ridersOf(caravan.value.id) : []))
const merchants = computed(() => (caravan.value ? store.merchantsOf(caravan.value.id) : []))

// As with the hex details, a phone keeps whatever was last chosen: opening
// here would fold away the entities list the caravan was just picked from.
watch(
  () => caravan.value?.id,
  (next) => {
    if (next && !narrow()) store.setPanelOpen('caravan', true, false)
  },
)
</script>

<template>
  <aside v-if="caravan" class="panel caravan" :class="{ collapsed }">
    <header>
      <h1>
        <span class="pip" :style="{ background: caravan.color }" />
        <span class="name">{{ caravan.name }}</span>
      </h1>
      <button
        type="button"
        class="toggle"
        :aria-expanded="!collapsed"
        :aria-label="collapsed ? 'open the caravan panel' : 'collapse the caravan panel'"
        @click="toggle"
      >
        <span aria-hidden="true">▾</span>
      </button>
    </header>

    <div v-show="!collapsed" class="body">
      <CaravanSupplies :caravan-id="caravan.id" />

      <section class="section" aria-label="riders">
        <div class="row">
          <span class="label">riders</span>
          <span class="value">{{ riders.length }}</span>
        </div>
        <ul v-if="riders.length" class="list">
          <li v-for="rider in riders" :key="rider.id">
            <button
              type="button"
              :class="{ here: rider.id === store.selectedId }"
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
      </section>

      <section class="section" aria-label="merchants">
        <div class="row">
          <span class="label">merchants</span>
          <span class="value">{{ merchants.length }}</span>
        </div>
        <ul v-if="merchants.length" class="list">
          <li v-for="merchant in merchants" :key="merchant.id" class="merchant">
            <span aria-hidden="true">{{ MERCHANT_INFO[merchant.type].icon }}</span>
            <span class="name" :title="MERCHANT_INFO[merchant.type].blurb">
              {{ merchant.name }}
              <span v-if="merchant.name !== MERCHANT_INFO[merchant.type].label" class="label">
                {{ MERCHANT_INFO[merchant.type].label.toLowerCase() }}
              </span>
            </span>
            <span class="value">lv {{ merchant.level }}</span>
          </li>
        </ul>
        <p v-else class="label">no merchants in the crew</p>
      </section>
    </div>
  </aside>
</template>

<style scoped>
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
}

h1 {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  min-width: 0;
  margin: 0;
  font-size: 0.9rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.toggle {
  padding: 0.1rem 0.35rem;
  border: none;
  background: none;
  color: var(--ink-dim);
  font-size: 1.7rem;
  line-height: 1;
  cursor: pointer;
}

.toggle:hover {
  color: var(--ink);
}

.toggle span {
  display: block;
  transition: transform 150ms ease;
}

.collapsed .toggle span {
  transform: rotate(-90deg);
}

.body {
  margin-top: 0.5rem;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  margin-top: 0.75rem;
  padding-top: 0.6rem;
  border-top: 1px solid var(--line);
  font-size: 0.78rem;
}

.row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.label {
  color: var(--ink-dim);
}

.value {
  font-variant-numeric: tabular-nums;
}

p {
  margin: 0;
}

.list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.list button {
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

.merchant {
  display: grid;
  grid-template-columns: 1.1rem 1fr auto;
  align-items: center;
  gap: 0.4rem;
  padding: 0.1rem 0.25rem;
}

.pip {
  flex: none;
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
}
</style>
