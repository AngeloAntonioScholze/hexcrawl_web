<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from 'vue'
import { configured, consent, decline, grant } from '../analytics/analytics'

/** The same string as the strip's media query below. */
const STRIP = '(max-width: 1023px), (max-height: 640px)'
const RESERVE = '--consent-reserve'
// The strip's bottom inset plus the gap above it.
const RESERVE_EXTRA_PX = 16

// Answered here even when the answer could not be kept, so the prompt still goes.
const answered = ref(false)
const shown = computed(() => configured && consent.value === null && !answered.value)
const root = useTemplateRef<HTMLElement>('root')

// Where focus was just before it came into the prompt, to hand it back after.
let cameFrom: HTMLElement | null = null

const onFocusIn = (event: FocusEvent): void => {
  const from = event.relatedTarget
  if (from instanceof HTMLElement && !root.value?.contains(from)) cameFrom = from
}

const answer = (choose: () => void): void => {
  const hadFocus = root.value?.contains(document.activeElement) ?? false
  try {
    choose()
  } catch (error) {
    // Nothing the visitor can do about it, so the prompt still goes.
    console.warn('hexcrawl: usage stats', error)
  }
  answered.value = true
  if (!hadFocus) return
  if (cameFrom?.isConnected) cameFrom.focus()
  else (document.activeElement as HTMLElement | null)?.blur()
}

// Event-driven only: a resize of the strip or a change of the query, never a frame.
const strip = window.matchMedia(STRIP)
const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => reserve())

const reserve = (): void => {
  const element = root.value
  const style = document.documentElement.style
  if (shown.value && element && strip.matches) {
    style.setProperty(RESERVE, `${element.offsetHeight + RESERVE_EXTRA_PX}px`)
  } else {
    style.removeProperty(RESERVE)
  }
}

watch(
  root,
  (element, before) => {
    if (before) observer?.unobserve(before)
    if (element) observer?.observe(element)
    reserve()
  },
  { flush: 'post' },
)
watch(shown, reserve)

onMounted(() => {
  strip.addEventListener('change', reserve)
  reserve()
})

onBeforeUnmount(() => {
  strip.removeEventListener('change', reserve)
  observer?.disconnect()
  document.documentElement.style.removeProperty(RESERVE)
})
</script>

<template>
  <Transition name="consent" appear>
    <section
      v-if="shown"
      ref="root"
      class="consent"
      aria-labelledby="consent-title"
      @focusin="onFocusIn"
    >
      <h2 id="consent-title">Usage stats</h2>
      <p>
        Count which tools and views get used, to make hexcrawl better. Never your maps or names.
      </p>
      <div class="actions">
        <button type="button" @click="answer(grant)">Share stats</button>
        <button type="button" @click="answer(decline)">Don't share</button>
      </div>
    </section>
  </Transition>
</template>

<style scoped>
.consent {
  position: fixed;
  right: 1rem;
  bottom: var(--minimap-reserve);
  z-index: 12;
  display: grid;
  gap: var(--space-2, 0.5rem);
  width: min(19.5rem, 100vw - var(--dock-reserve) - 1rem);
  padding: var(--space-3, 0.75rem);
  border: 1px solid var(--line);
  border-radius: var(--radius-panel, 0.5rem);
  background: var(--surface-raised);
  box-shadow: var(--shadow-panel, 0 6px 24px -8px rgb(0 0 0 / 0.6));
  color: var(--ink);
}

h2 {
  margin: 0;
  font-size: 0.875rem;
  line-height: 1.3;
  font-weight: 600;
  color: var(--ink);
}

p {
  margin: 0;
  font-size: 0.8125rem;
  line-height: 1.4;
  color: var(--ink-dim);
}

.actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--space-2, 0.5rem);
  margin-top: var(--space-1, 0.25rem);
}

button {
  height: var(--control-h, 2rem);
  padding: 0 var(--space-3, 0.75rem);
  border: 1px solid var(--line-strong, #666e7d);
  border-radius: var(--radius-control, 0.25rem);
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-size: 0.8125rem;
  line-height: 1.4;
  font-weight: 400;
  cursor: pointer;
}

button:hover {
  border-color: var(--accent, #7aa2c8);
}

button:focus-visible {
  outline: 2px solid var(--accent, #7aa2c8);
  outline-offset: 2px;
}

button:active {
  background: var(--surface-deep, #0f1114);
}

/* Keep STRIP above in step with this query. */
@media (max-width: 1023px), (max-height: 640px) {
  .consent {
    left: 0.5rem;
    right: 0.5rem;
    bottom: 0.5rem;
    width: auto;
  }
}

@media (max-width: 720px) {
  button {
    height: var(--control-h, 2.5rem);
  }
}

.consent-enter-active {
  transition:
    opacity var(--motion-fold, 200ms) var(--ease-fold, cubic-bezier(0.2, 0, 0, 1)) 400ms,
    translate var(--motion-fold, 200ms) var(--ease-fold, cubic-bezier(0.2, 0, 0, 1)) 400ms;
}

.consent-enter-from {
  opacity: 0;
  translate: 0 8px;
}

.consent-leave-active {
  transition: opacity 120ms ease-out;
}

.consent-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .consent-enter-active,
  .consent-leave-active {
    transition: none;
  }

  .consent-enter-from {
    translate: none;
  }
}
</style>
