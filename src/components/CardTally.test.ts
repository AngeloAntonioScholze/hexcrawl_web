// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import CardTally from './CardTally.vue'

type Props = InstanceType<typeof CardTally>['$props']

const level = (change: Partial<Props> = {}) =>
  mount(CardTally, {
    props: {
      word: 'lv',
      value: 3,
      editable: true,
      min: 1,
      max: 20,
      step: 1,
      label: 'level',
      invalidTitle: 'a whole number from 1 to 20',
      ...change,
    },
  })

const gold = (change: Partial<Props> = {}) =>
  level({
    word: 'gp',
    value: 1250,
    min: 0,
    max: 999999,
    label: 'gold, in coins',
    invalidTitle: 'a whole number from 0 to 999999',
    format: 'compact',
    ...change,
  })

describe('CardTally', () => {
  describe('editable', () => {
    it('is a labelled number input showing the stored value', () => {
      const wrapper = level()
      const input = wrapper.find('input')
      expect(input.attributes('aria-label')).toBe('level')
      expect(input.attributes('type')).toBe('number')
      expect(input.attributes('inputmode')).toBe('numeric')
      expect(input.attributes('min')).toBe('1')
      expect(input.attributes('max')).toBe('20')
      expect((input.element as HTMLInputElement).value).toBe('3')
      expect(wrapper.find('.word').text()).toBe('lv')
    })

    it('shows the full number while editing a compact value', () => {
      const input = gold({ value: 999999 }).find('input')
      expect((input.element as HTMLInputElement).value).toBe('999999')
    })

    it('commits a changed value rounded to a whole number', async () => {
      const wrapper = level()
      await wrapper.find('input').setValue('4.6')
      expect(wrapper.emitted('commit')).toEqual([[5]])
    })

    it('leaves clamping to the store', async () => {
      const wrapper = gold()
      await wrapper.find('input').setValue('1000000')
      expect(wrapper.emitted('commit')).toEqual([[1000000]])
    })

    it('commits nothing for an empty field and puts the stored value back', async () => {
      const wrapper = level()
      const input = wrapper.find('input')
      await input.setValue('')
      expect(wrapper.emitted('commit')).toBeUndefined()
      expect((input.element as HTMLInputElement).value).toBe('3')
      expect(input.attributes('aria-invalid')).toBeUndefined()
    })

    it.each<[string, () => ReturnType<typeof level>, string, string]>([
      ['level', () => level(), '21', 'a whole number from 1 to 20'],
      ['gold', () => gold(), '1000000', 'a whole number from 0 to 999999'],
      ['gold', () => gold(), '2.5', 'a whole number from 0 to 999999'],
    ])('marks an invalid %s draft %s with its limits', async (_, make, raw, title) => {
      const wrapper = make()
      const input = wrapper.find('input')
      ;(input.element as HTMLInputElement).value = raw
      await input.trigger('input')
      expect(input.attributes('aria-invalid')).toBe('true')
      expect(input.attributes('title')).toBe(title)
      await input.trigger('change')
      expect(input.attributes('aria-invalid')).toBeUndefined()
    })

    it('does not mark a valid draft', async () => {
      const wrapper = level()
      const input = wrapper.find('input')
      ;(input.element as HTMLInputElement).value = '7'
      await input.trigger('input')
      expect(input.attributes('aria-invalid')).toBeUndefined()
      expect(input.attributes('title')).toBeUndefined()
    })

    it('drops a draft typed back unchanged on blur', async () => {
      const wrapper = level()
      const input = wrapper.find('input')
      const element = input.element as HTMLInputElement
      element.value = ''
      await input.trigger('input')
      element.value = '3'
      await input.trigger('input')
      await input.trigger('blur')
      expect(wrapper.emitted('commit')).toBeUndefined()
      await wrapper.setProps({ value: 9 })
      expect(element.value).toBe('9')
    })

    it('keeps a draft when the stored value changes mid-edit', async () => {
      const wrapper = level()
      const input = wrapper.find('input')
      ;(input.element as HTMLInputElement).value = '12'
      await input.trigger('input')
      await wrapper.setProps({ value: 8 })
      expect((input.element as HTMLInputElement).value).toBe('12')
    })
  })

  describe('read-only', () => {
    it('is a named group of text with no input', () => {
      const wrapper = level({ editable: false })
      expect(wrapper.find('input').exists()).toBe(false)
      const group = wrapper.find('[role="group"]')
      expect(group.attributes('aria-label')).toBe('level 3')
      expect(group.find('.word').text()).toBe('lv')
      expect(group.find('.value').text()).toBe('3')
      expect(group.attributes('title')).toBeUndefined()
    })

    it('takes a group label of its own', () => {
      const wrapper = level({
        editable: false,
        word: 'pace',
        value: 1.5,
        format: 'decimal',
        label: 'pace',
        groupLabel: 'pace 1.5 hexes a turn',
      })
      expect(wrapper.find('[role="group"]').attributes('aria-label')).toBe('pace 1.5 hexes a turn')
    })

    it.each<[number, string]>([
      [1250, '1250'],
      [9999, '9999'],
      [12500, '12.5K'],
      [10000, '10K'],
      [999999, '1M'],
    ])('shows gold %i as %s, the full number in the title when shortened', (value, text) => {
      const wrapper = gold({ editable: false, value })
      expect(wrapper.find('.value').text()).toBe(text)
      expect(wrapper.find('[role="group"]').attributes('title')).toBe(
        text === String(value) ? undefined : String(value),
      )
    })

    it.each<[number, string]>([
      [1, '1'],
      [1.5, '1.5'],
      [0.25, '0.3'],
    ])('shows a decimal %s with at most one decimal place', (value, text) => {
      const wrapper = level({ editable: false, value, format: 'decimal' })
      expect(wrapper.find('.value').text()).toBe(text)
    })
  })
})
