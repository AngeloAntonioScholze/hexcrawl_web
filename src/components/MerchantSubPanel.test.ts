// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { firstInvalidLevel, useSubPanels } from '../composables/useSubPanels'
import { MERCHANT_INFO } from '../entities/merchant'
import { useHexMapStore } from '../stores/hexMap'
import MerchantSubPanel from './MerchantSubPanel.vue'
import SubPanelStack from './SubPanelStack.vue'

const panels = useSubPanels()

const setup = () => {
  const store = useHexMapStore()
  const caravan = store.addEntity('Saltwind', 'caravan')!
  const merchant = store.addMerchant(caravan.id, 'smith', 'Brann', 2)!
  return { store, caravan, merchant }
}

const mountPanel = (merchantId: string) => {
  const store = useHexMapStore()
  const merchant = store.merchants.find((one) => one.id === merchantId)!
  return mount(MerchantSubPanel, {
    props: { merchant, parentName: 'Saltwind', parentInView: true },
  })
}

beforeEach(() => {
  setActivePinia(createPinia())
  panels.clear()
})

describe('MerchantSubPanel', () => {
  it('keeps an empty card slot first in the body', () => {
    const { merchant } = setup()
    const slot = mountPanel(merchant.id).get('[data-testid="card-slot"]')
    expect(slot.element.children).toHaveLength(0)
    expect(slot.element.previousElementSibling).toBeNull()
  })

  it('shows type, level and caravan, then the blurb', () => {
    const { merchant } = setup()
    const wrapper = mountPanel(merchant.id)
    expect(wrapper.get('dl').text()).toContain(MERCHANT_INFO.smith.label.toLowerCase())
    expect(wrapper.get('dl').text()).toContain('lv 2')
    expect(wrapper.get('dl').text()).toContain('Saltwind')
    expect(wrapper.get('p.dim').text()).toBe(MERCHANT_INFO.smith.blurb)
  })

  it('steps the level within its limits', async () => {
    const { store, caravan, merchant } = setup()
    panels.open({ kind: 'entity', id: caravan.id }, 0)
    panels.open({ kind: 'merchant', id: merchant.id }, 1)
    const wrapper = mount(SubPanelStack, { props: { mode: 3 } })
    const lower = () => wrapper.get('[aria-label="lower Brann\'s level"]')
    await wrapper.get('[aria-label="raise Brann\'s level"]').trigger('click')
    expect(store.merchants[0].level).toBe(3)
    await lower().trigger('click')
    await lower().trigger('click')
    expect(store.merchants[0].level).toBe(1)
    expect(lower().attributes('disabled')).toBeDefined()
  })

  it('lists offers with prices, or says nothing is offered', () => {
    const { merchant } = setup()
    const wrapper = mountPanel(merchant.id)
    const rows = wrapper.findAll('.offers li')
    expect(rows.length).toBeGreaterThan(0)
    expect(wrapper.text()).toContain('offers')
    expect(wrapper.find('.offers .line .dim').exists()).toBe(true)
  })

  it('removes the merchant with let go, which invalidates level 2', async () => {
    const { store, caravan, merchant } = setup()
    panels.open({ kind: 'entity', id: caravan.id }, 0)
    panels.open({ kind: 'merchant', id: merchant.id }, 1)
    const world = () => ({
      entityIds: new Set(store.entities.map((one) => one.id)),
      carrierOf: store.carrierOf,
      merchantCaravan: (id: string) =>
        store.merchants.find((one) => one.id === id)?.caravanId ?? null,
    })
    expect(firstInvalidLevel(panels.stack.value, world())).toBeNull()
    const stack = mount(SubPanelStack, { props: { mode: 3 } })
    expect(stack.findAll('aside')).toHaveLength(2)
    await stack.get('button.go').trigger('click')
    expect(store.merchants).toHaveLength(0)
    expect(stack.findAll('aside')).toHaveLength(1)
    expect(firstInvalidLevel(panels.stack.value, world())).toBe(2)
  })

  it('has no stepper or let go for players', () => {
    const { store, merchant } = setup()
    store.dmView = false
    const wrapper = mountPanel(merchant.id)
    expect(wrapper.find('.stepper').exists()).toBe(false)
    expect(wrapper.find('button.go').exists()).toBe(false)
    expect(wrapper.get('dl').text()).toContain('lv 2')
  })
})
