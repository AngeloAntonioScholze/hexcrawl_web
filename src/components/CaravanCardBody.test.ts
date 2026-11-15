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

const mountBody = (crew: Row[] = []) => mount(CaravanCardBody, { props: { merchants: crew } })

describe('CaravanCardBody', () => {
  describe('merchants', () => {
    it('shows six rows and no more-line for six merchants', () => {
      const wrapper = mountBody(merchants(6))
      expect(wrapper.findAll('li')).toHaveLength(6)
      expect(wrapper.find('.more').exists()).toBe(false)
    })

    it('shows five rows and a more-line for seven merchants', () => {
      const wrapper = mountBody(merchants(7))
      expect(wrapper.findAll('li')).toHaveLength(5)
      expect(wrapper.find('.more').text()).toBe('+2 more in merchants')
    })

    it('says so when there are none', () => {
      const wrapper = mountBody([])
      expect(wrapper.find('ul').exists()).toBe(false)
      expect(wrapper.find('.none').text()).toBe('no merchants')
    })

    it('reads each row out as name, type and level', () => {
      const wrapper = mountBody([{ id: 'a', name: 'Bran', type: 'smith', level: 4 }])
      expect(wrapper.find('li .sr-only').text()).toBe('Bran, Smith, level 4')
      expect(wrapper.find('li .sub').text()).toBe('Smith')
      expect(wrapper.find('li .pill').text()).toBe('lv 4')
    })

    it('drops the type line when the name is the type', () => {
      const wrapper = mountBody([{ id: 'a', name: 'Smith', type: 'smith', level: 1 }])
      expect(wrapper.find('li .sub').exists()).toBe(false)
      expect(wrapper.find('li .sr-only').text()).toBe('Smith, Smith, level 1')
    })
  })
})
