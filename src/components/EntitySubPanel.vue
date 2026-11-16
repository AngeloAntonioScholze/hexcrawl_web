<script setup lang="ts">
import type { Entity } from '../entities/entity'
import SubPanelFrame from './SubPanelFrame.vue'

defineProps<{
  entity: Entity
  level: 1 | 2
  parentName: string
  parentInView: boolean
}>()
</script>

<template>
  <SubPanelFrame
    :level="level"
    :name="entity.name"
    :parent-name="parentName"
    :parent-in-view="parentInView"
  >
    <template #lead>
      <span class="pip" :style="{ background: entity.color }" aria-hidden="true" />
    </template>
  </SubPanelFrame>
</template>

<style scoped>
.pip {
  flex: none;
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 50%;
}
</style>
