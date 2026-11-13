<script setup lang="ts">
import { computed, ref } from 'vue'
import { usePlayerView } from '../composables/usePlayerView'
import { CARAVAN_PORTRAITS, caravanPortrait } from '../entities/portraits'
import { useHexMapStore } from '../stores/hexMap'
import CaravanMerchants from './CaravanMerchants.vue'
import CaravanSupplies from './CaravanSupplies.vue'
import InventoryList from './InventoryList.vue'
import PopupDialog from './PopupDialog.vue'

const store = useHexMapStore()
// The players read what they see from their projection, as their map does.
const player = usePlayerView()
const forPlayers = computed(() => !store.dmView)

// Mounted again for every caravan picked, so it never opens itself: that would
// fold away the entities list the caravan was just picked from.
const collapsed = computed(() => !store.panelsOpen.caravan)
const toggle = (): void => store.setPanelOpen('caravan', collapsed.value)

const caravan = computed(() => (forPlayers.value ? player.shownCaravan.value : store.shownCaravan))
const riders = computed(() => {
  if (!caravan.value) return []
  return forPlayers.value ? player.ridersOf(caravan.value.id) : store.ridersOf(caravan.value.id)
})

const picking = ref(false)
const mayPick = computed(() => !!caravan.value && store.may('entitySettings', caravan.value))
const portrait = computed(() => caravanPortrait(caravan.value?.portrait))

const pick = (id: string | null): void => {
  if (caravan.value) store.setPortrait(caravan.value.id, id)
  picking.value = false
}
</script>

<template>
  <aside v-if="caravan" class="panel caravan" :class="{ collapsed }">
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
          <span class="label-row">
            <span class="pip" :style="{ background: caravan.color }" />
            <span class="name">{{ caravan.name }}</span>
          </span>
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
