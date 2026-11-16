<script setup lang="ts">
import { computed, ref } from 'vue'
import { bustOf, FRAME_ART, frameVariant, type FrameBox } from '../entities/busts'
import type { Entity } from '../entities/entity'
import BustPicker from './BustPicker.vue'

// Presentational: the mount feeds it from the DM's store or the players'
// projection alike, and turns a picked bust into setPortrait itself.
const props = withDefaults(
  defineProps<{
    entity: Pick<Entity, 'id' | 'name' | 'kind' | 'owner' | 'hidden' | 'portrait'>
    pickable: boolean
    headingLevel?: 2 | 3 | 4
    plate?: readonly string[]
  }>(),
  { headingLevel: 3, plate: () => [] },
)

const emit = defineEmits<{ bust: [id: string | null] }>()

const SLOTS = ['slot1', 'slot2', 'slot3'] as const
const PLATE_LINES = 2
const FRAME_W = 340
const FRAME_H = 438

const variant = computed(() => frameVariant(props.entity))
const art = computed(() => FRAME_ART[variant.value])

const place = ({ left, top, width, height }: FrameBox): Record<string, string> => ({
  left: `${left}%`,
  top: `${top}%`,
  width: `${width}%`,
  height: `${height}%`,
})

// Padding in % of the region's own width: a plain % would be of the whole frame.
// The frame spans the card, the query container, so 1cqw is 1% of the frame.
const pad = (box: FrameBox, start: number, end = start): Record<string, string> => ({
  paddingInlineStart: `${(box.width * start) / 100}cqw`,
  paddingInlineEnd: `${(box.width * end) / 100}cqw`,
})

const windowStyle = computed(() => ({
  ...place(art.value.regions.window),
  '--window-mask': `url("${art.value.window}")`,
}))

// One line exactly as tall as the art's banner; the wider end pad keeps the
// text off the banner's sloped right end.
const nameStyle = computed(() => {
  const banner = art.value.regions.banner
  return {
    ...place(banner),
    ...pad(banner, 1.8, 3.6),
    lineHeight: `calc(100cqw * ${(banner.height * FRAME_H) / 100} / ${FRAME_W})`,
  }
})

const slotStyle = (index: number): Record<string, string> => {
  const slot = art.value.regions.slots[index]
  return { ...place(slot), ...pad(slot, 4) }
}

const plateLines = computed(() => props.plate.slice(0, PLATE_LINES))

const bust = computed(() => bustOf(props.entity.portrait))
/** A bust whose picture would not load reads as no bust at all. */
const broken = ref<string | null>(null)
const shown = computed(() =>
  bust.value && bust.value.id !== broken.value ? bust.value : undefined,
)
const unknown = computed(() => props.entity.portrait !== undefined && !bust.value)

const strip = computed(() => {
  if (unknown.value) return 'unknown bust'
  return shown.value ? 'change bust' : 'choose a bust'
})
const pickLabel = computed(() =>
  shown.value
    ? `change ${props.entity.name}'s bust (now ${shown.value.label})`
    : `choose a bust for ${props.entity.name}`,
)

const picking = ref(false)
</script>

<template>
  <article
    class="character-card"
    :data-variant="variant"
    :aria-label="`${entity.name}, ${entity.kind}`"
  >
    <div class="frame">
      <img
        class="art"
        :src="art.frame"
        alt=""
        aria-hidden="true"
        draggable="false"
        decoding="async"
      />
      <div class="window" :style="windowStyle">
        <Transition name="swap">
          <img
            v-if="shown"
            :key="shown.id"
            class="bust"
            :src="shown.url"
            :alt="pickable ? '' : shown.label"
            @error="broken = shown.id"
          />
        </Transition>
        <svg v-if="!shown" class="empty" viewBox="0 0 56 56" aria-hidden="true">
          <polygon points="28,3 50,15.5 50,40.5 28,53 6,40.5 6,15.5" />
        </svg>
      </div>
      <button
        v-if="pickable"
        type="button"
        class="pick"
        :class="{ bare: !shown }"
        :style="place(art.regions.pick)"
        :aria-label="pickLabel"
        :title="unknown ? `stored bust: ${entity.portrait}` : undefined"
        @click="picking = true"
      >
        <span class="strip" aria-hidden="true">{{ strip }}</span>
      </button>
      <component :is="`h${headingLevel}`" class="name" :style="nameStyle" :title="entity.name">{{
        entity.name
      }}</component>
      <template v-for="(name, index) in SLOTS" :key="name">
        <div v-if="$slots[name]" class="slot" :style="slotStyle(index)">
          <slot :name="name" />
        </div>
      </template>
      <div v-if="plateLines.length" class="plate" :style="place(art.regions.plate)">
        <span v-for="(line, index) in plateLines" :key="index" class="line">{{ line }}</span>
      </div>
    </div>
    <div v-if="$slots.default" class="body"><slot /></div>
    <BustPicker
      v-if="pickable"
      v-model:open="picking"
      :name="entity.name"
      :current="entity.portrait"
      @pick="emit('bust', $event)"
    />
  </article>
