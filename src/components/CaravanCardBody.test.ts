// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { Merchant, MerchantType } from '../entities/merchant'
import CaravanCardBody from './CaravanCardBody.vue'

type Row = Pick<Merchant, 'id' | 'name' | 'type' | 'level'>

const merchants = (count: number, type: MerchantType = 'smith'): Row[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `m${index}`,
    name: `Merchant ${index}`,
    type,
    level: index + 1,
  }))

const mountBody = (editable: boolean, gold = 120, crew: Row[] = []) =>
  mount(CaravanCardBody, { props: { gold, editable, merchants: crew } })

describe('CaravanCardBody', () => {
  describe('gold', () => {
    it('is an input labelled for the caravan when editable', () => {
      const input = mountBody(true).find('input')
      expect(input.attributes('aria-label')).toBe('caravan gold, in coins')
      expect((input.element as HTMLInputElement).value).toBe('120')
    })

    it('is text with no input when read-only', () => {
      const wrapper = mountBody(false)
      expect(wrapper.find('input').exists()).toBe(false)
      expect(wrapper.find('.tally .word').text()).toBe('gold')
      expect(wrapper.find('.tally .value').text()).toBe('120')
    })

    it('emits a committed value rounded to a whole coin', async () => {
      const wrapper = mountBody(true)
      await wrapper.find('input').setValue('2.6')
      expect(wrapper.emitted('gold')).toEqual([[3]])
    })

    it('emits nothing for an empty field and puts the stored gold back', async () => {
      const wrapper = mountBody(true)
      const input = wrapper.find('input')
      await input.setValue('')
      expect(wrapper.emitted('gold')).toBeUndefined()
      expect((input.element as HTMLInputElement).value).toBe('120')
    })

    it.each(['1001', '-1', '2.5'])('marks %s invalid while typing', async (raw) => {
      const wrapper = mountBody(true)
      const input = wrapper.find('input')
      ;(input.element as HTMLInputElement).value = raw
      await input.trigger('input')
      expect(input.attributes('aria-invalid')).toBe('true')
      expect(input.attributes('title')).toBe('a whole number from 0 to 1000')
    })

    it('does not mark a valid draft', async () => {
      const wrapper = mountBody(true)
      const input = wrapper.find('input')
      ;(input.element as HTMLInputElement).value = '500'
      await input.trigger('input')
      expect(input.attributes('aria-invalid')).toBeUndefined()
      expect(input.attributes('title')).toBeUndefined()
    })

    it('follows a new gold prop', async () => {
      const wrapper = mountBody(true)
      await wrapper.setProps({ gold: 340 })
      expect((wrapper.find('input').element as HTMLInputElement).value).toBe('340')
    })
  })

  describe('merchants', () => {
    it('shows six rows and no more-line for six merchants', () => {
      const wrapper = mountBody(false, 0, merchants(6))
      expect(wrapper.findAll('li')).toHaveLength(6)
      expect(wrapper.find('.more').exists()).toBe(false)
    })

    it('shows five rows and a more-line for seven merchants', () => {
      const wrapper = mountBody(false, 0, merchants(7))
      expect(wrapper.findAll('li')).toHaveLength(5)
      expect(wrapper.find('.more').text()).toBe('+2 more in merchants')
    })

    it('says so when there are none', () => {
      const wrapper = mountBody(false, 0, [])
      expect(wrapper.find('ul').exists()).toBe(false)
      expect(wrapper.find('.none').text()).toBe('no merchants')
    })

    it('reads each row out as name, type and level', () => {
      const wrapper = mountBody(false, 0, [{ id: 'a', name: 'Bran', type: 'smith', level: 4 }])
      expect(wrapper.find('li .sr-only').text()).toBe('Bran, Smith, level 4')
      expect(wrapper.find('li .sub').text()).toBe('Smith')
      expect(wrapper.find('li .pill').text()).toBe('lv 4')
    })

    it('drops the type line when the name is the type', () => {
      const wrapper = mountBody(false, 0, [{ id: 'a', name: 'Smith', type: 'smith', level: 1 }])
      expect(wrapper.find('li .sub').exists()).toBe(false)
      expect(wrapper.find('li .sr-only').text()).toBe('Smith, Smith, level 1')
    })
  })
})
