<script setup lang="ts">
import { computed } from 'vue'
import sunAndMoon from '../assets/sun-and-moon.png'
import { useHexMapStore } from '../stores/hexMap'
import { clockLabel, timeOfDay, TURNS_PER_PHASE, widestClockLabels } from '../time/clock'

const store = useHexMapStore()

const CENTRE = { x: 110, y: 96 }
const RADIUS = 88
const BODY = 44

/**
 * The body stops at the head of every turn, so it steps three times to cross
 * the sky: the third step puts it on the far horizon, and the turn after that
 * is the turn of the phase, which starts the next one back at the near horizon.
 */
const STEPS = TURNS_PER_PHASE - 1

/** The near horizon, then the end of each of the first three turns. */
const SLASHES = [0, 1, 2, 3].map((n) => n / STEPS)

const SIZERS = widestClockLabels(3)

const onArc = (fraction: number, reach: number): { x: number; y: number } => {
  const angle = Math.PI - fraction * Math.PI
  return { x: CENTRE.x + reach * Math.cos(angle), y: CENTRE.y - reach * Math.sin(angle) }
}

const body = computed(() => {
  const fraction = store.clock.index / STEPS
  const angle = Math.PI - fraction * Math.PI

  // Turned so its foot points at the centre of the dome: upright at noon, and
  // tipped onto its side at either horizon. Rotating the local down vector
  // (0, 1) onto the inward radius works out at a quarter turn less the angle.
  return { ...onArc(fraction, RADIUS), tilt: 90 - (angle * 180) / Math.PI }
})

const ticks = computed(() =>
  SLASHES.map((fraction, i) => {
    const inner = onArc(fraction, RADIUS - 4)
    const outer = onArc(fraction, RADIUS + 4)
    return { i, x1: inner.x, y1: inner.y, x2: outer.x, y2: outer.y }
  }),
)

// Fixed rather than scattered at random, so the sky does not reshuffle itself
// every time the clock moves. Fractions of the dome, drawn inside the arc.
const STARS: readonly { x: number; y: number; r: number }[] = [
  { x: 46, y: 62, r: 1.4 },
  { x: 68, y: 38, r: 1 },
  { x: 90, y: 24, r: 1.6 },
  { x: 132, y: 30, r: 1.2 },
  { x: 156, y: 48, r: 1.5 },
  { x: 176, y: 74, r: 1 },
  { x: 62, y: 82, r: 1.1 },
  { x: 148, y: 84, r: 1.3 },
]

// Closed with the baseline so the dome can be filled rather than only traced.
const dome = [
  `M ${CENTRE.x - RADIUS} ${CENTRE.y}`,
  `A ${RADIUS} ${RADIUS} 0 0 1 ${CENTRE.x + RADIUS} ${CENTRE.y}`,
  'Z',
].join(' ')
</script>

