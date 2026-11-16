<script setup lang="ts">
import { computed, ref } from 'vue'
import { useSubPanels } from '../composables/useSubPanels'
import { bustOf } from '../entities/busts'
import type { Entity } from '../entities/entity'
import { carriesInventory } from '../entities/inventory'
import { MAX_SIGHT, MIN_SIGHT, PACE_LIMITS, useHexMapStore } from '../stores/hexMap'
import { KM_PER_HEX } from '../terrain/travel'
import BustPicker from './BustPicker.vue'
import CaravanMerchants from './CaravanMerchants.vue'
import CaravanSupplies from './CaravanSupplies.vue'
import EntityDmControls from './EntityDmControls.vue'
import InventoryList from './InventoryList.vue'
import PanelSection from './PanelSection.vue'
import SubPanelFrame from './SubPanelFrame.vue'

const props = defineProps<{
  entity: Entity
  level: 1 | 2
  parentName: string
  parentInView: boolean
}>()

const store = useHexMapStore()
const panels = useSubPanels()

// The open entity, not the selection: a rider picked from here is selected
// while its carrier stays open, so nothing below reads store.selectedId.
const id = computed(() => props.entity.id)
const scope = computed(() => `l${props.level}`)

/** Fold keys group by kind, so folding one party's log folds every party's. */
const group = computed(() =>
  props.entity.kind === 'party' || props.entity.kind === 'npc' ? 'person' : props.entity.kind,
)
const isCaravan = computed(() => props.entity.kind === 'caravan')
const carries = computed(() => props.entity.kind === 'caravan' || props.entity.kind === 'ship')

const onRename = (event: Event): void => {
  const input = event.target as HTMLInputElement
  store.renameEntity(id.value, input.value)
  // A blank name is refused; the field goes back to the name the entity kept.
  input.value = store.entities.find((one) => one.id === id.value)?.name ?? ''
}

const onRecolor = (event: Event): void => {
  store.recolorEntity(id.value, (event.target as HTMLInputElement).value)
}

const onPace = (event: Event): void => {
  store.setPace(id.value, Number((event.target as HTMLInputElement).value))
}

const onSight = (event: Event): void => {
  store.setEntitySight(id.value, Number((event.target as HTMLInputElement).value))
}

const onDarkvision = (event: Event): void => {
  store.setDarkvision(id.value, (event.target as HTMLInputElement).checked)
}

const riders = computed(() => (carries.value ? store.ridersOf(id.value) : []))

// Only a level-1 carrier opens its riders: there is no third level.
const openRider = (riderId: string): void => {
  store.selectEntity(riderId)
  if (props.level === 1) panels.open({ kind: 'entity', id: riderId }, 1)
}

const riderOpen = (riderId: string): boolean => {
  const deeper = panels.stack.value[props.level]
  return props.level === 1 && deeper?.kind === 'entity' && deeper.id === riderId
}

// Until tdj.4 mounts the card, the caravan's bust is picked here.
const picking = ref(false)
const mayPick = computed(() => isCaravan.value && store.may('entitySettings', props.entity))
const bust = computed(() => bustOf(props.entity.portrait))
const pick = (portrait: string | null): void => store.setPortrait(id.value, portrait)

/** A long crawl would otherwise hang hundreds of rows off the panel. */
const TURNS_SHOWN = 40

const adventureLog = computed(() => store.adventureLogFor(id.value))
const hexesWalked = computed(() => store.hexesWalkedFor(id.value))

// Newest first: the last turn is the one anybody is looking for.
const recentTurns = computed(() => {
  const from = Math.max(0, adventureLog.value.length - TURNS_SHOWN)
  return adventureLog.value.slice(from).reverse()
})

const olderTurns = computed(() => Math.max(0, adventureLog.value.length - TURNS_SHOWN))
</script>

