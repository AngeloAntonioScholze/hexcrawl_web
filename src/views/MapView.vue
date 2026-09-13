<script setup lang="ts">
import { computed, ref } from 'vue'
import DayNightDial from '../components/DayNightDial.vue'
import HexCanvas from '../components/HexCanvas.vue'
import type { EntityKind } from '../entities/entity'
import {
  MAX_SIGHT,
  MIN_SIGHT,
  PACE_LIMITS,
  TERRAIN_LIMITS,
  WORLD_SIZES,
  useHexMapStore,
  type WorldSize,
} from '../stores/hexMap'
import { KM_PER_HEX } from '../terrain/travel'

const store = useHexMapStore()

/** Narrower than this and the panel would be most of the window. */
const NARROW = 720

// View state, not map state: collapsing the panel hands the map back the room
// and the pointer, which a scroll container has to hold on to while it is open.
// A small window opens collapsed, so a phone gets the map first.
const collapsed = ref(window.innerWidth < NARROW)

const onSight = (event: Event): void => {
  store.setSight(Number((event.target as HTMLInputElement).value))
}

const onPace = (event: Event): void => {
  store.setPace(store.selectedId, Number((event.target as HTMLInputElement).value))
}

const onTerrain = (key: 'scale' | 'seaLevel' | 'relief', event: Event): void => {
  store.setTerrain({ [key]: Number((event.target as HTMLInputElement).value) })
}

const addKind = ref<EntityKind>('caravan')

const worldSizes = Object.keys(WORLD_SIZES) as WorldSize[]

const hint = computed(() => {
  if (!store.start) return 'click a hex to put the entity there'
  if (!store.goal) return 'click a hex to give it a route'
  return 'press the arrow on the dial: it walks as the turns pass'
})

const straightLine = computed(() => (store.route ? `${store.route.steps * KM_PER_HEX} km` : '—'))

/** A long crawl would otherwise hang hundreds of rows off the panel. */
const TURNS_SHOWN = 40

// Newest first: the last turn is the one anybody is looking for.
const recentTurns = computed(() => {
  const from = Math.max(0, store.journey.length - TURNS_SHOWN)
  return store.journey.slice(from).reverse()
})

const olderTurns = computed(() => Math.max(0, store.journey.length - TURNS_SHOWN))
</script>

