<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSubPanels } from '../composables/useSubPanels'
import {
  clampLevel,
  MERCHANT_INFO,
  MERCHANT_LEVELS,
  MERCHANT_TYPES,
  type MerchantType,
} from '../entities/merchant'
import { useHexMapStore } from '../stores/hexMap'
import PanelSection from './PanelSection.vue'
import PopupDialog from './PopupDialog.vue'

const props = defineProps<{ caravanId: string }>()

const store = useHexMapStore()
const panels = useSubPanels()

const crew = computed(() => store.merchantsOf(props.caravanId))
const openId = computed(() => {
  const second = panels.stack.value[1]
  return second?.kind === 'merchant' ? second.id : null
})

const adding = ref(false)
const type = ref<MerchantType>(MERCHANT_TYPES[0])
const name = ref('')
const level = ref<number>(MERCHANT_LEVELS.min)

const add = (): void => {
  store.addMerchant(props.caravanId, type.value, name.value, clampLevel(level.value || 0))
  name.value = ''
  level.value = MERCHANT_LEVELS.min
  adding.value = false
}
</script>

<template>
  <PanelSection fold-key="caravan.merchants" title="merchants">
    <template #meta>{{ crew.length }}</template>
    <div class="merchants">
      <ul v-if="crew.length" class="list">
        <li v-for="merchant in crew" :key="merchant.id">
          <button
            type="button"
            class="merchant"
            :aria-current="openId === merchant.id ? 'true' : undefined"
            :title="`open ${merchant.name}`"
            @click="panels.open({ kind: 'merchant', id: merchant.id }, 1)"
          >
            <span aria-hidden="true">{{ MERCHANT_INFO[merchant.type].icon }}</span>
            <span class="name">
              {{ merchant.name }}
              <span v-if="merchant.name !== MERCHANT_INFO[merchant.type].label" class="label">
                {{ MERCHANT_INFO[merchant.type].label.toLowerCase() }}
              </span>
            </span>
            <span class="value">lv {{ merchant.level }}</span>
            <span class="label" aria-hidden="true">›</span>
          </button>
        </li>
      </ul>
      <p v-else class="label">no merchants in the crew</p>

      <template v-if="store.may('merchants')">
        <button type="button" class="open" @click="adding = true">add merchant</button>

        <PopupDialog v-model="adding" title="new merchant">
          <form class="add" @submit.prevent="add">
            <select v-model="type" aria-label="merchant type">
              <option v-for="one in MERCHANT_TYPES" :key="one" :value="one">
                {{ MERCHANT_INFO[one].icon }} {{ MERCHANT_INFO[one].label }}
              </option>
            </select>
            <p class="label">{{ MERCHANT_INFO[type].blurb }}</p>
            <input
              v-model="name"
              type="text"
              :placeholder="`name (${MERCHANT_INFO[type].label})`"
              aria-label="name"
            />
            <label class="row">
              <span class="label">level</span>
              <input
                v-model.number="level"
                type="number"
                :min="MERCHANT_LEVELS.min"
                :max="MERCHANT_LEVELS.max"
                step="1"
              />
            </label>
            <button type="submit">add merchant</button>
          </form>
        </PopupDialog>
      </template>
    </div>
  </PanelSection>
</template>

<style scoped>
.merchants {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.78rem;
}

.row {
  display: flex;
  align-items: center;
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

.list > li + li {
  margin-top: 0.2rem;
}

.merchant {
  display: grid;
  grid-template-columns: 1.1rem minmax(0, 1fr) auto 1rem;
  align-items: center;
  gap: 0.4rem;
  min-height: 2rem;
  padding: 0.1rem 0.25rem;
  border-color: transparent;
  background: none;
  text-align: left;
}

.merchant[aria-current='true'] {
  background: color-mix(in srgb, var(--line) 45%, transparent);
}

.name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.add {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  font-size: 0.78rem;
}

.add .row input {
  width: 4.5rem;
  text-align: right;
}

.open {
  margin-top: 0.3rem;
}

input,
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

input:focus,
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
</style>