<template>
  <SubPanelFrame
    :level="level"
    :name="entity.name"
    :parent-name="parentName"
    :parent-in-view="parentInView"
  >
    <template #lead>
      <span class="pip" :style="{ background: entity.color }" aria-hidden="true" />
    </template>

    <template v-if="mayPick" #card>
      <div class="row bust-row">
        <span class="label">bust</span>
        <button
          type="button"
          class="bust-choose"
          :title="`choose a bust for ${entity.name}`"
          @click="picking = true"
        >
          <img v-if="bust" :src="bust.url" alt="" class="thumb" />
          <span>{{ bust?.label ?? 'none' }}</span>
        </button>
      </div>
      <BustPicker
        v-model:open="picking"
        :name="entity.name"
        :current="entity.portrait"
        @pick="pick"
      />
    </template>

    <PanelSection :fold-key="`${group}.details`" title="details" :scope="scope">
      <template #meta>{{ entity.kind }}</template>
      <div class="control stack">
        <label v-if="store.may('renameEntity', entity)" class="row naming">
          <span>name</span>
          <input
            class="name"
            type="text"
            maxlength="40"
            :value="entity.name"
            aria-label="the entity's name"
            @change="onRename"
          />
        </label>
        <label v-if="store.may('recolorEntity', entity)" class="row naming">
          <span>colour</span>
          <input
            type="color"
            :value="entity.color"
            aria-label="the entity's colour"
            @input="onRecolor"
          />
        </label>
        <div class="row">
          <span>pace</span>
          <span class="value">{{ entity.pacePerTurn }} hex a turn</span>
        </div>
        <input
          v-if="store.may('entitySettings', entity)"
          :value="entity.pacePerTurn"
          type="range"
          :min="PACE_LIMITS.min"
          :max="PACE_LIMITS.max"
          :step="PACE_LIMITS.step"
          aria-label="pace"
          @input="onPace"
        />
        <div class="row">
          <span>sight by daylight</span>
          <span class="value">{{ entity.sight }} hex</span>
        </div>
        <input
          v-if="store.may('entitySettings', entity)"
          :value="entity.sight"
          type="range"
          :min="MIN_SIGHT"
          :max="MAX_SIGHT"
          step="1"
          aria-label="sight by daylight"
          @input="onSight"
        />
        <label v-if="store.may('entitySettings', entity)" class="row naming">
          <span>darkvision</span>
          <input
            type="checkbox"
            :checked="entity.darkvision"
            aria-label="sees as far by night as by day"
            @change="onDarkvision"
          />
        </label>
        <EntityDmControls v-if="store.may('assignEntity')" :entity="entity" />
      </div>
    </PanelSection>

    <CaravanSupplies v-if="isCaravan" :caravan-id="entity.id" />

    <InventoryList
      v-if="carriesInventory(entity.kind)"
      :owner-id="entity.id"
      :fold-key="`${group}.inventory`"
    />

    <PanelSection v-if="carries" :fold-key="`${group}.riders`" title="riders" :scope="scope">
      <template #meta>{{ riders.length }}</template>
      <ul v-if="riders.length" class="riders">
        <li v-for="rider in riders" :key="rider.id">
          <button
            type="button"
            :class="{ here: rider.id === store.selectedId }"
            :aria-current="riderOpen(rider.id) ? 'true' : undefined"
            :title="level === 1 ? `open ${rider.name}` : `select ${rider.name}`"
            @click="openRider(rider.id)"
          >
            <span class="pip" :style="{ background: rider.color }" aria-hidden="true" />
            <span class="name">{{ rider.name }}</span>
            <span class="dim">{{ rider.kind }}</span>
            <span v-if="level === 1" class="chevron" aria-hidden="true">›</span>
          </button>
        </li>
      </ul>
      <p v-else class="dim">nobody aboard</p>
    </PanelSection>

    <!-- ped.26 swaps in MerchantRows for the DM here. -->
    <CaravanMerchants v-if="isCaravan" :caravan-id="entity.id" />

    <PanelSection
      v-if="adventureLog.length"
      :fold-key="`${group}.log`"
      title="adventure log"
      :scope="scope"
    >
      <template #meta>{{ hexesWalked * KM_PER_HEX }} km</template>
      <div class="control stack">
        <div class="row">
          <span>hexes walked</span>
          <span class="value">{{ hexesWalked }}</span>
        </div>

        <ol class="journey">
          <li
            v-for="entry in recentTurns"
            :key="entry.kind === 'turn' ? `turn:${entry.row.turn}` : entry.encounter.id"
          >
            <button
              v-if="entry.kind === 'turn'"
              type="button"
              :class="{ here: entry.row.turn === store.turn - 1, ahead: !entry.row.spent }"
              :disabled="!store.may('clock')"
              :title="
                store.may('clock')
                  ? `put the crawl back as it stood at the end of turn ${entry.row.turn}`
                  : undefined
              "
              @click="store.goToTurn(entry.row.turn + 1)"
            >
              <span class="dim">{{ entry.row.turn }}</span>
              <span>{{ entry.row.hex }}</span>
              <span class="dim">{{ entry.row.terrain }}</span>
              <span class="value">{{
                entry.row.entered === 0 ? entry.row.kind : `${entry.row.entered} hex`
              }}</span>
            </button>
            <button
              v-else
              type="button"
              class="met"
              :class="{
                here: entry.encounter.turn === store.turn,
                ahead: entry.encounter.turn > store.turn,
              }"
              :disabled="!store.may('clock')"
              :title="
                store.may('clock')
                  ? `put the crawl back to turn ${entry.encounter.turn}, when this was met`
                  : undefined
              "
              @click="store.goToTurn(entry.encounter.turn)"
            >
              <span class="dim">!</span>
              <span class="encounter">{{ entry.encounter.title }}</span>
              <span class="dim">{{ entry.encounter.hex }}</span>
            </button>
          </li>
        </ol>
        <p v-if="olderTurns" class="dim">and {{ olderTurns }} earlier</p>

        <button
          v-if="store.may('clearHistory')"
          type="button"
          class="plain"
          @click="store.clearHistory"
        >
          clear the history
        </button>
      </div>
    </PanelSection>
  </SubPanelFrame>
