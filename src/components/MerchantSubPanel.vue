<script setup lang="ts">
import { MERCHANT_INFO, type Merchant } from '../entities/merchant'
import SubPanelFrame from './SubPanelFrame.vue'

defineProps<{
  merchant: Merchant
  parentName: string
  parentInView: boolean
}>()
</script>

<template>
  <SubPanelFrame
    :level="2"
    :name="merchant.name"
    :parent-name="parentName"
    :parent-in-view="parentInView"
  >
    <template #lead>
      <span class="icon" aria-hidden="true">{{ MERCHANT_INFO[merchant.type].icon }}</span>
    </template>
  </SubPanelFrame>
</template>

<style scoped>
.icon {
  flex: none;
}
</style>