<template>
  <main>
    <HexCanvas />
    <DayNightDial />
    <aside :class="{ collapsed }">
      <header>
        <h1>hexcrawl</h1>
        <button
          type="button"
          class="toggle"
          :aria-expanded="!collapsed"
          :aria-label="collapsed ? 'open the panel' : 'collapse the panel'"
          @click="collapsed = !collapsed"
        >
          <span aria-hidden="true">▾</span>
        </button>
      </header>

      <div v-show="!collapsed" class="body">
        <dl>
          <dt>turn</dt>
          <dd>
            {{ store.turn }}
            <span class="dim">{{ store.clock.phase }} {{ store.clock.index + 1 }}/4</span>
          </dd>

          <dt>hover</dt>
          <dd>
            {{ store.hovered ?? '—' }}
            <span v-if="store.hoveredTile" class="dim">
              {{ store.hoveredTile.terrain }} · lv {{ store.hoveredTile.level }}
            </span>
          </dd>

          <dt>standing</dt>
          <dd>{{ store.start ?? '—' }}</dd>

          <dt>headed</dt>
          <dd>{{ store.goal ?? '—' }}</dd>
        </dl>

        <div class="control stack">
          <div class="row">
            <span>entities</span>
            <span class="value">{{ store.entities.length }}</span>
          </div>

          <ul class="entities">
            <li v-for="one in store.entities" :key="one.id">
              <button
                type="button"
                :class="{ here: one.id === store.selectedId }"
                :title="`give ${one.name} the orders`"
                @click="store.selectEntity(one.id)"
              >
                <span class="pip" :style="{ background: one.color }" />
                <span>{{ one.name }}</span>
                <span class="dim">{{ one.kind }}</span>
                <span class="value">{{ one.pacePerTurn }}/turn</span>
              </button>
            </li>
          </ul>

          <div class="row">
            <select v-model="addKind">
              <option value="party">party</option>
              <option value="caravan">caravan</option>
              <option value="npc">npc</option>
            </select>
            <button type="button" @click="store.addEntity(undefined, addKind, 'player')">
              add
            </button>
          </div>
          <button
            type="button"
            :disabled="!store.selectedEntity"
            @click="store.removeEntity(store.selectedId)"
          >
            {{ store.selectedEntity ? `remove ${store.selectedEntity.name}` : 'nobody on the map' }}
          </button>
        </div>

        <dl v-if="store.route" class="route">
          <dt>hexes left</dt>
          <dd>{{ store.plannedHexes.length }}</dd>

          <dt>travel</dt>
          <dd>{{ store.route.km }} km</dd>

          <dt>flat</dt>
          <dd class="dim">{{ straightLine }}</dd>
        </dl>

        <label class="control">
          <input v-model="store.allowWater" type="checkbox" />
          <span>allow water crossings</span>
        </label>

        <div v-if="store.selectedEntity" class="control stack">
          <div class="row">
            <span>pace</span>
            <span class="value">{{ store.selectedEntity.pacePerTurn }} hex a turn</span>
          </div>
          <input
            :value="store.selectedEntity.pacePerTurn"
            type="range"
            :min="PACE_LIMITS.min"
            :max="PACE_LIMITS.max"
            :step="PACE_LIMITS.step"
            @input="onPace"
          />
          <button type="button" :disabled="!store.goal" @click="store.clear">
            call off the order
          </button>
          <button
            type="button"
            :disabled="!store.start"
            @click="store.queueAction(store.selectedId, { kind: 'camp' })"
          >
            make camp this turn
          </button>
        </div>

        <label class="control">
          <input v-model="store.fog" type="checkbox" />
          <span>fog of war</span>
        </label>

        <label class="control">
          <input v-model="store.showSight" type="checkbox" />
          <span>show the sight field</span>
        </label>

        <label class="control">
          <input v-model="store.showHistory" type="checkbox" />
          <span>show full path history</span>
        </label>

        <label class="control">
          <input v-model="store.showAllPaths" type="checkbox" />
          <span>show all entities paths</span>
        </label>

        <label class="control">
          <input v-model="store.dmView" type="checkbox" />
          <span>see what the DM sees</span>
        </label>

        <div v-if="store.fog || store.showSight" class="control stack">
          <div class="row">
            <span>sight by daylight</span>
            <span class="value">{{ store.sight }}</span>
          </div>
          <input
            :value="store.sight"
            type="range"
            :min="MIN_SIGHT"
            :max="MAX_SIGHT"
            step="1"
            @input="onSight"
          />
          <div class="row">
            <span>seeing</span>
            <span class="value">{{ store.reach }} hex</span>
          </div>
          <div v-if="store.fog" class="row">
            <span>explored</span>
            <span class="value">{{ store.explored.size }}</span>
          </div>
        </div>

        <div class="control stack">
          <div class="row">
            <span>seed</span>
            <span class="value">{{ store.terrain.seed }}</span>
          </div>
          <button type="button" @click="store.reseed">roll a new world</button>

          <div class="row">
            <span>world size</span>
            <span class="value">{{ store.worldRadius }} hex</span>
          </div>
          <div class="sizes">
            <button
              v-for="size in worldSizes"
              :key="size"
              type="button"
              :class="{ here: store.worldSize === size }"
              @click="store.setWorldSize(size)"
            >
              {{ size }}
            </button>
          </div>

          <div class="row">
            <span>landmass size</span>
            <span class="value">{{ store.terrain.scale }}</span>
          </div>
          <input
            :value="store.terrain.scale"
            type="range"
            :min="TERRAIN_LIMITS.scale.min"
            :max="TERRAIN_LIMITS.scale.max"
            :step="TERRAIN_LIMITS.scale.step"
            @input="onTerrain('scale', $event)"
          />

          <div class="row">
            <span>sea level</span>
            <span class="value">{{ store.terrain.seaLevel.toFixed(2) }}</span>
          </div>
          <input
            :value="store.terrain.seaLevel"
            type="range"
            :min="TERRAIN_LIMITS.seaLevel.min"
            :max="TERRAIN_LIMITS.seaLevel.max"
            :step="TERRAIN_LIMITS.seaLevel.step"
            @input="onTerrain('seaLevel', $event)"
          />

          <div class="row">
            <span>relief</span>
            <span class="value">{{ store.terrain.relief.toFixed(1) }}</span>
          </div>
          <input
            :value="store.terrain.relief"
            type="range"
            :min="TERRAIN_LIMITS.relief.min"
            :max="TERRAIN_LIMITS.relief.max"
            :step="TERRAIN_LIMITS.relief.step"
            @input="onTerrain('relief', $event)"
          />
        </div>

        <div v-if="store.journey.length" class="control stack">
          <div class="row">
            <span>adventure log</span>
            <span class="value">{{ store.travelledKm }} km</span>
          </div>
          <div class="row">
            <span>hexes walked</span>
            <span class="value">{{ store.hexesWalked }}</span>
          </div>

          <ol class="journey">
            <li v-for="row in recentTurns" :key="row.turn">
              <button
                type="button"
                :class="{ here: row.turn === store.turn - 1, ahead: !row.spent }"
                :title="`put the crawl back as it stood at the end of turn ${row.turn}`"
                @click="store.goToTurn(row.turn + 1)"
              >
                <span class="dim">{{ row.turn }}</span>
                <span>{{ row.hex }}</span>
                <span class="dim">{{ row.terrain }}</span>
                <span class="value">{{ row.entered === 0 ? row.kind : `${row.entered} hex` }}</span>
              </button>
            </li>
          </ol>
          <p v-if="olderTurns" class="dim">and {{ olderTurns }} earlier</p>

          <button type="button" @click="store.clearHistory">clear the history</button>
        </div>

        <p>{{ hint }}</p>
        <p class="dim">drag to pan · wheel to zoom · Q / E to rotate</p>
      </div>
    </aside>
  </main>
