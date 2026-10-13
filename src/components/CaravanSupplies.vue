<script setup lang="ts">
import { computed } from 'vue'
import { SUPPLY_LIMITS, type Supply } from '../entities/supplies'
import { useHexMapStore } from '../stores/hexMap'

const props = defineProps<{ caravanId: string }>()

const store = useHexMapStore()

const SHOWN: readonly { supply: Supply; label: string; color: string }[] = [
  { supply: 'food', label: 'food', color: '#8fbc6a' },
  { supply: 'gold', label: 'gold', color: '#e0b25a' },
]

const held = computed(() => store.suppliesOf(props.caravanId))

const fill = (supply: Supply): string =>
  `${(100 * held.value[supply]) / SUPPLY_LIMITS[supply].max}%`

// The field is put back to what the store kept, so a typed 5000 or a blank
// reads as the clamped amount rather than as what was typed.
const onInput = (supply: Supply, event: Event): void => {
  const input = event.target as HTMLInputElement
  if (Number.isFinite(input.valueAsNumber)) {
    store.setSupply(props.caravanId, supply, input.valueAsNumber)
  }
  input.value = String(held.value[supply])
}
</script>

<template>
  <section class="supplies" aria-label="caravan stores">
    <div v-for="one in SHOWN" :key="one.supply" class="supply">
      <div class="row">
        <span class="label">{{ one.label }}</span>
        <input
          v-if="store.dmView"
          type="number"
          min="0"
          :max="SUPPLY_LIMITS[one.supply].max"
          step="1"
          :value="held[one.supply]"
          :aria-label="`${one.label} the caravan carries`"
          @change="onInput(one.supply, $event)"
        />
        <span v-else class="value">{{ held[one.supply] }}</span>
      </div>
      <div
        class="bar"
        role="meter"
        :aria-label="one.label"
        aria-valuemin="0"
        :aria-valuemax="SUPPLY_LIMITS[one.supply].max"
        :aria-valuenow="held[one.supply]"
      >
        <span :style="{ width: fill(one.supply), background: one.color }" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.supplies {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-top: 0.75rem;
  padding-top: 0.6rem;
  border-top: 1px solid var(--line);
  font-size: 0.78rem;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.label {
  color: var(--ink-dim);
}

.value {
  font-variant-numeric: tabular-nums;
}

input {
  width: 4.5rem;
  padding: 0.1rem 0.3rem;
  border: 1px solid var(--line);
  border-radius: 0.3rem;
  background: var(--surface);
  color: var(--ink);
  font: inherit;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

input:focus {
  border-color: #7aa2c8;
  outline: none;
}

.bar {
  height: 0.4rem;
  margin-top: 0.2rem;
  overflow: hidden;
  border-radius: 0.2rem;
  background: var(--line);
}

.bar span {
  display: block;
  height: 100%;
  transition: width 150ms ease;
}
</style>
