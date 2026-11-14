<script setup lang="ts">
import { computed } from 'vue'
import type { Entity } from '../entities/entity'
import { crewShown } from './cardBody'

// Read-only: pace and sight keep their edit rows under the card.
const props = defineProps<{
  pacePerTurn: number
  sight: number
  riders: readonly Pick<Entity, 'id' | 'name' | 'kind' | 'color'>[]
}>()

const crew = computed(() => crewShown(props.riders))
</script>

<template>
  <div class="card-body">
    <div class="tallies">
      <span class="tally">
        <span class="word">pace</span>
        <span class="value">{{ pacePerTurn }} hex</span>
      </span>
      <span class="tally">
        <span class="word">sight</span>
        <span class="value">{{ sight }} hex</span>
      </span>
    </div>

    <div class="box" :class="{ bare: !riders.length }">
      <ul v-if="riders.length" class="crew" aria-label="aboard">
        <li v-for="rider in crew.shown" :key="rider.id" class="row">
          <span class="sr-only">{{ rider.name }}, {{ rider.kind }}</span>
          <span class="pip" :style="{ background: rider.color }" aria-hidden="true" />
          <span class="name" aria-hidden="true">{{ rider.name }}</span>
          <span class="sub" aria-hidden="true">{{ rider.kind }}</span>
        </li>
      </ul>
      <p v-if="crew.more" class="more">+{{ crew.more }} more aboard</p>
      <p v-if="!riders.length" class="none">nobody aboard</p>
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

.value {
  color: var(--ink);
  font-size: 1rem;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  line-height: 1;
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

.pip {
  justify-self: center;
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 50%;
  box-shadow: 0 0 0 1px var(--card-metal-dark, #24344a);
}

.name {
  min-width: 0;
  overflow: hidden;
  color: var(--ink);
  font-size: 0.8125rem;
  font-weight: 600;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sub {
  color: var(--card-metal-light, #a9c0d8);
  font-size: 0.6875rem;
  line-height: 1.2;
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
