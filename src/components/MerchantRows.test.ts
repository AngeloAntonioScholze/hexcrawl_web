// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useSubPanels } from '../composables/useSubPanels'
import { useHexMapStore } from '../stores/hexMap'
import MerchantRows from './MerchantRows.vue'

const panels = useSubPanels()

beforeEach(() => {
  setActivePinia(createPinia())
  panels.clear()
})

describe('MerchantRows', () => {
  it('says so when the crew has no merchants', () => {
    const store = useHexMapStore()
    const caravan = store.addEntity('Saltwind', 'caravan')!
    const wrapper = mount(MerchantRows, { props: { caravanId: caravan.id } })
    expect(wrapper.text()).toContain('no merchants in the crew')
  })

  it('shows icon, name, type label when different, and level', () => {
    const store = useHexMapStore()
    const caravan = store.addEntity('Saltwind', 'caravan')!
    store.addMerchant(caravan.id, 'smith', 'Brann', 3)
    const row = mount(MerchantRows, { props: { caravanId: caravan.id } }).get('button.merchant')
    expect(row.text()).toContain('Brann')
    expect(row.text()).toContain('smith')
    expect(row.text()).toContain('lv 3')
    expect(row.text()).toContain('›')
  })

  it('opens the merchant at level 2 on click and marks it current', async () => {
    const store = useHexMapStore()
    const caravan = store.addEntity('Saltwind', 'caravan')!
    const merchant = store.addMerchant(caravan.id, 'smith', 'Brann')!
    panels.open({ kind: 'entity', id: caravan.id }, 0)
    const wrapper = mount(MerchantRows, { props: { caravanId: caravan.id } })
    expect(wrapper.get('button.merchant').attributes('aria-current')).toBeUndefined()
    await wrapper.get('button.merchant').trigger('click')
    expect(panels.stack.value).toEqual([
      { kind: 'entity', id: caravan.id },
      { kind: 'merchant', id: merchant.id },
    ])
    expect(wrapper.get('button.merchant').attributes('aria-current')).toBe('true')
  })

  it('offers add merchant to the DM only', () => {
    const store = useHexMapStore()
    const caravan = store.addEntity('Saltwind', 'caravan')!
    const wrapper = mount(MerchantRows, { props: { caravanId: caravan.id } })
    expect(wrapper.find('button.open').exists()).toBe(true)
    store.dmView = false
    return wrapper.vm.$nextTick().then(() => {
      expect(wrapper.find('button.open').exists()).toBe(false)
    })
  })
})
