<script setup lang="ts">
import { computed, ref } from 'vue'
import { MERCHANT_INFO, type Merchant } from '../entities/merchant'
import { SUPPLY_LIMITS } from '../entities/supplies'
import { crewShown, draftCommit, draftValid } from './cardBody'

const props = defineProps<{
  gold: number
  editable: boolean
  merchants: readonly Pick<Merchant, 'id' | 'name' | 'type' | 'level'>[]
}>()

const emit = defineEmits<{ gold: [value: number] }>()

const GOLD_MAX = SUPPLY_LIMITS.gold.max

/** What the DM is typing; null shows the stored gold. */
const draft = ref<string | null>(null)
const invalid = computed(() => draft.value !== null && !draftValid(draft.value, 0, GOLD_MAX))

const onInput = (event: Event): void => {
  draft.value = (event.target as HTMLInputElement).value
}

const onChange = (event: Event): void => {
  const value = draftCommit((event.target as HTMLInputElement).value)
  draft.value = null
  if (value === null) (event.target as HTMLInputElement).value = String(props.gold)
  else emit('gold', value)
}

const crew = computed(() => {
  const { shown, more } = crewShown(props.merchants)
  return {
    more,
    rows: shown.map((merchant) => {
      const info = MERCHANT_INFO[merchant.type]
      return { merchant, info, sub: merchant.name === info.label ? null : info.label }
    }),
  }
})
</script>

<template>
  <div class="card-body">
    <div class="tallies">
      <label v-if="editable" class="tally">
        <span class="word">gold</span>
        <input
          type="number"
          inputmode="numeric"
          min="0"
          :max="GOLD_MAX"
          step="1"
          class="field"
          aria-label="caravan gold, in coins"
          :value="draft ?? gold"
          :aria-invalid="invalid ? 'true' : undefined"
          :title="invalid ? `a whole number from 0 to ${GOLD_MAX}` : undefined"
          @input="onInput"
          @change="onChange"
          @blur="draft = null"
        />
      </label>
      <span v-else class="tally">
        <span class="word">gold</span>
        <span class="value">{{ gold }}</span>
      </span>
    </div>

    <div class="box" :class="{ bare: !merchants.length }">
      <ul v-if="merchants.length" class="crew" aria-label="merchants">
        <li
          v-for="{ merchant, info, sub } in crew.rows"
          :key="merchant.id"
          class="row"
          :style="{ borderLeftColor: info.color }"
        >
          <span class="sr-only"
            >{{ merchant.name }}, {{ info.label }}, level {{ merchant.level }}</span
          >
          <span class="icon" aria-hidden="true">{{ info.icon }}</span>
          <span class="who" aria-hidden="true">
            <span class="name">{{ merchant.name }}</span>
            <span v-if="sub" class="sub">{{ sub }}</span>
          </span>
          <span class="pill" aria-hidden="true">lv {{ merchant.level }}</span>
        </li>
      </ul>
      <p v-if="crew.more" class="more">+{{ crew.more }} more in merchants</p>
      <p v-if="!merchants.length" class="none">no merchants</p>
    </div>
  </div>
</template>

<style scoped>
.card-body {
  display: grid;
  justify-items: center;
  width: 100%;
}

.tallies {
  display: flex;
  height: var(--card-field-h, 1.75rem);
  align-items: center;
  justify-content: center;
  gap: 1.5rem;
  margin-bottom: 0.75rem;
}

.tally {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
}

.word {
  color: var(--card-metal-light, #a9c0d8);
  font-size: 0.75rem;
  line-height: 1;
}

.value,
.field {
  color: var(--ink);
  font-size: 1rem;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  line-height: 1;
}

.field {
  width: 4.5rem;
  height: var(--card-field-h, 1.75rem);
  padding: 0 0.375rem;
  border: 1px solid var(--card-metal-light, #a9c0d8);
  border-radius: var(--radius-control, 0.25rem);
  background: var(--card-window, #0b1119);
  font-family: inherit;
  text-align: center;
  appearance: textfield;
  transition: background var(--card-motion-hover, 120ms ease-out);
}

.field::-webkit-inner-spin-button,
.field::-webkit-outer-spin-button {
  margin: 0;
  appearance: none;
}

.field:hover {
  background: color-mix(in srgb, var(--card-metal-dark, #24344a) 45%, var(--card-window, #0b1119));
}

.field:focus {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
}

.field[aria-invalid='true'] {
  border: 1px dashed var(--danger, #e07a6a);
}

.box {
  display: grid;
  position: relative;
  width: 100%;
  max-width: 16rem;
  aspect-ratio: 256 / 284;
  align-content: start;
  gap: 4px;
}

.box.bare {
  align-content: center;
}

.crew {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  display: grid;
  position: relative;
  height: 2.5rem;
  grid-template-columns: 1.5rem 1fr auto;
  align-items: center;
  column-gap: 0.5rem;
  padding: 0 0.5rem 0 0.375rem;
  border-left: 3px solid transparent;
  border-radius: var(--radius-control, 0.25rem);
  background: color-mix(in srgb, var(--card-window, #0b1119) 80%, transparent);
}

.icon {
  font-size: 1rem;
  line-height: 1;
  text-align: center;
}

.who {
  display: grid;
  min-width: 0;
}

.name,
.sub {
  overflow: hidden;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.name {
  color: var(--ink);
  font-size: 0.8125rem;
  font-weight: 600;
}

.sub {
  color: var(--card-metal-light, #a9c0d8);
  font-size: 0.6875rem;
}

.pill {
  display: grid;
  height: 1.25rem;
  place-items: center;
  padding: 0 0.4rem;
  border: 1px solid var(--card-metal-light, #a9c0d8);
  border-radius: 999px;
  background: var(--card-metal-dark, #24344a);
  color: var(--ink);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  line-height: 1;
}

.more,
.none {
  margin: 0;
  color: var(--card-metal-light, #a9c0d8);
  text-align: center;
}

.more {
  height: 1.5rem;
  font-size: 0.75rem;
  line-height: 1.5rem;
}

.none {
  font-size: 0.8125rem;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  margin: -1px;
  padding: 0;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