</template>

<style scoped>
.character-card {
  --card-width: 21.25rem;
  --card-motion-hover: 120ms ease-out;
  --card-motion-swap: 150ms ease-out;

  display: grid;
  width: min(100%, var(--card-width));
  margin-inline: auto;
  justify-items: center;
  container-type: inline-size;
}

.character-card[data-variant='steel'] {
  --card-metal-light: #a5b2bf;
  --card-metal-mid: #7e8c9c;
  --card-metal-dark: #17293d;
  --card-plate: #1a314d;
  --card-window: #0b1014;
}

.character-card[data-variant='bronze'] {
  --card-metal-light: #b39879;
  --card-metal-mid: #907860;
  --card-metal-dark: #392013;
  --card-plate: #422416;
  --card-window: #160b03;
}

.character-card[data-variant='crimson'] {
  --card-metal-light: #c98674;
  --card-metal-mid: #865244;
  --card-metal-dark: #380c06;
  --card-plate: #450e09;
  --card-window: #150601;
}

@media (prefers-reduced-motion: reduce) {
  .character-card {
    --card-motion-swap: 0ms;
  }
}

.frame {
  position: relative;
  width: 100%;
  aspect-ratio: 340 / 438;
}

.frame > * {
  position: absolute;
}

.art {
  inset: 0;
  width: 100%;
  height: 100%;
  image-rendering: auto;
  pointer-events: none;
  user-select: none;
}

.window {
  display: grid;
  place-items: center;
  overflow: hidden;
  mask-image: var(--window-mask);
  mask-size: 100% 100%;
  mask-repeat: no-repeat;
  -webkit-mask-image: var(--window-mask);
  -webkit-mask-size: 100% 100%;
  -webkit-mask-repeat: no-repeat;
}

.window::after {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 55%, rgb(0 0 0 / 0.5));
  content: '';
  pointer-events: none;
}

.bust {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center top;
}

.empty {
  width: 40px;
  height: 40px;
  fill: none;
  stroke: var(--card-metal-light);
  stroke-width: 1.5;
  opacity: 0.5;
}

.pick {
  overflow: hidden;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--ink);
  font: inherit;
  cursor: pointer;
}

.pick:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}

.frame:has(.pick:active) .bust {
  filter: brightness(0.85);
}

.strip {
  display: grid;
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 1.5rem;
  place-items: center;
  background: rgb(0 0 0 / 0.6);
  font-size: max(11px, 3.53cqw);
  line-height: 1;
  opacity: 0;
  transition: opacity var(--card-motion-hover);
}

.pick:hover .strip,
.pick:focus-visible .strip,
.pick.bare .strip {
  opacity: 1;
}

.name {
  display: block;
  margin: 0;
  overflow: hidden;
  color: var(--ink);
  font-family: var(--card-name-font);
  font-size: max(11px, 3.53cqw);
  font-weight: 600;
  letter-spacing: 0;
  text-overflow: ellipsis;
  text-shadow: 0 1px 1px rgb(0 0 0 / 0.9);
  white-space: nowrap;
}

.slot {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.25em;
  overflow-x: clip;
  overflow-y: visible;
  border-radius: 3px;
  color: var(--ink);
  font:
    600 max(10.5px, 3.24cqw) / 1 system-ui,
    -apple-system,
    'Segoe UI',
    sans-serif;
  font-variant-numeric: tabular-nums;
  text-shadow: 0 1px 1px rgb(0 0 0 / 0.9);
  white-space: nowrap;
  transition: background var(--card-motion-hover);
}

.slot:has(input):hover {
  background: rgb(255 255 255 / 0.06);
}

.slot:focus-within {
  outline: 2px solid var(--ink);
  outline-offset: 1px;
}

.slot:has([aria-invalid='true'])::after {
  content: '';
  position: absolute;
  inset: 0;
  border: 1px dashed var(--danger, #e07a6a);
  border-radius: 3px;
  pointer-events: none;
}

.plate {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  font-size: max(10.5px, 3.24cqw);
  line-height: 1.2;
  text-align: center;
  text-shadow: 0 1px 1px rgb(0 0 0 / 0.9);
}

.line {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.line:first-child {
  color: var(--ink);
  font-weight: 600;
}

.line + .line {
  color: var(--card-metal-light);
  font-weight: 400;
}

.body {
  display: grid;
  width: 100%;
  margin-top: 0.5rem;
  justify-items: center;
}

.swap-enter-active,
.swap-leave-active {
  transition: opacity var(--card-motion-swap);
}

.swap-enter-from,
.swap-leave-to {
  opacity: 0;
}
</style>
