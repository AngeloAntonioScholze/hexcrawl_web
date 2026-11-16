// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { defineComponent, h } from 'vue'
import PanelSection from './PanelSection.vue'

const Pair = defineComponent({
  setup: () => () => [
    h(PanelSection, { foldKey: 'ship.riders', title: 'riders', scope: 'l1' }, () => 'one'),
    h(PanelSection, { foldKey: 'ship.riders', title: 'riders', scope: 'l2' }, () => 'two'),
  ],
})

describe('PanelSection', () => {
  it('keeps its plain ids without a scope', () => {
    const wrapper = mount(PanelSection, { props: { foldKey: 'caravan.riders', title: 'riders' } })
    expect(wrapper.find('.psec-body').attributes('id')).toBe('sec-caravan-riders')
    expect(wrapper.find('button').attributes('id')).toBe('sec-caravan-riders-head')
  })

  it('sets the ids apart by scope, and shares the fold state by key', async () => {
    const wrapper = mount(Pair)
    const bodies = wrapper.findAll('.psec-body')
    expect(bodies.map((one) => one.attributes('id'))).toEqual([
      'sec-l1-ship-riders',
      'sec-l2-ship-riders',
    ])
    expect(wrapper.findAll('button').map((one) => one.attributes('aria-controls'))).toEqual([
      'sec-l1-ship-riders',
      'sec-l2-ship-riders',
    ])

    await wrapper.findAll('button')[0].trigger('click')
    expect(wrapper.findAll('button').map((one) => one.attributes('aria-expanded'))).toEqual([
      'false',
      'false',
    ])
    await wrapper.findAll('button')[1].trigger('click')
    expect(wrapper.findAll('button').map((one) => one.attributes('aria-expanded'))).toEqual([
      'true',
      'true',
    ])
  })
})