<template>
  <div class="dial" :class="store.clock.phase">
    <svg
      viewBox="0 0 220 108"
      role="img"
      :aria-label="`day ${store.clock.day}, ${timeOfDay(store.clock)}`"
    >
      <path :d="dome" class="sky" />

      <template v-if="store.clock.phase === 'night'">
        <circle
          v-for="(star, i) in STARS"
          :key="i"
          class="star"
          :cx="star.x"
          :cy="star.y"
          :r="star.r"
        />
      </template>

      <line
        v-for="tick in ticks"
        :key="tick.i"
        :x1="tick.x1"
        :y1="tick.y1"
        :x2="tick.x2"
        :y2="tick.y2"
        class="tick"
      />

      <g class="body" :transform="`translate(${body.x} ${body.y}) rotate(${body.tilt})`">
        <image :href="sunAndMoon" :x="-BODY / 2" :y="-BODY / 2" :width="BODY" :height="BODY" />
      </g>
    </svg>

    <div class="face">
      <span class="time">{{ timeOfDay(store.clock) }}</span>
      <div class="row">
        <button
          v-if="store.may('clock')"
          type="button"
          class="step"
          title="take the last turn back"
          :disabled="!store.canRewind"
          @click="store.rewindTurn"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 4 L4 12 L17 20 Z" /></svg>
          <span class="sr">wind the clock back a turn</span>
        </button>

        <span class="label">
          <strong>{{ clockLabel(store.clock) }}</strong>
          <strong v-for="sizer in SIZERS" :key="sizer" class="sizer" aria-hidden="true">
            {{ sizer }}
          </strong>
        </span>

        <button
          v-if="store.may('clock')"
          type="button"
          class="step"
          title="let a turn pass"
          @click="store.advanceTurn"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4 L20 12 L7 20 Z" /></svg>
          <span class="sr">let the next turn pass</span>
        </button>
      </div>

      <button
        v-if="store.may('clock')"
        type="button"
        class="skip"
        :title="store.clock.phase === 'day' ? 'travel on until dark' : 'camp until first light'"
        @click="store.skipPhase"
      >
        {{ store.clock.phase === 'day' ? 'until dark' : 'until dawn' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Centred, unless that would put it over the world and entities panels: their
   open row runs 45.75rem from the left edge (MapView), so the centre keeps
   that plus a gap and half the dial clear of it. On a window too narrow for
   both, it stops short of the view toggle instead and slides under the panels. */
.dial {
  position: absolute;
  top: 1rem;
  left: min(max(50%, 54.6rem), 100% - 15.1rem);
  translate: -50% 0;
  pointer-events: none;
  text-align: center;
  --phase-ink: #f7c766;
}

.dial.night {
  --phase-ink: #a9b6ee;
}

svg {
  display: block;
  width: 16.2rem;
  overflow: visible;
}

.sky {
  fill: rgba(10, 12, 18, 0.82);
  stroke: var(--line);
  stroke-width: 1;
}

.star {
  fill: rgba(226, 232, 255, 0.75);
}

/* Light on a dark dome, unlike the earlier bright sky. */
.tick {
  stroke: rgba(230, 232, 236, 0.45);
  stroke-width: 1.5;
  stroke-linecap: round;
}

/* Positioned by x/y rather than a transform, so the slide is animated on the
   same attributes the arc places it with. */
.body {
  transition:
    x 260ms ease-out,
    y 260ms ease-out;
}

/* Laid over the dome rather than under it, so the day reads from inside the
   sky the sun is crossing. Percentages, because the dial is sized in rem and
   the dome's baseline is a fixed fraction of the drawing. */
.face {
  position: absolute;
  inset: 34% 0 14%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.2rem;
}

.face .row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

/* Carries the phase as well as the day, so dropping the separate label above
   it costs nothing: DAY 3, then NIGHT 3. */
.face strong {
  color: var(--phase-ink);
  text-shadow:
    0 0 4px rgba(8, 10, 16, 0.95),
    0 1px 2px rgba(8, 10, 16, 0.95);
  font-size: 1.17rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* Every label shares one cell with invisible copies of the widest ones, so the
   cell is as wide as the longest label in whatever font the dial is drawn in
   and the arrows either side of it never shift as the text changes. */
.label {
  display: grid;
  justify-items: center;
}

.label > * {
  grid-area: 1 / 1;
}

.sizer {
  visibility: hidden;
}

/* The dial itself is inert so it never eats a click meant for the map; only
   the controls take the pointer back. No chrome around them, just the arrows. */
button {
  padding: 0;
  border: none;
  background: none;
  color: var(--ink);
  cursor: pointer;
  pointer-events: auto;
}

.step {
  display: grid;
  place-items: center;
}

button:hover:not(:disabled) {
  color: var(--phase-ink);
}

button:disabled {
  opacity: 0.3;
  cursor: default;
}

.step svg {
  width: 1.3rem;
  fill: currentColor;
}

/* The turn by name, over the day it falls in. Its own line, so a long name
   never pushes the arrows either side of the label below. */
.time {
  color: var(--phase-ink);
  font-size: 0.81rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  white-space: nowrap;
  text-shadow: 0 1px 2px rgba(8, 10, 16, 0.95);
}

.skip {
  font-size: 0.77rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(230, 232, 236, 0.7);
  text-shadow: 0 1px 2px rgba(8, 10, 16, 0.95);
}

.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}

/* On a phone the collapsed panels stack down the left as far as the middle of
   the screen, so the dial drops below them rather than squeezing in beside. */
@media (max-width: 720px) {
  .dial {
    top: 9.25rem;
    left: 50%;
  }

  svg {
    width: 13.5rem;
  }
}
</style>
