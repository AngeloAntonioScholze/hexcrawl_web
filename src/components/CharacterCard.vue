<script setup lang="ts">
import { computed, ref } from 'vue'
import { bustOf, FRAME_ART, frameVariant } from '../entities/busts'
import type { Entity } from '../entities/entity'
import BustPicker from './BustPicker.vue'

// Presentational: the mount feeds it from the DM's store or the players'
// projection alike, and turns a picked bust into setPortrait itself.
const props = withDefaults(
  defineProps<{
    entity: Pick<Entity, 'id' | 'name' | 'kind' | 'owner' | 'portrait'>
    pickable: boolean
    headingLevel?: 2 | 3 | 4
  }>(),
  { headingLevel: 3 },
)

const emit = defineEmits<{ bust: [id: string | null] }>()

const variant = computed(() => frameVariant(props.entity))
const art = computed(() => FRAME_ART[variant.value])
const frameArt = computed(() => ({ '--card-frame': `url("${art.value.frame}")` }))

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
const ovalLabel = computed(() =>
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
    <div class="frame" :style="frameArt">
      <img class="crest" :src="art.crest" alt="" aria-hidden="true" />
      <component
        :is="pickable ? 'button' : 'div'"
        class="oval"
        :class="{ bare: !shown }"
        v-bind="
          pickable
            ? {
                type: 'button',
                'aria-label': ovalLabel,
                title: unknown ? `stored bust: ${entity.portrait}` : undefined,
              }
            : {}
        "
        @click="pickable && (picking = true)"
      >
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
        <span v-if="pickable" class="strip" aria-hidden="true">{{ strip }}</span>
      </component>
      <component :is="`h${headingLevel}`" class="name">{{ entity.name }}</component>
      <div v-if="$slots.default" class="slot"><slot /></div>
      <img class="foot" :src="art.foot" alt="" aria-hidden="true" />
    </div>
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
  --card-width: 18rem;
  --card-pad: 1rem;
  --card-overhang: 1rem;
  --card-oval-w: 10rem;
  --card-oval-h: 12.5rem;
  --card-field-h: 1.75rem;
  --card-motion-hover: 120ms ease-out;
  --card-motion-swap: 150ms ease-out;

  container-type: inline-size;
  width: min(100%, var(--card-width));
  margin-inline: auto;
  padding-block: var(--card-overhang);
}

.character-card[data-variant='steel'] {
  --card-metal-light: #a9c0d8;
  --card-metal-mid: #5b7898;
  --card-metal-dark: #24344a;
  --card-fill-top: #22324a;
  --card-fill-bottom: #131b27;
  --card-window: #0b1119;
}

.character-card[data-variant='bronze'] {
  --card-metal-light: #e0b27a;
  --card-metal-mid: #9a6a36;
  --card-metal-dark: #3e2914;
  --card-fill-top: #33241a;
  --card-fill-bottom: #1a120b;
  --card-window: #120c07;
}

.character-card[data-variant='crimson'] {
  --card-metal-light: #e8927a;
  --card-metal-mid: #a8402e;
  --card-metal-dark: #451812;
  --card-fill-top: #37160f;
  --card-fill-bottom: #1c0b08;
  --card-window: #140806;
}

@media (prefers-reduced-motion: reduce) {
  .character-card {
    --card-motion-swap: 0ms;
  }
}

.frame {
  display: grid;
  position: relative;
  justify-items: center;
  padding: 1.75rem var(--card-pad);
  border-radius: 4px;
  background: linear-gradient(180deg, var(--card-fill-top), var(--card-fill-bottom));
}

/* Corners stay fixed art; the plain band between them stretches along the edge. */
.frame::after {
  position: absolute;
  inset: 0;
  border: 24px solid transparent;
  border-image: var(--card-frame) 24 / 24px / 0 stretch;
  content: '';
  pointer-events: none;
}

.crest,
.foot {
  position: absolute;
  z-index: 1;
  height: auto;
  pointer-events: none;
}

.crest {
  top: calc(-1 * var(--card-overhang));
  left: 50%;
  width: 10rem;
  translate: -50% 0;
}

.foot {
  bottom: calc(-1 * var(--card-overhang));
  left: 0;
  width: 100%;
}

.oval {
  display: grid;
  position: relative;
  width: var(--card-oval-w);
  height: var(--card-oval-h);
  place-items: center;
  overflow: hidden;
  margin: 0;
  padding: 0;
  border: 3px solid var(--card-metal-mid);
  border-radius: 50%;
  background: var(--card-window);
  box-shadow:
    inset 0 0 0 1px var(--card-metal-dark),
    inset 0 8px 20px rgb(0 0 0 / 0.6),
    0 0 0 1px var(--card-metal-dark),
    0 0 0 2px var(--card-metal-light);
  color: var(--ink);
  font: inherit;
  transition: border-color var(--card-motion-hover);
}

button.oval {
  cursor: pointer;
}

button.oval:hover {
  border-color: var(--card-metal-light);
}

button.oval:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 4px;
}

button.oval:active .bust {
  filter: brightness(0.85);
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
  stroke: var(--card-metal-mid);
  stroke-width: 1.5;
  opacity: 0.6;
}

.strip {
  display: grid;
  position: absolute;
  top: 62%;
  right: 0;
  left: 0;
  height: 1.5rem;
  place-items: center;
  background: rgb(0 0 0 / 0.6);
  color: var(--ink);
  font-size: 0.72rem;
  line-height: 1;
  opacity: 0;
  transition: opacity var(--card-motion-hover);
}

button.oval:hover .strip,
button.oval:focus-visible .strip,
.oval.bare .strip {
  opacity: 1;
}

.name {
  width: 100%;
  margin: 0.75rem 0 0;
  overflow: hidden;
  color: var(--ink);
  font-family: var(--card-name-font);
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: 0;
  line-height: 1.2;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.slot {
  width: 100%;
  margin-top: 0.25rem;
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
