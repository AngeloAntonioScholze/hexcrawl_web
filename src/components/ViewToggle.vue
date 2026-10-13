<script setup lang="ts">
import { useHexMapStore } from '../stores/hexMap'

const store = useHexMapStore()
</script>

<template>
  <button
    type="button"
    role="switch"
    class="view-toggle"
    :class="{ dm: store.dmView }"
    :aria-checked="store.dmView"
    aria-label="DM view"
    :title="store.dmView ? 'seeing what the DM sees' : 'seeing what the players see'"
    @click="store.dmView = !store.dmView"
  >
    <span class="thumb" aria-hidden="true" />
    <span class="side" :class="{ on: !store.dmView }" aria-hidden="true">player</span>
    <span class="side" :class="{ on: store.dmView }" aria-hidden="true">dm</span>
  </button>
</template>

<style scoped>
.view-toggle {
  position: absolute;
  top: 12px;
  right: 12px;
  z-index: 10;
  display: grid;
  grid-template-columns: 3rem 2rem;
  height: 30px;
  padding: 2px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface-raised) 88%, transparent);
  color: var(--ink-dim);
  font: inherit;
  font-size: 0.74rem;
  cursor: pointer;
  user-select: none;
}

.view-toggle:hover {
  border-color: #7aa2c8;
}

.view-toggle:focus-visible {
  outline: 2px solid #7aa2c8;
  outline-offset: 2px;
}

.thumb {
  position: absolute;
  top: 2px;
  bottom: 2px;
  left: 2px;
  width: 3rem;
  border-radius: 999px;
  background: color-mix(in srgb, #7aa2c8 35%, var(--surface));
  transition:
    translate 150ms ease,
    width 150ms ease;
}

.view-toggle.dm .thumb {
  width: 2rem;
  translate: 3rem 0;
}

.side {
  position: relative;
  display: grid;
  place-items: center;
  transition: color 150ms ease;
}

.side.on {
  color: var(--ink);
}
</style>
