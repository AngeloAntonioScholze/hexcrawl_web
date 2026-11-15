<script setup lang="ts">
import { computed } from 'vue'
import type { Entity } from '../entities/entity'
import { crewShown } from './cardBody'

const props = defineProps<{
  riders: readonly Pick<Entity, 'id' | 'name' | 'kind' | 'color'>[]
}>()

const crew = computed(() => crewShown(props.riders))
</script>

<template>
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
  border-left-width: 3px;
  border-radius: var(--radius-control, 0.25rem);
  background: var(--card-window, #0b1014);
}

.pip {
  justify-self: center;
  width: 0.625rem;
  height: 0.625rem;
  border-radius: 50%;
  box-shadow: 0 0 0 1px var(--card-metal-dark, #17293d);
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
  color: var(--card-metal-light, #a5b2bf);
  font-size: 0.6875rem;
  line-height: 1.2;
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
