<script setup lang="ts">
import { computed } from 'vue'
import { useSubPanels, visibleLevels, type ColumnMode } from '../composables/useSubPanels'
import type { Entity } from '../entities/entity'
import type { Merchant } from '../entities/merchant'
import { useHexMapStore } from '../stores/hexMap'
import EntitySubPanel from './EntitySubPanel.vue'
import MerchantSubPanel from './MerchantSubPanel.vue'

const props = defineProps<{ mode: ColumnMode }>()

const store = useHexMapStore()
const { stack } = useSubPanels()

type Shown =
  | { key: string; level: 1 | 2; parentName: string; parentInView: boolean; entity: Entity }
  | { key: string; level: 2; parentName: string; parentInView: boolean; merchant: Merchant }

const entityOf = (id: string): Entity | undefined => store.entities.find((one) => one.id === id)

// Only the levels that fit beside the dock; a panel whose entity or merchant is
// gone renders nothing until MapView's validity watch closes it.
const shown = computed<Shown[]>(() => {
  const levels = visibleLevels(stack.value.length, props.mode)
  const first = stack.value[0]
  const levelOne = first?.kind === 'entity' ? entityOf(first.id) : undefined
  const out: Shown[] = []
  for (const level of levels) {
    if (level !== 1 && level !== 2) continue
    const panel = stack.value[level - 1]
    if (panel === undefined) continue
    const parentInView = levels.includes(level - 1)
    const key = `${level}:${panel.kind}:${panel.id}`
    if (level === 1) {
      if (levelOne) out.push({ key, level, parentName: 'entities', parentInView, entity: levelOne })
      continue
    }
    if (!levelOne) continue
    const parentName = levelOne.name
    if (panel.kind === 'entity') {
      const entity = entityOf(panel.id)
      if (entity) out.push({ key, level, parentName, parentInView, entity })
    } else {
      const merchant = store.merchants.find((one) => one.id === panel.id)
      if (merchant) out.push({ key, level, parentName, parentInView, merchant })
    }
  }
  return out
})
</script>

<template>
  <template v-for="one in shown" :key="one.key">
    <EntitySubPanel
      v-if="'entity' in one"
      :entity="one.entity"
      :level="one.level"
      :parent-name="one.parentName"
      :parent-in-view="one.parentInView"
    />
    <MerchantSubPanel
      v-else
      :merchant="one.merchant"
      :parent-name="one.parentName"
      :parent-in-view="one.parentInView"
    />
  </template>
</template>
