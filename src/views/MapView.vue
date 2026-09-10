<script setup lang="ts">
import { computed } from 'vue'
import HexCanvas from '../components/HexCanvas.vue'
import { useHexMapStore } from '../stores/hexMap'
import { KM_PER_HEX } from '../terrain/travel'

const store = useHexMapStore()

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
        <dd>{{ store.route.steps }}</dd>

        <dt>travel</dt>
        <dd>{{ store.route.km }} km</dd>

        <dt>flat</dt>
        <dd class="dim">{{ straightLine }}</dd>
      </dl>

      <label class="control">
        <input v-model="store.allowWater" type="checkbox" />
        <span>allow water crossings</span>
      </label>

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
</style>
