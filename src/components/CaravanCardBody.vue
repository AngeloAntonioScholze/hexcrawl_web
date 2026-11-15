<script setup lang="ts">
import { computed } from 'vue'
import { MERCHANT_INFO, type Merchant } from '../entities/merchant'
import { crewShown } from './cardBody'

const props = defineProps<{
  merchants: readonly Pick<Merchant, 'id' | 'name' | 'type' | 'level'>[]
}>()

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
</template>

<style scoped>
.box {
  display: grid;
  position: relative;
  width: min(100%, 16rem);
  min-height: 284px;
  align-content: start;
  gap: 4px;
  margin-inline: auto;
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
  box-sizing: border-box;
  height: 2.5rem;
  grid-template-columns: 1.5rem 1fr auto;
  align-items: center;
  column-gap: 0.5rem;
  padding: 0 0.5rem 0 0.375rem;
  border: 1px solid var(--card-metal-dark, #17293d);
  border-left: 3px solid transparent;
  border-radius: var(--radius-control, 0.25rem);
  background: var(--card-window, #0b1014);
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
  color: var(--card-metal-light, #a5b2bf);
  font-size: 0.6875rem;
}

.pill {
  display: grid;
  height: 1.25rem;
  place-items: center;
  padding: 0 0.4rem;
  border: 1px solid var(--card-metal-light, #a5b2bf);
  border-radius: 999px;
  background: var(--card-plate, #1a314d);
  color: var(--ink);
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  line-height: 1;
}

.more,
.none {
  margin: 0;
  color: var(--card-metal-light, #a5b2bf);
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
