// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { h } from 'vue'
import { useSubPanels } from '../composables/useSubPanels'
import SubPanelFrame from './SubPanelFrame.vue'

const panels = useSubPanels()

const mountFrame = (level: 1 | 2, parentInView: boolean, slots = {}) =>
  mount(SubPanelFrame, {
    props: { level, name: 'Saltwind', parentName: 'Old Road', parentInView },
    slots,
    attachTo: document.body,
  })

beforeEach(() => {
  panels.clear()
  panels.open({ kind: 'entity', id: 'a' }, 0)
  panels.open({ kind: 'merchant', id: 'm' }, 1)
})

describe('SubPanelFrame', () => {
  it('is labelled by its title, which takes focus by script only', () => {
    const wrapper = mountFrame(2, true)
    const title = wrapper.find('h2')
    expect(title.attributes('id')).toBe('col-2-title')
    expect(title.attributes('tabindex')).toBe('-1')
    expect(wrapper.find('aside').attributes('aria-labelledby')).toBe('col-2-title')
    expect(title.text()).toBe('Saltwind')
    wrapper.unmount()
  })

  it('closes with × while its parent is in view', async () => {
    const wrapper = mountFrame(2, true)
    expect(wrapper.find('.back').exists()).toBe(false)
    const close = wrapper.find('.close')
    expect(close.attributes('aria-label')).toBe('close Saltwind')
    expect(close.attributes('title')).toBe('close')
    await close.trigger('click')
    expect(panels.stack.value).toEqual([{ kind: 'entity', id: 'a' }])
    wrapper.unmount()
  })

  it('steps back with ‹ before the title while its parent is out of view', async () => {
    const wrapper = mountFrame(2, false)
    expect(wrapper.find('.close').exists()).toBe(false)
    const back = wrapper.find('header > :first-child')
    expect(back.classes()).toContain('back')
    expect(back.attributes('aria-label')).toBe('back to Old Road')
    await back.trigger('click')
    expect(panels.stack.value).toEqual([{ kind: 'entity', id: 'a' }])
    wrapper.unmount()
  })

  it('closes its level and every deeper one on Escape', async () => {
    const wrapper = mountFrame(1, false, { default: () => h('input', { class: 'field' }) })
    await wrapper.find('.field').trigger('keydown', { key: 'Escape' })
    expect(panels.stack.value).toEqual([])
    wrapper.unmount()
  })

  it('leaves Escape to an open dialog inside it', async () => {
    const wrapper = mountFrame(1, false, {
      default: () => h('dialog', { open: true }, [h('button', { class: 'inside' })]),
    })
    await wrapper.find('.inside').trigger('keydown', { key: 'Escape' })
    expect(panels.stack.value).toHaveLength(2)
    wrapper.unmount()
  })

  it('ignores other keys', async () => {
    const wrapper = mountFrame(1, false)
    await wrapper.find('h2').trigger('keydown', { key: 'Enter' })
    expect(panels.stack.value).toHaveLength(2)
    wrapper.unmount()
  })

  it('starts its body with an empty card slot', () => {
    const wrapper = mountFrame(1, true, { default: () => h('p', 'details') })
    const first = wrapper.find('.body > :first-child')
    expect(first.attributes('data-testid')).toBe('card-slot')
    expect(first.text()).toBe('')
    expect(first.element.children).toHaveLength(0)
    wrapper.unmount()
  })

  it('puts the card slot content in the card slot', () => {
    const wrapper = mountFrame(1, true, { card: () => h('div', { class: 'bust-row' }) })
    expect(wrapper.find('[data-testid="card-slot"] .bust-row').exists()).toBe(true)
    wrapper.unmount()
  })
})
