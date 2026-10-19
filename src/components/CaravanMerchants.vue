<script setup lang="ts">
import { computed, ref } from 'vue'
import { usePlayerView } from '../composables/usePlayerView'
import { unlockedServices } from '../entities/catalog'
import {
  clampLevel,
  MERCHANT_INFO,
  MERCHANT_LEVELS,
  MERCHANT_TYPES,
  type Merchant,
  type MerchantType,
} from '../entities/merchant'
import { useHexMapStore } from '../stores/hexMap'
import PopupDialog from './PopupDialog.vue'

const props = defineProps<{ caravanId: string }>()

const store = useHexMapStore()
// The players read what they see from their projection, as their map does.
const player = usePlayerView()
const forPlayers = computed(() => !store.dmView)

const crew = computed(() =>
  (forPlayers.value ? player.merchantsOf(props.caravanId) : store.merchantsOf(props.caravanId)).map(
    (merchant) => ({
      merchant,
      info: MERCHANT_INFO[merchant.type],
      offers: unlockedServices(
        merchant.type,
        merchant.level,
        forPlayers.value ? player.catalog.value : store.catalog,
      ),
    }),
  ),
)

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

const step = (merchant: Merchant, by: number): void =>
  store.setMerchantLevel(merchant.id, merchant.level + by)
</script>

<template>
  <section class="merchants" aria-label="merchants">
    <div class="row">
      <span class="label">merchants</span>
      <span class="value">{{ crew.length }}</span>
    </div>

    <ul v-if="crew.length" class="list">
      <li v-for="{ merchant, info, offers } in crew" :key="merchant.id">
        <div class="merchant">
          <span aria-hidden="true">{{ info.icon }}</span>
          <span class="name" :title="info.blurb">
            {{ merchant.name }}
            <span v-if="merchant.name !== info.label" class="label">
              {{ info.label.toLowerCase() }}
            </span>
          </span>
          <span v-if="store.may('merchants')" class="stepper">
            <button
              type="button"
              :disabled="merchant.level <= MERCHANT_LEVELS.min"
              :aria-label="`lower ${merchant.name}'s level`"
              @click="step(merchant, -1)"
            >
              −
            </button>
            <span class="value">lv {{ merchant.level }}</span>
            <button
              type="button"
              :disabled="merchant.level >= MERCHANT_LEVELS.max"
              :aria-label="`raise ${merchant.name}'s level`"
              @click="step(merchant, 1)"
            >
              +
            </button>
            <button
              type="button"
              class="drop"
              :aria-label="`let ${merchant.name} go`"
              title="remove"
              @click="store.removeMerchant(merchant.id)"
            >
              ×
            </button>
          </span>
          <span v-else class="value">lv {{ merchant.level }}</span>
        </div>
        <ul v-if="offers.length" class="offers" :aria-label="`what ${merchant.name} offers`">
          <li v-for="entry in offers" :key="entry.id" :title="entry.description">
            <span class="offer">{{ entry.name }}</span>
            <span class="label">{{ entry.price }}</span>
          </li>
        </ul>
        <p v-else class="label offers">nothing offered yet</p>
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
  </section>
</template>

<style scoped>
.merchants {
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

.list,
.offers {
  margin: 0;
  padding: 0;
  list-style: none;
}

.list > li + li {
  margin-top: 0.35rem;
}

.merchant {
  display: grid;
  grid-template-columns: 1.1rem minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.4rem;
  padding: 0.1rem 0.25rem;
}

.name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.offers {
  padding-left: 1.75rem;
  font-size: 0.72rem;
}

.offers li {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
}

.offer {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.stepper {
  display: flex;
  align-items: center;
  gap: 0.25rem;
}

.stepper button {
  width: 1.3rem;
  padding: 0;
  line-height: 1.2;
}

.stepper .value {
  min-width: 2.4rem;
  text-align: center;
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

button:disabled {
  color: var(--ink-dim);
  cursor: default;
}

button.drop {
  width: auto;
  padding: 0 0.15rem;
  border: none;
  background: none;
  color: var(--ink-dim);
}

button.drop:hover {
  color: var(--ink);
}
</style>
