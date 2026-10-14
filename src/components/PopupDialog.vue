<script setup lang="ts">
import { ref, watch } from 'vue'

defineProps<{ title: string }>()

const open = defineModel<boolean>({ required: true })

const dialog = ref<HTMLDialogElement>()

watch(
  [open, dialog],
  ([isOpen, el]) => {
    if (!el) return
    if (isOpen && !el.open) el.showModal()
    else if (!isOpen && el.open) el.close()
  },
  { immediate: true },
)

// The frame fills the dialog edge to edge, so a click landing on the dialog
// itself can only be on the backdrop around it.
const onClick = (event: MouseEvent): void => {
  if (event.target === dialog.value) open.value = false
}
</script>

<template>
  <dialog ref="dialog" @close="open = false" @click="onClick">
    <div v-if="open" class="frame">
      <header>
        <h2>{{ title }}</h2>
        <button type="button" class="close" aria-label="close" @click="open = false">
          <span aria-hidden="true">×</span>
        </button>
      </header>
      <slot />
    </div>
  </dialog>
</template>

<style scoped>
/* One width for every popup, whatever it holds: the browser's own max-width
   and a scrollbar on a tall one would otherwise make them differ. */
dialog {
  box-sizing: border-box;
  width: min(36rem, calc(100vw - 2rem));
  max-width: none;
  max-height: min(32rem, 75vh);
  overflow-x: hidden;
  scrollbar-gutter: stable;
  padding: 0;
  border: 1px solid var(--line);
  border-radius: 0.5rem;
  background: var(--surface-raised);
  color: var(--ink);
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--line) transparent;
}

dialog::backdrop {
  background: rgba(8, 10, 16, 0.55);
}

.frame {
  padding: 0.75rem 1rem 1rem;
}

header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 0.6rem;
}

h2 {
  margin: 0;
  font-size: 0.9rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.close {
  padding: 0.1rem 0.35rem;
  border: none;
  background: none;
  color: var(--ink-dim);
  font: inherit;
  font-size: 1.3rem;
  line-height: 1;
  cursor: pointer;
}

.close:hover {
  color: var(--ink);
}
</style>
