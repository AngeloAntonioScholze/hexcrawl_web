<script setup lang="ts">
import { computed } from 'vue'
import HexCanvas from '../components/HexCanvas.vue'
import { useHexMapStore } from '../stores/hexMap'
import { KM_PER_HEX } from '../terrain/travel'

const store = useHexMapStore()

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

const hint = computed(() => {
  if (!store.start) return 'click a hex to set the start'
  if (!store.goal) return 'click another hex to set the destination'
  if (store.route) return 'click again to start a new route'
  return store.allowWater ? 'no route found' : 'no land route — try allowing water'
})

const straightLine = computed(() =>
  store.route ? `${store.route.steps * KM_PER_HEX} km` : '—',
)
</script>

<template>
  <main>
    <HexCanvas />
    <aside>
      <h1>hexcrawl</h1>

      <dl>
        <dt>hover</dt>
        <dd>
          {{ store.hovered ?? '—' }}
          <span v-if="store.hoveredTile" class="dim">{{ store.hoveredTile.terrain }}</span>
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
          <template v-else>{{ Math.max(0, store.visibleHexes.length - 1) }} / {{ store.route.steps }}</template>
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
        <input
          :value="store.speed"
          type="range"
          min="0"
          max="3"
          step="1"
          @input="onSpeed"
        />
        <button type="button" :disabled="store.isAuto || !store.route" @click="onPlay">
          {{ playLabel }}
        </button>
      </div>

      <p>{{ hint }}</p>
      <p class="dim">drag to pan · wheel to zoom · Q / E to rotate</p>
    </aside>
  </main>
</template>

<style scoped>
main {
  position: relative;
  height: 100%;
}

aside {
  position: absolute;
  top: 1rem;
  left: 1rem;
  min-width: 13rem;
  padding: 0.75rem 1rem;
  border: 1px solid var(--line);
  border-radius: 0.5rem;
  background: color-mix(in srgb, var(--surface-raised) 88%, transparent);
  pointer-events: none;
}

h1 {
  margin: 0 0 0.5rem;
  font-size: 0.9rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
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

/* The panel ignores pointer events so the map stays draggable underneath;
   anything interactive has to opt back in. */
.control {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  margin-top: 0.75rem;
  padding-top: 0.6rem;
  border-top: 1px solid var(--line);
  font-size: 0.78rem;
  cursor: pointer;
  pointer-events: auto;
  user-select: none;
}

.control input {
  margin: 0;
  accent-color: #7aa2c8;
  cursor: pointer;
}

.control.stack {
  display: block;
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
  margin: 0.4rem 0 0.5rem;
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
