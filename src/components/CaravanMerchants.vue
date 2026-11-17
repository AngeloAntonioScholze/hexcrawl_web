<script setup lang="ts">
import { computed } from 'vue'
import { usePlayerView } from '../composables/usePlayerView'
import { unlockedServices } from '../entities/catalog'
import { MERCHANT_INFO } from '../entities/merchant'
import PanelSection from './PanelSection.vue'

const props = defineProps<{ caravanId: string }>()

// The players read what they see from their projection, as their map does.
const player = usePlayerView()

const crew = computed(() =>
  player.merchantsOf(props.caravanId).map((merchant) => ({
    merchant,
    info: MERCHANT_INFO[merchant.type],
    offers: unlockedServices(merchant.type, merchant.level, player.catalog.value),
  })),
)
</script>

<template>
  <PanelSection fold-key="caravan.merchants" title="merchants">
    <template #meta>{{ crew.length }}</template>
    <div class="merchants">
      <ul v-if="crew.length" class="list">
        <li v-for="{ merchant, info, offers } in crew" :key="merchant.id">
          <div class="merchant">
            <span aria-hidden="true">{{ info.icon }}</span>
            <span class="name" :title="info.blurb">
              {{ merchant.name }}
              <span v-if="merchant.name !== info.label" class="label">
                {{ info.label.toLowerCase() }}
              </span>
            </span>
            <span class="value">lv {{ merchant.level }}</span>
          </div>
          <ul v-if="offers.length" class="offers" :aria-label="`what ${merchant.name} offers`">
            <li v-for="entry in offers" :key="entry.id" :title="entry.description">
              <span class="offer">{{ entry.name }}</span>
              <span class="label">{{ entry.price }}</span>
            </li>
          </ul>
          <p v-else class="label offers">nothing offered yet</p>
        </li>
      </ul>
      <p v-else class="label">no merchants in the crew</p>
    </div>
  </PanelSection>
</template>

<style scoped>
.merchants {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.78rem;
}

.label {
  color: var(--ink-dim);
}

.value {
  font-variant-numeric: tabular-nums;
}

p {
  margin: 0;
}

.list,
.offers {
  margin: 0;
  padding: 0;
  list-style: none;
}

.list > li + li {
  margin-top: 0.35rem;
}

.merchant {
  display: grid;
  grid-template-columns: 1.1rem minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.4rem;
  padding: 0.1rem 0.25rem;
}

.name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.offers {
  padding-left: 1.75rem;
  font-size: 0.72rem;
}

.offers li {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
}

.offer {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
