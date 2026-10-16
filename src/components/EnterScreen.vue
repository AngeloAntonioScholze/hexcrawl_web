<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useTemplateRef, watch, type Ref } from 'vue'
import { useEnterPrefs, type EnterChoice } from '../composables/useEnterPrefs'
import { useStage, type StageMark } from '../composables/useStage'
import type { Seat } from '../engine/stageSeats'
import { roomFromLink } from '../session/roomLink'
import { useHexMapStore } from '../stores/hexMap'
import HostForm from './HostForm.vue'
import JoinForm from './JoinForm.vue'

type View = 'title' | 'host' | 'join'

const store = useHexMapStore()
const { veiled, seats, wave, turnTo, zoomIn } = useStage()
const { name, choice } = useEnterPrefs()

// A join link skips the title card: whoever sent it already chose for them.
const linked = roomFromLink(window.location.search)
const code = ref(linked ?? '')

/** Null once the visitor is in the app. */
const view = ref<View | null>(linked ? 'join' : 'title')

const MARKS: Record<View, StageMark> = { title: 'home', host: 'host', join: 'join' }

// Each card stands on its seat round the map, so it swings out of the way or
// into place with the ground as the map turns. A card turned away behind the
// centre shrinks and fades; only the one squarely in front takes the pointer.
const placed = (seat: Seat): Record<string, string> => {
  const scale = 0.7 + 0.3 * Math.max(0, seat.facing)
  const shown = Math.min(1, Math.max(0, (seat.facing - 0.1) / 0.6))
  return {
    transform: `translate(${seat.x}px, ${seat.y}px) scale(${scale})`,
    opacity: String(shown),
    zIndex: String(Math.round(10 + 10 * seat.facing)),
  }
}

const styles = computed(() => ({
  title: placed(seats.value.home),
  host: placed(seats.value.host),
  join: placed(seats.value.join),
}))

const buttons: Record<EnterChoice, Readonly<Ref<HTMLButtonElement | null>>> = {
  host: useTemplateRef('host-button'),
  join: useTemplateRef('join-button'),
  prepare: useTemplateRef('prepare-button'),
}

const focusLastChoice = (): void => buttons[choice.value ?? 'host'].value?.focus()

onMounted(() => {
  if (linked) void turnTo('join')
  else focusLastChoice()
})

// Leaving a session or ending one drops the veil back over the map.
watch(veiled, async (next) => {
  if (!next || view.value) return
  view.value = 'title'
  await nextTick()
  focusLastChoice()
})

const open = (form: 'host' | 'join'): void => {
  choice.value = form
  view.value = form
  void turnTo(MARKS[form])
}

const back = async (): Promise<void> => {
  view.value = 'title'
  void turnTo('home')
  await nextTick()
  focusLastChoice()
}

const enter = (): void => {
  view.value = null
  veiled.value = false
}

const prepare = async (): Promise<void> => {
  choice.value = 'prepare'
  view.value = null
  store.fog = false
  await zoomIn()
  veiled.value = false
}
</script>

<template>
  <Transition name="fade">
    <div v-if="view" class="enter">
      <section
        class="card title"
        aria-labelledby="enter-title"
        :inert="view !== 'title'"
        :style="styles.title"
      >
        <h1 id="enter-title">hexcrawl</h1>
        <div class="choices">
          <button
            ref="host-button"
            type="button"
            class="host"
            :class="{ last: choice === 'host' }"
            @pointerenter="wave"
            @focus="wave"
            @click="open('host')"
          >
            Host a session
          </button>
          <button
            ref="join-button"
            type="button"
            :class="{ last: choice === 'join' }"
            @pointerenter="wave"
            @focus="wave"
            @click="open('join')"
          >
            Join
          </button>
          <button
            ref="prepare-button"
            type="button"
            :class="{ last: choice === 'prepare' }"
            title="work on the map alone, with the fog lifted"
            @pointerenter="wave"
            @focus="wave"
            @click="prepare"
          >
            Prepare
          </button>
        </div>
      </section>

      <div class="card" :inert="view !== 'host'" :style="styles.host">
        <HostForm v-model:name="name" @back="back" @started="enter" />
      </div>

      <div class="card" :inert="view !== 'join'" :style="styles.join">
        <JoinForm v-model:name="name" v-model:code="code" @back="back" @joined="enter" />
      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* Covers the whole map: the canvas takes no input while veiled, and nothing
   behind the screen should take the pointer either. */
.enter {
  position: absolute;
  inset: 0;
  z-index: 10;
  display: grid;
  place-items: center;
  padding: 1rem;
  overflow: hidden;
  background: radial-gradient(
    ellipse at center,
    transparent 30%,
    color-mix(in srgb, var(--surface) 70%, transparent)
  );
}

/* Every card stands in the one cell and is carried off it by its seat, so the
   leaving and the arriving one can pass each other as the map turns. */
.card {
  grid-area: 1 / 1;
  will-change: transform, opacity;
  width: min(24rem, calc(100vw - 2rem));
  padding: 1.25rem 1.25rem 1.5rem;
  border: 1px solid var(--line);
  border-radius: 0.5rem;
  background: color-mix(in srgb, var(--surface-raised) 92%, transparent);
  box-shadow: 0 1.5rem 4rem rgba(8, 10, 16, 0.55);
}

.title {
  text-align: center;
}

h1 {
  margin: 0 0 1.25rem;
  font-size: 1.6rem;
  font-weight: 600;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  /* The tracking trails the last letter; this centres the word, not the word and its tail. */
  text-indent: 0.3em;
}

.choices {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}

.choices .host {
  grid-column: 1 / -1;
  padding-block: 0.75rem;
  font-size: 0.95rem;
}

button {
  padding: 0.55rem 0.75rem;
  border: 1px solid var(--line);
  border-radius: 0.35rem;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-size: 0.85rem;
  cursor: pointer;
}

button:hover,
button:focus-visible {
  border-color: #7aa2c8;
}

button:focus-visible {
  outline: 2px solid #7aa2c8;
  outline-offset: 2px;
}

/* The way in this browser took last time, so a returning visitor finds it. */
button.last {
  border-color: color-mix(in srgb, #7aa2c8 60%, var(--line));
}

.fade-leave-active {
  transition: opacity 400ms ease;
}

.fade-leave-to {
  opacity: 0;
}

/* Stacked on a phone, the host bar still on top. */
@media (max-width: 720px) {
  .choices {
    grid-template-columns: 1fr;
  }
}
</style>
