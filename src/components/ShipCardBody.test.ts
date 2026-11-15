// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import type { Entity } from '../entities/entity'
import ShipCardBody from './ShipCardBody.vue'

type Rider = Pick<Entity, 'id' | 'name' | 'kind' | 'color'>

const riders = (count: number): Rider[] =>
  Array.from({ length: count }, (_, index) => ({
    id: `r${index}`,
    name: `Rider ${index}`,
    kind: 'party',
    color: '#336699',
  }))

const mountBody = (aboard: Rider[] = []) => mount(ShipCardBody, { props: { riders: aboard } })

describe('ShipCardBody', () => {
  it('shows five riders and a more-line for seven', () => {
    const wrapper = mountBody(riders(7))
    expect(wrapper.findAll('li')).toHaveLength(5)
    expect(wrapper.find('.more').text()).toBe('+2 more aboard')
  })

  it('shows six riders and no more-line for six', () => {
    const wrapper = mountBody(riders(6))
    expect(wrapper.findAll('li')).toHaveLength(6)
    expect(wrapper.find('.more').exists()).toBe(false)
  })

  it('says so when nobody is aboard', () => {
    const wrapper = mountBody()
    expect(wrapper.find('ul').exists()).toBe(false)
    expect(wrapper.find('.none').text()).toBe('nobody aboard')
  })

  it('reads each rider out as name and kind, with its colour on the pip', () => {
    const wrapper = mountBody([{ id: 'a', name: 'Wanderers', kind: 'npc', color: '#ff0000' }])
    expect(wrapper.find('li .sr-only').text()).toBe('Wanderers, npc')
    expect(wrapper.find('li .pip').attributes('style')).toContain('background: #ff0000')
  })
})