</template>

<style scoped>
.pip {
  flex: none;
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
}

p {
  margin: 0.6rem 0 0;
  font-size: 0.75rem;
}

.dim,
.label {
  color: var(--ink-dim);
}

.row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.bust-row {
  align-items: center;
  margin-top: 0.5rem;
  font-size: 0.78rem;
}

.bust-choose {
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

.bust-choose:hover {
  background: color-mix(in srgb, var(--line) 45%, transparent);
}

.thumb {
  width: 2rem;
  height: 1.5rem;
  border-radius: 0.15rem;
  object-fit: cover;
}

.control.stack {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.4rem;
  font-size: 0.78rem;
}

.control.stack span {
  color: var(--ink-dim);
}

.control.stack .value {
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}

.row.naming {
  align-items: center;
}

.control input {
  margin: 0;
  accent-color: #7aa2c8;
  cursor: pointer;
}

.control input.name {
  flex: 1;
  min-width: 0;
  padding: 0.25rem 0.45rem;
  border: 1px solid var(--line);
  border-radius: 0.35rem;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  cursor: text;
}

.control input.name:focus {
  border-color: #7aa2c8;
  outline: none;
}

.control input[type='range'] {
  width: 100%;
  margin: 0.1rem 0;
}

.riders,
.journey {
  margin: 0;
  padding: 0;
  list-style: none;
}

.riders {
  font-size: 0.78rem;
}

.riders button {
  display: grid;
  width: 100%;
  grid-template-columns: 0.6rem 1fr auto auto;
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

.riders .name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.riders .chevron {
  width: 1rem;
  color: var(--ink-dim);
  font-size: 1.1rem;
  line-height: 1;
  text-align: center;
}

.riders button:hover {
  background: color-mix(in srgb, var(--line) 45%, transparent);
}

.riders button:hover .chevron {
  color: var(--ink);
}

.riders button.here {
  background: color-mix(in srgb, var(--line) 70%, transparent);
}

.riders button:focus-visible,
.journey button:focus-visible,
.plain:focus-visible {
  outline: 2px solid #7aa2c8;
  outline-offset: -2px;
}

.journey {
  max-height: 11rem;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.journey li button {
  display: grid;
  width: 100%;
  grid-template-columns: 1.75rem 1fr auto auto;
  gap: 0.4rem;
  padding: 0.1rem 0.25rem;
  border: none;
  border-radius: 0.2rem;
  background: none;
  color: inherit;
  font: inherit;
  font-variant-numeric: tabular-nums;
  text-align: left;
  cursor: pointer;
}

.journey li button.met {
  grid-template-columns: 1.75rem 1fr auto;
  font-style: italic;
}

.journey .encounter {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.journey li button:hover:not(:disabled) {
  background: color-mix(in srgb, var(--line) 45%, transparent);
}

/* Read-only for whoever may not wind the clock: a record, not a control. */
.journey li button:disabled {
  color: inherit;
  cursor: default;
}

/* The turn the crawl stands on, so a rewound record still reads. */
.journey li button.here {
  background: color-mix(in srgb, var(--line) 70%, transparent);
}

/* Turns the crawl has been wound back past: still recorded, not yet lived. */
.journey li button.ahead {
  color: var(--ink-dim);
}

.plain {
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

.plain:hover {
  border-color: #7aa2c8;
}
</style>
