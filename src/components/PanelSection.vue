<script setup lang="ts">
import { computed } from 'vue'
import { useSectionFolds } from '../composables/useSectionFolds'

const props = defineProps<{
  foldKey: string
  title: string
  /** Sets the ids apart where one fold key shows twice at once, as in two sub-panels. */
  scope?: string
}>()

const folds = useSectionFolds()
const folded = computed(() => folds.isFolded(props.foldKey))

const bodyId = computed(() => {
  const key = props.foldKey.replace('.', '-')
  return props.scope ? `sec-${props.scope}-${key}` : `sec-${key}`
})
const headId = computed(() => `${bodyId.value}-head`)
</script>

<template>
  <section class="psec" :class="{ folded }" :aria-labelledby="headId">
    <div class="psec-head">
      <h3 class="psec-title">
        <button
          :id="headId"
          type="button"
          class="psec-toggle"
          :aria-expanded="!folded"
          :aria-controls="bodyId"
          @click="folds.toggle(foldKey)"
        >
          <span class="psec-name">{{ title }}</span>
          <span v-if="$slots.meta" class="psec-meta"><slot name="meta" /></span>
          <span class="psec-chevron" aria-hidden="true">▾</span>
        </button>
      </h3>
      <div v-if="$slots.actions" class="psec-actions"><slot name="actions" /></div>
    </div>
    <div v-show="!folded" :id="bodyId" class="psec-body"><slot /></div>
  </section>
</template>

<style scoped>
.psec {
  margin-top: 0.75rem;
  padding-top: 0.25rem;
  border-top: 1px solid var(--line);
}

.psec-head {
  display: flex;
  align-items: center;
  min-height: var(--section-row);
}

.psec-title {
  flex: 1;
  min-width: 0;
  margin: 0;
  font: inherit;
}

.psec-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  min-height: var(--section-row);
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.psec-toggle:focus-visible {
  outline: 2px solid #7aa2c8;
  outline-offset: 2px;
  border-radius: 0.25rem;
}

.psec-name {
  color: var(--ink);
}

.psec-meta {
  margin-left: auto;
  color: var(--ink-dim);
  font-variant-numeric: tabular-nums;
}

.psec-chevron {
  flex: none;
  width: 1rem;
  color: var(--ink-dim);
  text-align: center;
}

/* Without a meta the chevron still keeps to the right end of the row. */
.psec-name + .psec-chevron {
  margin-left: auto;
}

.psec-toggle:hover .psec-chevron {
  color: var(--ink);
}

.folded .psec-chevron {
  transform: rotate(-90deg);
}

.psec-actions {
  flex: none;
  margin-left: 0.5rem;
}
</style>
