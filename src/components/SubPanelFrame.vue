<script setup lang="ts">
import { computed } from 'vue'
import { useSubPanels } from '../composables/useSubPanels'

const props = defineProps<{
  level: 1 | 2
  name: string
  /** What the back control returns to: `entities` for level 1, else the level-1 entity. */
  parentName: string
  /** With the parent beside it the panel closes with ×; without, it steps back with ‹. */
  parentInView: boolean
}>()

const panels = useSubPanels()
const titleId = computed(() => `col-${props.level}-title`)

const close = (): void => panels.close(props.level)

// An open dialog inside the panel handles its own Escape.
const onKeydown = (event: KeyboardEvent): void => {
  if (event.key !== 'Escape' || event.defaultPrevented) return
  if ((event.target as Element | null)?.closest('dialog')) return
  event.preventDefault()
  close()
}
</script>

<template>
  <aside class="subpanel" :data-level="level" :aria-labelledby="titleId" @keydown="onKeydown">
    <header>
      <button
        v-if="!parentInView"
        type="button"
        class="control back"
        :aria-label="`back to ${parentName}`"
        title="back"
        @click="close"
      >
        ‹
      </button>
      <h2 :id="titleId" class="title" tabindex="-1">
        <slot name="lead" />
        <span class="name">{{ name }}</span>
      </h2>
      <button
        v-if="parentInView"
        type="button"
        class="control close"
        :aria-label="`close ${name}`"
        title="close"
        @click="close"
      >
        ×
      </button>
    </header>
    <div class="body">
      <div class="card-slot" data-testid="card-slot"><slot name="card" /></div>
      <slot />
    </div>
  </aside>
</template>

<style scoped>
.subpanel {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: var(--subpanel-width);
  max-height: 100%;
  min-height: 0;
  border: 1px solid var(--line);
  border-radius: 0.5rem;
  background: color-mix(in srgb, var(--surface-raised) 88%, transparent);
  overflow: hidden;
  pointer-events: auto;
}

header {
  display: flex;
  flex: none;
  align-items: center;
  min-height: var(--dock-row);
}

.title {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
  margin: 0;
  padding: 0 1rem;
  color: var(--ink);
  font-size: 0.9rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.back + .title {
  padding-left: 0;
}

.title:focus {
  outline: none;
}

.title:focus-visible {
  outline: 2px solid #7aa2c8;
  outline-offset: -2px;
}

.name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.control {
  flex: none;
  width: var(--dock-row);
  height: var(--dock-row);
  padding: 0;
  border: none;
  background: none;
  color: var(--ink-dim);
  font: inherit;
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
}

.control:hover {
  color: var(--ink);
}

.control:active {
  background: color-mix(in srgb, var(--line) 45%, transparent);
}

.control:focus-visible {
  outline: 2px solid #7aa2c8;
  outline-offset: -2px;
  border-radius: 0.5rem;
}

.body {
  flex: 1 1 auto;
  min-height: 0;
  padding: 0 1rem 0.75rem;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--line) transparent;
}

.card-slot:empty {
  display: none;
}
</style>
