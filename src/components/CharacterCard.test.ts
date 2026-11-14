// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { bustOf } from '../entities/busts'
import type { Entity } from '../entities/entity'
import BustPicker from './BustPicker.vue'
import CharacterCard from './CharacterCard.vue'

type CardEntity = Pick<Entity, 'id' | 'name' | 'kind' | 'owner' | 'portrait'>

const entity = (change: Partial<CardEntity> = {}): CardEntity => ({
  id: 'e1',
  name: 'Wanderers',
  kind: 'party',
  owner: 'player',
  portrait: undefined,
  ...change,
})

const mountCard = (pickable: boolean, change: Partial<CardEntity> = {}) =>
  mount(CharacterCard, {
    props: { entity: entity(change), pickable },
    attachTo: document.body,
  })

describe('CharacterCard', () => {
  it('shows the empty mark and no bust without a portrait', () => {
    const wrapper = mountCard(true)
    expect(wrapper.find('img.bust').exists()).toBe(false)
    expect(wrapper.find('svg.empty').exists()).toBe(true)
    expect(wrapper.find('.strip').text()).toBe('choose a bust')
    expect(wrapper.find('.oval').attributes('aria-label')).toBe('choose a bust for Wanderers')
  })

  it('names the entity in the heading at the given level', () => {
    const wrapper = mount(CharacterCard, {
      props: { entity: entity(), pickable: false, headingLevel: 4 },
    })
    expect(wrapper.find('h4.name').text()).toBe('Wanderers')
  })

  it('defaults to an h3 heading', () => {
    const wrapper = mountCard(false)
    expect(wrapper.find('h3.name').text()).toBe('Wanderers')
  })

  it('wraps slot content and leaves the wrapper out without it', () => {
    expect(mountCard(false).find('.slot').exists()).toBe(false)
    const slotted = mount(CharacterCard, {
      props: { entity: entity(), pickable: false },
      slots: { default: '<p class="inside">stats</p>' },
    })
    expect(slotted.find('.slot .inside').text()).toBe('stats')
  })

  it('marks an unknown bust id and keeps it in the title', () => {
    const wrapper = mountCard(true, { portrait: 'old-scenic' })
    expect(wrapper.find('img.bust').exists()).toBe(false)
    expect(wrapper.find('.strip').text()).toBe('unknown bust')
    expect(wrapper.find('.oval').attributes('title')).toBe('stored bust: old-scenic')
  })

  it('falls back to the empty mark when the picture fails to load', async () => {
    const wrapper = mountCard(true, { portrait: 'knight' })
    const img = wrapper.find('img.bust')
    expect(img.attributes('src')).toBe(bustOf('knight')?.url)
    await img.trigger('error')
    expect(wrapper.find('img.bust').exists()).toBe(false)
    expect(wrapper.find('svg.empty').exists()).toBe(true)
    expect(wrapper.find('.strip').text()).toBe('choose a bust')
  })

  describe('pickable', () => {
    it('is a button labelled with the current bust, its picture decorative', () => {
      const wrapper = mountCard(true, { portrait: 'knight' })
      const oval = wrapper.find('.oval')
      expect(oval.element.tagName).toBe('BUTTON')
      expect(oval.attributes('aria-label')).toBe("change Wanderers's bust (now Knight)")
      expect(oval.attributes('title')).toBeUndefined()
      expect(wrapper.find('img.bust').attributes('alt')).toBe('')
      expect(wrapper.find('.strip').text()).toBe('change bust')
    })

    it('emits the bust picked in the picker', async () => {
      const wrapper = mountCard(true, { portrait: 'knight' })
      await wrapper.find('.oval').trigger('click')
      expect(wrapper.findComponent(BustPicker).props('open')).toBe(true)
      const ranger = wrapper
        .findComponent(BustPicker)
        .findAll('button')
        .find((button) => button.text() === 'Ranger')
      await ranger?.trigger('click')
      expect(wrapper.emitted('bust')).toEqual([['ranger']])
    })

    it('emits null for no bust', async () => {
      const wrapper = mountCard(true, { portrait: 'knight' })
      await wrapper.find('.oval').trigger('click')
      await wrapper.findComponent(BustPicker).find('button.none').trigger('click')
      expect(wrapper.emitted('bust')).toEqual([[null]])
    })
  })

  describe('read-only', () => {
    it('is a plain div with the bust named in its alt text and no picker', async () => {
      const wrapper = mountCard(false, { portrait: 'knight' })
      const oval = wrapper.find('.oval')
      expect(oval.element.tagName).toBe('DIV')
      expect(oval.attributes('aria-label')).toBeUndefined()
      expect(wrapper.find('img.bust').attributes('alt')).toBe('Knight')
      expect(wrapper.find('.strip').exists()).toBe(false)
      expect(wrapper.findComponent(BustPicker).exists()).toBe(false)
      await oval.trigger('click')
      expect(wrapper.emitted('bust')).toBeUndefined()
    })
  })
})
