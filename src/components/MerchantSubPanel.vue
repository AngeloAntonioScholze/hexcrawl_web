<script setup lang="ts">
import { computed } from 'vue'
import { unlockedServices } from '../entities/catalog'
import { MERCHANT_INFO, MERCHANT_LEVELS, type Merchant } from '../entities/merchant'
import { useHexMapStore } from '../stores/hexMap'
import PanelSection from './PanelSection.vue'
import SubPanelFrame from './SubPanelFrame.vue'

const props = defineProps<{
  merchant: Merchant
  parentName: string
  parentInView: boolean
}>()

const store = useHexMapStore()
const info = computed(() => MERCHANT_INFO[props.merchant.type])
const offers = computed(() =>
  unlockedServices(props.merchant.type, props.merchant.level, store.catalog),
)

const step = (by: number): void =>
  store.setMerchantLevel(props.merchant.id, props.merchant.level + by)
</script>

<template>
  <SubPanelFrame
    :level="2"
    :name="merchant.name"
    :parent-name="parentName"
    :parent-in-view="parentInView"
  >
    <template #lead>
      <span class="icon" aria-hidden="true">{{ info.icon }}</span>
    </template>
    <dl class="summary">
      <dt>type</dt>
      <dd>{{ info.label.toLowerCase() }}</dd>
      <dt>level</dt>
      <dd v-if="store.may('merchants')" class="stepper">
        <button
          type="button"
          :disabled="merchant.level <= MERCHANT_LEVELS.min"
          :aria-label="`lower ${merchant.name}'s level`"
          @click="step(-1)"
        >
          −
        </button>
        <span class="value">lv {{ merchant.level }}</span>
        <button
          type="button"
          :disabled="merchant.level >= MERCHANT_LEVELS.max"
          :aria-label="`raise ${merchant.name}'s level`"
          @click="step(1)"
        >
          +
        </button>
      </dd>
      <dd v-else class="value">lv {{ merchant.level }}</dd>
      <dt>with</dt>
      <dd>{{ parentName }}</dd>
    </dl>
    <p class="dim blurb">{{ info.blurb }}</p>
    <PanelSection fold-key="merchant.offers" title="offers">
      <template #meta>{{ offers.length }}</template>
      <ul v-if="offers.length" class="offers" :aria-label="`what ${merchant.name} offers`">
        <li v-for="entry in offers" :key="entry.id">
          <div class="line">
            <span class="offer">{{ entry.name }}</span>
            <span class="dim">{{ entry.price }}</span>
          </div>
          <p class="dim description">{{ entry.description }}</p>
        </li>
      </ul>
      <p v-else class="dim">nothing offered yet</p>
    </PanelSection>
    <button
      v-if="store.may('merchants')"
      type="button"
      class="go"
      @click="store.removeMerchant(merchant.id)"
    >
      let {{ merchant.name }} go
    </button>
  </SubPanelFrame>
</template>

<style scoped>
.icon {
  flex: none;
}

.summary {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  gap: 0.3rem 1rem;
  margin: 0.25rem 0 0.5rem;
  font-size: 0.78rem;
}

.summary dt {
  color: var(--ink-dim);
}

.summary dd {
  margin: 0;
  text-align: right;
}

.value {
  font-variant-numeric: tabular-nums;
}

.stepper {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.25rem;
}

.stepper .value {
  min-width: 2.4rem;
  text-align: center;
}

.stepper button {
  width: 1.3rem;
  padding: 0;
  line-height: 1.2;
}

.dim {
  color: var(--ink-dim);
}

p {
  margin: 0;
  font-size: 0.78rem;
}

.blurb {
  margin-bottom: 0.5rem;
}

.offers {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.78rem;
}

.line {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
}

.offer {
  min-width: 0;
}

.description {
  display: -webkit-box;
  overflow: hidden;
  font-size: 0.72rem;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}

button {
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

.go {
  width: 100%;
  margin-top: 0.75rem;
}
</style>
