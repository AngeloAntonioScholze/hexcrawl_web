<script setup lang="ts">
import { computed, ref } from 'vue'
import { orderOf, usePlayerView } from '../composables/usePlayerView'
import { CARAVAN_PORTRAITS, caravanPortrait } from '../entities/portraits'
import { useHexMapStore } from '../stores/hexMap'
import CaravanMerchants from './CaravanMerchants.vue'
import CaravanSupplies from './CaravanSupplies.vue'
import InventoryList from './InventoryList.vue'
import PanelSection from './PanelSection.vue'
import PopupDialog from './PopupDialog.vue'

const store = useHexMapStore()
// The players read what they see from their projection, as their map does.
const player = usePlayerView()
const forPlayers = computed(() => !store.dmView)

// It never opens itself: that would fold away the entities list the caravan was
// just picked from. The players' panel is always there and swaps what it shows.
const collapsed = computed(() => !store.panelsOpen.caravan)
const toggle = (): void => store.setPanelOpen('caravan', collapsed.value)

const caravan = computed(() => (forPlayers.value ? player.infoCaravan.value : store.shownCaravan))
const riders = computed(() => {
  if (!caravan.value) return []
  return forPlayers.value ? player.ridersOf(caravan.value.id) : store.ridersOf(caravan.value.id)
})

const standing = computed(() =>
  caravan.value ? (player.scene.value.states.get(caravan.value.id)?.at ?? null) : null,
)
const headed = computed(() => {
  if (!caravan.value) return null
  const ahead = orderOf(player.scene.value, caravan.value.id)
  return ahead[ahead.length - 1] ?? null
})

const picking = ref(false)
const mayPick = computed(
  () => !forPlayers.value && !!caravan.value && store.may('entitySettings', caravan.value),
)
const portrait = computed(() => caravanPortrait(caravan.value?.portrait))

const pick = (id: string | null): void => {
  if (caravan.value) store.setPortrait(caravan.value.id, id)
  picking.value = false
}
</script>

<template>
  <aside v-if="forPlayers || caravan" class="panel caravan" :class="{ collapsed }">
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
        <dl v-if="forPlayers" class="summary">
          <dt>standing</dt>
          <dd>{{ standing ?? '—' }}</dd>

          <dt>headed</dt>
          <dd>{{ headed ?? '—' }}</dd>

          <dt>pace</dt>
          <dd>{{ caravan.pacePerTurn }} hex a turn</dd>
        </dl>

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

        <InventoryList :owner-id="caravan.id" fold-key="caravan.inventory" />

        <PanelSection fold-key="caravan.riders" title="riders">
          <template #meta>{{ riders.length }}</template>
          <div class="section">
            <ul v-if="riders.length" class="list">
              <li v-for="rider in riders" :key="rider.id">
                <div v-if="forPlayers && !store.may('order', rider)" class="rider">
                  <span class="pip" :style="{ background: rider.color }" />
                  <span class="name">{{ rider.name }}</span>
                  <span class="label">{{ rider.kind }}</span>
                </div>
                <button
                  v-else
                  type="button"
                  :class="{ here: rider.id === store.selectedId }"
                  :aria-current="forPlayers && rider.id === store.selectedId ? 'true' : undefined"
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
          </div>
        </PanelSection>

        <CaravanMerchants :caravan-id="caravan.id" />
      </template>
    </div>

    <PopupDialog v-if="caravan && mayPick" v-model="picking" :title="`${caravan.name}: portrait`">
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
