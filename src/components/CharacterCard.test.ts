// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { bustOf, FRAME_ART } from '../entities/busts'
import type { Entity } from '../entities/entity'
import BustPicker from './BustPicker.vue'
import CharacterCard from './CharacterCard.vue'

type CardEntity = Pick<Entity, 'id' | 'name' | 'kind' | 'owner' | 'hidden' | 'portrait'>

const entity = (change: Partial<CardEntity> = {}): CardEntity => ({
  id: 'e1',
  name: 'Wanderers',
  kind: 'party',
  owner: 'player',
  hidden: false,
  portrait: undefined,
  ...change,
})

const mountCard = (pickable: boolean, change: Partial<CardEntity> = {}) =>
  mount(CharacterCard, {
    props: { entity: entity(change), pickable },
    attachTo: document.body,
  })

describe('CharacterCard', () => {
  it('names the card after the entity and its kind', () => {
    expect(mountCard(false).attributes('aria-label')).toBe('Wanderers, party')
  })

  it('recolours when the entity is hidden, revealed or changes hands', async () => {
    const wrapper = mountCard(false, { owner: 'dm', hidden: true })
    expect(wrapper.attributes('data-variant')).toBe('crimson')
    await wrapper.setProps({ entity: entity({ owner: 'dm', hidden: false }) })
    expect(wrapper.attributes('data-variant')).toBe('bronze')
    await wrapper.setProps({ entity: entity({ owner: 'player', hidden: false }) })
    expect(wrapper.attributes('data-variant')).toBe('steel')
    expect(wrapper.find('img.art').attributes('src')).toBe(FRAME_ART.steel.frame)
  })

  it.each<[Partial<CardEntity>, string]>([
    [{}, 'steel'],
    [{ owner: 'dm' }, 'bronze'],
    [{ kind: 'caravan' }, 'bronze'],
    [{ owner: 'dm', hidden: true }, 'crimson'],
  ])('draws %o on the %s art', (change, variant) => {
    const wrapper = mountCard(false, change)
    expect(wrapper.attributes('data-variant')).toBe(variant)
    const art = FRAME_ART[variant as keyof typeof FRAME_ART]
    const img = wrapper.find('img.art')
    expect(img.attributes('src')).toBe(art.frame)
    expect(img.attributes('alt')).toBe('')
    expect(img.attributes('aria-hidden')).toBe('true')
    expect(wrapper.find('.window').attributes('style')).toContain(art.window)
  })

  it('places the window, name and slots on the art regions of its variant', () => {
    const wrapper = mount(CharacterCard, {
      props: { entity: entity({ kind: 'ship' }), pickable: true },
      slots: { slot1: '<b>a</b>', slot2: '<b>b</b>', slot3: '<b>c</b>' },
    })
    const { regions } = FRAME_ART.bronze
    expect(wrapper.find('.window').attributes('style')).toContain(`left: ${regions.window.left}%`)
    expect(wrapper.find('.pick').attributes('style')).toContain(`height: ${regions.pick.height}%`)
    expect(wrapper.find('.name').attributes('style')).toContain(`top: ${regions.banner.top}%`)
    const slots = wrapper.findAll('.slot')
    expect(slots).toHaveLength(3)
    slots.forEach((slot, index) =>
      expect(slot.attributes('style')).toContain(`left: ${regions.slots[index].left}%`),
    )
  })

  it('names the entity in the heading at the given level, the full name in its title', () => {
    const wrapper = mount(CharacterCard, {
      props: { entity: entity(), pickable: false, headingLevel: 4 },
    })
    expect(wrapper.find('h4.name').text()).toBe('Wanderers')
    expect(wrapper.find('h4.name').attributes('title')).toBe('Wanderers')
  })

  it('defaults to an h3 heading', () => {
    expect(mountCard(false).find('h3.name').text()).toBe('Wanderers')
  })

  it('fills only the slots it is given, in order', () => {
    expect(mountCard(false).find('.slot').exists()).toBe(false)
    const wrapper = mount(CharacterCard, {
      props: { entity: entity(), pickable: false },
      slots: { slot1: '<b>lv 3</b>', slot3: '<b>pace 1</b>' },
    })
    expect(wrapper.findAll('.slot').map((slot) => slot.text())).toEqual(['lv 3', 'pace 1'])
  })

  it('puts the body below the frame and leaves the wrapper out without it', () => {
    expect(mountCard(false).find('.body').exists()).toBe(false)
    const wrapper = mount(CharacterCard, {
      props: { entity: entity(), pickable: false },
      slots: { default: '<p class="inside">stats</p>' },
    })
    expect(wrapper.find('.frame .inside').exists()).toBe(false)
    expect(wrapper.find('.body .inside').text()).toBe('stats')
  })

  describe('plate', () => {
    it('leaves the bare plate without lines', () => {
      expect(mountCard(false).find('.plate').exists()).toBe(false)
      const wrapper = mount(CharacterCard, {
        props: { entity: entity(), pickable: false, plate: [] },
      })
      expect(wrapper.find('.plate').exists()).toBe(false)
    })

    it('shows up to two lines', () => {
      const wrapper = mount(CharacterCard, {
        props: {
          entity: entity(),
          pickable: false,
          plate: ['played by Angelo', 'riding Red Wagon', 'extra'],
        },
      })
      expect(wrapper.findAll('.plate .line').map((line) => line.text())).toEqual([
        'played by Angelo',
        'riding Red Wagon',
      ])
    })
  })

  it('shows the empty mark and no bust without a portrait', () => {
    const wrapper = mountCard(true)
    expect(wrapper.find('img.bust').exists()).toBe(false)
    expect(wrapper.find('svg.empty').exists()).toBe(true)
    expect(wrapper.find('.strip').text()).toBe('choose a bust')
    expect(wrapper.find('.pick').attributes('aria-label')).toBe('choose a bust for Wanderers')
  })

  it('marks an unknown bust id and keeps it in the title', () => {
    const wrapper = mountCard(true, { portrait: 'old-scenic' })
    expect(wrapper.find('img.bust').exists()).toBe(false)
    expect(wrapper.find('.strip').text()).toBe('unknown bust')
    expect(wrapper.find('.pick').attributes('title')).toBe('stored bust: old-scenic')
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
      const pick = wrapper.find('.pick')
      expect(pick.element.tagName).toBe('BUTTON')
      expect(pick.attributes('type')).toBe('button')
      expect(pick.attributes('aria-label')).toBe("change Wanderers's bust (now Knight)")
      expect(pick.attributes('title')).toBeUndefined()
      expect(wrapper.find('img.bust').attributes('alt')).toBe('')
      expect(wrapper.find('.strip').text()).toBe('change bust')
    })

    it('emits the bust picked in the picker', async () => {
      const wrapper = mountCard(true, { portrait: 'knight' })
      await wrapper.find('.pick').trigger('click')
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
      await wrapper.find('.pick').trigger('click')
      await wrapper.findComponent(BustPicker).find('button.none').trigger('click')
      expect(wrapper.emitted('bust')).toEqual([[null]])
    })
  })

  describe('read-only', () => {
    it('has no button, names the bust in its alt text and has no picker', () => {
      const wrapper = mountCard(false, { portrait: 'knight' })
      expect(wrapper.find('button').exists()).toBe(false)
      expect(wrapper.find('.strip').exists()).toBe(false)
      expect(wrapper.find('img.bust').attributes('alt')).toBe('Knight')
      expect(wrapper.findComponent(BustPicker).exists()).toBe(false)
    })
  })
})