</template>

<style scoped>
main {
  position: relative;
  height: 100%;
  overflow: hidden;
  touch-action: none;
}

/* The panel outgrew the viewport once the terrain knobs landed. It scrolls
   inside itself rather than taking the page with it, which costs the drag-through
   it used to have: a scroll container has to receive the pointer. */
aside {
  position: absolute;
  top: 1rem;
  left: 1rem;
  max-height: calc(100% - 2rem);
  min-width: 13rem;
  max-width: min(17rem, calc(100vw - 2rem));
  padding: 0.75rem 1rem;
  border: 1px solid var(--line);
  border-radius: 0.5rem;
  background: color-mix(in srgb, var(--surface-raised) 88%, transparent);
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--line) transparent;
}

.journey {
  max-height: 11rem;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  list-style: none;
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

.journey li button:hover {
  background: color-mix(in srgb, var(--line) 45%, transparent);
}

.entities {
  margin: 0;
  padding: 0;
  list-style: none;
}

.entities li button {
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

.entities li button:hover {
  background: color-mix(in srgb, var(--line) 45%, transparent);
}

.entities li button.here {
  background: color-mix(in srgb, var(--line) 70%, transparent);
}

.sizes {
  display: flex;
  gap: 0.3rem;
}

.sizes button.here {
  border-color: #7aa2c8;
  color: var(--ink);
}

.pip {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
}

select {
  flex: 1;
  padding: 0.3rem;
  border: 1px solid var(--line);
  border-radius: 0.35rem;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-size: 0.78rem;
}

/* The turn the crawl stands on, so a rewound record still reads. */
.journey li button.here {
  background: color-mix(in srgb, var(--line) 70%, transparent);
}

/* Turns the crawl has been wound back past: still recorded, not yet lived. */
.journey li button.ahead {
  color: var(--ink-dim);
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1.5rem;
}

h1 {
  margin: 0;
  font-size: 0.9rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.body {
  margin-top: 0.5rem;
}

/* Collapsed the panel is one row: no scroller, no width to speak of, and the
   map gets the pointer everywhere the row is not. */
aside.collapsed {
  min-width: 0;
  max-height: none;
  overflow: visible;
}

.toggle {
  width: auto;
  padding: 0.1rem 0.35rem;
  border: none;
  background: none;
  color: var(--ink-dim);
  font-size: 1.7rem;
  line-height: 1;
}

.toggle:hover {
  color: var(--ink);
}

.toggle span {
  display: block;
  transition: transform 150ms ease;
}

aside.collapsed .toggle span {
  transform: rotate(-90deg);
}

dl {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.15rem 0.75rem;
  margin: 0;
  font-size: 0.8rem;
}

dl.route {
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--line);
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

p {
  margin: 0.6rem 0 0;
  font-size: 0.75rem;
}

.control {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin-top: 0.75rem;
  padding-top: 0.6rem;
  border-top: 1px solid var(--line);
  font-size: 0.78rem;
  cursor: pointer;
  user-select: none;
}

.control input {
  margin: 0;
  accent-color: #7aa2c8;
  cursor: pointer;
}

.control.stack {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.4rem;
}

.control.stack .row {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}

.control.stack .value {
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}

.control.stack span {
  color: var(--ink-dim);
}

.control.stack input[type='range'] {
  width: 100%;
  margin: 0.1rem 0;
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

/* Room is the scarce thing on a phone: the panel gives the map its corner back
   and the dial shrinks rather than straddling the whole width. */
@media (max-width: 720px) {
  aside {
    top: 0.5rem;
    left: 0.5rem;
    max-height: calc(100% - 7rem);
  }
}
</style>
