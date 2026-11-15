<script setup lang="ts">
import { computed, ref } from 'vue'
import { draftCommit, draftValid } from './cardBody'

const props = withDefaults(
  defineProps<{
    word: string
    value: number
    editable: boolean
    min: number
    max: number
    step: number
    label: string
    invalidTitle: string
    format?: 'int' | 'compact' | 'decimal'
    /** Read-only name when "{label} {value}" would not read well, e.g. "pace 1.5 hexes a turn". */
    groupLabel?: string
  }>(),
  { format: 'int', groupLabel: undefined },
)

const emit = defineEmits<{ commit: [value: number] }>()

const COMPACT_FROM = 10000
const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumSignificantDigits: 3 })
const decimal = new Intl.NumberFormat('en', { maximumFractionDigits: 1, useGrouping: false })

const text = computed(() => {
  if (props.format === 'compact' && props.value >= COMPACT_FROM) return compact.format(props.value)
  if (props.format === 'decimal') return decimal.format(props.value)
  return String(props.value)
})
const abridged = computed(() => text.value !== String(props.value))

/** What is being typed; null shows the stored value. */
const draft = ref<string | null>(null)
const invalid = computed(
  () => draft.value !== null && !draftValid(draft.value, props.min, props.max),
)

const onInput = (event: Event): void => {
  draft.value = (event.target as HTMLInputElement).value
}

// No change fires when the value typed back matches the one at focus, so the
// draft is dropped on blur too: an unfocused field always shows the stored value.
const onBlur = (event: Event): void => {
  if (draft.value === null) return
  draft.value = null
  ;(event.target as HTMLInputElement).value = String(props.value)
}

// Commit on change, not input, so each correction is one undo step; the store clamps.
const onChange = (event: Event): void => {
  const input = event.target as HTMLInputElement
  const value = draftCommit(input.value)
  draft.value = null
  if (value !== null) emit('commit', value)
  input.value = String(props.value)
}
</script>

<template>
  <label v-if="editable" class="tally">
    <span class="word">{{ word }}</span>
    <input
      class="value"
      type="number"
      inputmode="numeric"
      :min="min"
      :max="max"
      :step="step"
      :value="draft ?? value"
      :aria-label="label"
      :aria-invalid="invalid ? 'true' : undefined"
      :title="invalid ? invalidTitle : undefined"
      @input="onInput"
      @change="onChange"
      @blur="onBlur"
    />
  </label>
  <span
    v-else
    class="tally"
    role="group"
    :aria-label="groupLabel ?? `${label} ${value}`"
    :title="abridged ? String(value) : undefined"
  >
    <span class="word" aria-hidden="true">{{ word }}</span>
    <span class="value" aria-hidden="true">{{ text }}</span>
  </span>
</template>

<style scoped>
.tally {
  display: flex;
  flex: 1 1 0;
  height: 100%;
  min-width: 0;
  align-items: center;
  justify-content: center;
  gap: 0.25em;
}

.word {
  color: var(--card-metal-light, #a5b2bf);
  font-weight: 400;
  text-transform: lowercase;
}

.value {
  min-width: 0;
  overflow: hidden;
  color: var(--ink);
  font-weight: 600;
  text-overflow: ellipsis;
}

/* Sized to its digits so "lv 3" sits centred like the read-only text; where
   field-sizing is unsupported it falls back to filling the slot. */
input.value {
  flex: 0 1 auto;
  min-width: 1ch;
  max-width: 100%;
  height: 100%;
  field-sizing: content;
  margin: 0;
  padding: 0;
  border: 0;
  outline: none;
  background: transparent;
  color: inherit;
  font: inherit;
  font-weight: 600;
  text-align: center;
  appearance: textfield;
}

input.value::-webkit-inner-spin-button,
input.value::-webkit-outer-spin-button {
  margin: 0;
  appearance: none;
}

.tally:focus-within .word {
  display: none;
}
</style>
