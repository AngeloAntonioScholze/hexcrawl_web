<script setup lang="ts">
import { BUSTS } from '../entities/busts'
import PopupDialog from './PopupDialog.vue'

defineProps<{
  name: string
  /** The raw id the entity stores, which may name a bust this build no longer ships. */
  current: string | undefined
}>()

const open = defineModel<boolean>('open', { required: true })

const emit = defineEmits<{ pick: [id: string | null] }>()

const pick = (id: string | null): void => {
  emit('pick', id)
  open.value = false
}
</script>

<template>
  <PopupDialog v-model="open" :title="`${name}: bust`">
    <ul class="busts">
      <li>
        <button
          type="button"
          class="none"
          :class="{ here: current === undefined }"
          :aria-pressed="current === undefined"
          @click="pick(null)"
        >
          <span class="frame" aria-hidden="true" />
          <span class="label">no bust</span>
        </button>
      </li>
      <li v-for="one in BUSTS" :key="one.id">
        <button
          type="button"
          :class="{ here: one.id === current }"
          :aria-pressed="one.id === current"
          @click="pick(one.id)"
        >
          <img :src="one.url" alt="" class="frame" />
          <span class="label">{{ one.label }}</span>
        </button>
      </li>
    </ul>
  </PopupDialog>
</template>

<style scoped>
.busts {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(6rem, 1fr));
  gap: 0.6rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.busts button {
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 0.3rem;
  padding: 0.3rem;
  border: 1px solid transparent;
  border-radius: 0.35rem;
  background: none;
  color: inherit;
  font: inherit;
  font-size: 0.78rem;
  cursor: pointer;
}

.busts button:hover {
  background: color-mix(in srgb, var(--line) 45%, transparent);
}

.busts button.here {
  border-color: var(--ink-dim);
  background: color-mix(in srgb, var(--line) 70%, transparent);
}

.busts .frame {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 5;
  overflow: hidden;
  border-radius: 50%;
  background: var(--surface-deep, #0f1114);
  object-fit: cover;
  object-position: center top;
}

.busts .none .frame {
  border: 1px dashed var(--line-strong, #666e7d);
  background: none;
}

.label {
  color: var(--ink-dim);
}
</style>
