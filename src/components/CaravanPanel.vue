<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CARAVAN_PORTRAITS, caravanPortrait } from '../entities/portraits'
import { useHexMapStore } from '../stores/hexMap'
import CaravanMerchants from './CaravanMerchants.vue'
import CaravanSupplies from './CaravanSupplies.vue'
import InventoryList from './InventoryList.vue'
import PopupDialog from './PopupDialog.vue'

const store = useHexMapStore()

/** Matches the other panels' breakpoint, so all open collapsed on the same windows. */
const NARROW = 720

const narrow = (): boolean => window.innerWidth < NARROW

store.setPanelOpen('caravan', !narrow(), narrow())
const collapsed = computed(() => !store.panelsOpen.caravan)
const toggle = (): void => store.setPanelOpen('caravan', collapsed.value, narrow())

const caravan = computed(() => store.shownCaravan)
const riders = computed(() => (caravan.value ? store.ridersOf(caravan.value.id) : []))

const picking = ref(false)
const mayPick = computed(() => !!caravan.value && store.may('entitySettings', caravan.value))
const portrait = computed(() => caravanPortrait(caravan.value?.portrait))

const pick = (id: string | null): void => {
  if (caravan.value) store.setPortrait(caravan.value.id, id)
  picking.value = false
}

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
      <div v-if="mayPick" class="row portrait-row">
        <span class="label">portrait</span>
        <button
          type="button"
          class="portrait-choose"
          :title="`choose a portrait for ${caravan.name}`"
          @click="picking = true"
        >
          <img v-if="portrait" :src="portrait.url" alt="" class="thumb" />
          <span>{{ portrait?.label ?? 'none' }}</span>
        </button>
      </div>

      <CaravanSupplies :caravan-id="caravan.id" />

      <InventoryList :owner-id="caravan.id" />

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
              :title="
                store.may('order', rider)
                  ? `give ${rider.name} the orders`
                  : `look at ${rider.name}; it is not yours to order`
              "
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

      <CaravanMerchants :caravan-id="caravan.id" />
    </div>

    <PopupDialog v-if="mayPick" v-model="picking" :title="`${caravan.name}: portrait`">
      <ul class="portraits">
        <li>
          <button
            type="button"
            class="none"
            :class="{ here: !portrait }"
            :aria-pressed="!portrait"
            @click="pick(null)"
          >
            <span class="frame">none</span>
            <span class="label">no portrait</span>
          </button>
        </li>
        <li v-for="one in CARAVAN_PORTRAITS" :key="one.id">
          <button
            type="button"
            :class="{ here: one.id === portrait?.id }"
            :aria-pressed="one.id === portrait?.id"
            @click="pick(one.id)"
          >
            <img :src="one.url" alt="" class="frame" />
            <span class="label">{{ one.label }}</span>
          </button>
        </li>
      </ul>
    </PopupDialog>
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

.portrait-row {
  align-items: center;
  font-size: 0.78rem;
}

.portrait-choose {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.1rem 0.3rem;
  border: 1px solid var(--line);
  border-radius: 0.25rem;
  background: none;
  color: inherit;
  font: inherit;
  cursor: pointer;
}

.portrait-choose:hover {
  background: color-mix(in srgb, var(--line) 45%, transparent);
}

.thumb {
  width: 2rem;
  height: 1.5rem;
  border-radius: 0.15rem;
  object-fit: cover;
}

.portraits {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
  gap: 0.6rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.portraits button {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.3rem;
  border: 1px solid transparent;
  border-radius: 0.35rem;
  background: none;
  color: inherit;
  font: inherit;
  font-size: 0.78rem;
  cursor: pointer;
}

.portraits button:hover {
  background: color-mix(in srgb, var(--line) 45%, transparent);
}

.portraits button.here {
  border-color: var(--ink-dim);
  background: color-mix(in srgb, var(--line) 70%, transparent);
}

.portraits .frame {
  display: grid;
  width: 100%;
  aspect-ratio: 4 / 3;
  place-items: center;
  border-radius: 0.2rem;
  object-fit: cover;
}

.portraits .none .frame {
  border: 1px dashed var(--line);
  color: var(--ink-dim);
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

.pip {
  flex: none;
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
}
</style>
