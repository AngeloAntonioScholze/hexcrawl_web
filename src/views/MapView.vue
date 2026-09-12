<script setup lang="ts">
import { computed, ref } from 'vue'
import HexCanvas from '../components/HexCanvas.vue'
import { MAX_SIGHT, MIN_SIGHT, TERRAIN_LIMITS, useHexMapStore } from '../stores/hexMap'
import { KM_PER_HEX } from '../terrain/travel'

const store = useHexMapStore()

// View state, not map state: collapsing the panel hands the map back the room
// and the pointer, which a scroll container has to hold on to while it is open.
const collapsed = ref(false)

const speedLabel = computed(() => (store.isAuto ? 'auto' : `${store.speed}x`))

const playLabel = computed(() => {
  if (store.playing) return 'stop'
  return store.finished ? 'replay' : 'start'
})

const onSpeed = (event: Event): void => {
  store.setSpeed(Number((event.target as HTMLInputElement).value))
}

const onPlay = (): void => {
  if (store.playing) store.stop()
  else store.play()
}

const onSight = (event: Event): void => {
  store.setSight(Number((event.target as HTMLInputElement).value))
}

const onTerrain = (key: 'scale' | 'seaLevel' | 'relief', event: Event): void => {
  store.setTerrain({ [key]: Number((event.target as HTMLInputElement).value) })
}

const hint = computed(() => {
  if (!store.start) return 'click a hex to put the party there'
  if (!store.goal) {
    return store.isAuto ? 'click a hex to send the party there' : 'click a hex to plan the next leg'
  }
  if (store.route) return 'press start: the party arrives at the end of the walk'
  return store.allowWater ? 'no route found' : 'no land route — try allowing water'
})

const straightLine = computed(() => (store.route ? `${store.route.steps * KM_PER_HEX} km` : '—'))

/** A long crawl would otherwise hang thousands of rows off the panel. */
const JOURNEY_SHOWN = 40

// Newest first: the party's last step is the one anybody is looking for.
const recentJourney = computed(() => {
  const from = Math.max(0, store.journey.length - JOURNEY_SHOWN)
  return store.journey
    .slice(from)
    .map((step, index) => ({ ...step, at: from + index }))
    .reverse()
})

const olderSteps = computed(() => Math.max(0, store.journey.length - JOURNEY_SHOWN))

// A party that has not been recalled back down the log stands at its head.
const standingAt = computed(() => store.selectedTraveler.standing ?? store.journey.length - 1)
</script>

<template>
  <main>
    <HexCanvas />
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
          <dt>hover</dt>
          <dd>
            {{ store.hovered ?? '—' }}
            <span v-if="store.hoveredTile" class="dim">
              {{ store.hoveredTile.terrain }} · lv {{ store.hoveredTile.level }}
            </span>
          </dd>

          <dt>start</dt>
          <dd>{{ store.start ?? '—' }}</dd>

          <dt>end</dt>
          <dd>{{ store.goal ?? '—' }}</dd>
        </dl>

        <dl v-if="store.route" class="route">
          <dt>hexes</dt>
          <dd>
            <template v-if="store.isAuto">{{ store.route.steps }}</template>
            <template v-else
              >{{ Math.max(0, store.visibleHexes.length - 1) }} / {{ store.route.steps }}</template
            >
          </dd>

          <dt>travel</dt>
          <dd>
            <template v-if="store.isAuto">{{ store.route.km }} km</template>
            <template v-else>{{ store.revealedKm }} / {{ store.route.km }} km</template>
          </dd>

          <dt>flat</dt>
          <dd class="dim">{{ straightLine }}</dd>
        </dl>

        <label class="control">
          <input v-model="store.allowWater" type="checkbox" />
          <span>allow water crossings</span>
        </label>

        <div class="control stack">
          <div class="row">
            <span>travel speed</span>
            <span class="value">{{ speedLabel }}</span>
          </div>
          <input :value="store.speed" type="range" min="0" max="3" step="1" @input="onSpeed" />
          <button type="button" :disabled="store.isAuto || !store.route" @click="onPlay">
            {{ playLabel }}
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

        <div v-if="store.fog || store.showSight" class="control stack">
          <div class="row">
            <span>sight on the flat</span>
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
          <template v-if="store.fog">
            <div class="row">
              <span>explored</span>
              <span class="value">{{ store.explored.size }}</span>
            </div>
            <button type="button" :disabled="store.explored.size === 0" @click="store.forget">
              forget the map
            </button>
          </template>
        </div>

        <div class="control stack">
          <div class="row">
            <span>seed</span>
            <span class="value">{{ store.terrain.seed }}</span>
          </div>
          <button type="button" @click="store.reseed">roll a new world</button>

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
            <span>travelled</span>
            <span class="value">{{ store.travelledKm }} km</span>
          </div>
          <div class="row">
            <span>hexes walked</span>
            <span class="value">{{ store.journey.length - 1 }}</span>
          </div>

          <ol class="journey">
            <li v-for="step in recentJourney" :key="step.at">
              <button
                type="button"
                :class="{ here: step.at === standingAt }"
                :title="`stand the party back on ${step.hex}`"
                @click="store.recall(step.at)"
              >
                <span class="dim">{{ step.at }}</span>
                <span>{{ step.hex }}</span>
                <span class="dim">{{ step.terrain }}</span>
                <span class="value">{{ step.km === 0 ? 'set out' : `${step.km} km` }}</span>
              </button>
            </li>
          </ol>
          <p v-if="olderSteps" class="dim">and {{ olderSteps }} earlier</p>

          <label class="control">
            <input v-model="store.showHistory" type="checkbox" />
            <span>show the whole path history</span>
          </label>

          <button type="button" @click="store.clearLog">clear the log</button>
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
  max-width: 17rem;
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

/* Where the party stands right now, so a rewound journey still reads. */
.journey li button.here {
  background: color-mix(in srgb, var(--line) 70%, transparent);
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
</style>
