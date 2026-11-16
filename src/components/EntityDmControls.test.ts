// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import type { EntityKind, Owner } from '../entities/entity'
import { useHexMapStore } from '../stores/hexMap'
import EntityDmControls from './EntityDmControls.vue'

const setup = () => {
  const store = useHexMapStore()
  const make = (kind: EntityKind, owner: Owner, name = `${kind} ${owner}`) =>
    store.addEntity(name, kind, owner)!
  const live = (id: string) => store.entities.find((one) => one.id === id)!
  return { store, make, live }
}

const mountFor = (id: string) => {
  const store = useHexMapStore()
  return mount(
    defineComponent({
      render: () => h(EntityDmControls, { entity: store.entities.find((one) => one.id === id)! }),
    }),
    { attachTo: document.body },
  )
}

const select = (wrapper: ReturnType<typeof mountFor>) => wrapper.find('select')
const box = (wrapper: ReturnType<typeof mountFor>, name: string) =>
  wrapper.find(`input[aria-label="${name}"]`)

const HIDDEN = "kept off the players' map"
const HOSTILE = 'hostile to the players'

beforeEach(() => {
  setActivePinia(createPinia())
  document.body.innerHTML = ''
})

describe('the dm controls', () => {
  it.each<EntityKind>(['party', 'npc', 'caravan', 'ship'])(
    'shows the three rows for a %s',
    (kind) => {
      const { make } = setup()
      const wrapper = mountFor(make(kind, 'dm').id)
      expect(wrapper.findAll('label.row').map((row) => row.find('span').text())).toEqual([
        'owner',
        'hidden',
        'hostile',
      ])
    },
  )

  it('hands a hidden, hostile dm entity to the players, clearing both', async () => {
    const { make, live, store } = setup()
    const npc = make('npc', 'dm')
    store.setEntityHidden(npc.id, true)
    store.setEntityHostile(npc.id, true)
    const wrapper = mountFor(npc.id)
    await select(wrapper).setValue('player')
    expect(live(npc.id)).toMatchObject({ owner: 'player', hidden: false, hostile: false })
    for (const name of [HIDDEN, HOSTILE]) {
      expect((box(wrapper, name).element as HTMLInputElement).checked).toBe(false)
      expect(box(wrapper, name).attributes('disabled')).toBeDefined()
    }
  })

  it('hands an unseated player entity to the dm at once', async () => {
    const { make, live } = setup()
    const npc = make('npc', 'player')
    const wrapper = mountFor(npc.id)
    await select(wrapper).setValue('dm')
    expect(live(npc.id).owner).toBe('dm')
    expect(wrapper.find('dialog').attributes('open')).toBeUndefined()
  })

  describe('with a player seated', () => {
    const seated = () => {
      const ctx = setup()
      const party = ctx.make('party', 'player', 'Wanderers')
      ctx.store.assignEntity(party.id, 'Ana')
      return { ...ctx, party }
    }

    it('asks first and leaves the select on player', async () => {
      const { party } = seated()
      const wrapper = mountFor(party.id)
      await select(wrapper).setValue('dm')
      expect(wrapper.find('h2').text()).toBe('take Wanderers from Ana?')
      expect(wrapper.find('.body').text()).toContain('Ana plays Wanderers now.')
      expect((select(wrapper).element as HTMLSelectElement).value).toBe('player')
    })

    it('keeps everything as it was on "keep it with"', async () => {
      const { store, live, party } = seated()
      const wrapper = mountFor(party.id)
      await select(wrapper).setValue('dm')
      await wrapper.find('.actions button').trigger('click')
      expect(live(party.id).owner).toBe('player')
      expect(store.playerOf(party.id)).toBe('Ana')
      expect(wrapper.find('h2').exists()).toBe(false)
    })

    it.each([
      [
        'the close event',
        (wrapper: ReturnType<typeof mountFor>) => wrapper.find('dialog').trigger('close'),
      ],
      [
        'the × button',
        (wrapper: ReturnType<typeof mountFor>) => wrapper.find('.close').trigger('click'),
      ],
    ])('keeps owner and seat, and refocuses the select, on %s', async (_name, close) => {
      const { store, live, party } = seated()
      const wrapper = mountFor(party.id)
      await select(wrapper).setValue('dm')
      await nextTick()
      expect(document.activeElement).toBe(wrapper.find('.actions button').element)
      await close(wrapper)
      await nextTick()
      expect(live(party.id).owner).toBe('player')
      expect(store.playerOf(party.id)).toBe('Ana')
      expect(document.activeElement).toBe(select(wrapper).element)
    })

    it('keeps the player name in the dialog if they are unseated meanwhile', async () => {
      const { store, party } = seated()
      const wrapper = mountFor(party.id)
      await select(wrapper).setValue('dm')
      store.assignEntity(party.id, null)
      await nextTick()
      expect(wrapper.find('h2').text()).toBe('take Wanderers from Ana?')
    })

    it('unseats the player on "take it"', async () => {
      const { store, live, party } = seated()
      const wrapper = mountFor(party.id)
      await select(wrapper).setValue('dm')
      await wrapper.find('.actions .danger').trigger('click')
      await nextTick()
      expect(live(party.id).owner).toBe('dm')
      expect(store.playerOf(party.id)).toBeNull()
      expect(wrapper.find('h2').exists()).toBe(false)
      expect((select(wrapper).element as HTMLSelectElement).value).toBe('dm')
      expect(document.activeElement).toBe(select(wrapper).element)
    })
  })

  it('disables hidden, with its hint, for a player entity', () => {
    const { make } = setup()
    const npc = make('npc', 'player')
    const wrapper = mountFor(npc.id)
    expect(box(wrapper, HIDDEN).attributes('disabled')).toBeDefined()
    expect(wrapper.find(`#dm-${npc.id}-hidden-hint`).text()).toBe(
      "players' entities are always on the map",
    )
  })

  it('disables hidden at once when handed to the players', async () => {
    const { make } = setup()
    const npc = make('npc', 'dm')
    const wrapper = mountFor(npc.id)
    await select(wrapper).setValue('player')
    expect(box(wrapper, HIDDEN).attributes('disabled')).toBeDefined()
    expect(wrapper.find(`#dm-${npc.id}-hidden-hint`).exists()).toBe(true)
  })

  it('toggles hidden on a dm entity', async () => {
    const { make, live } = setup()
    const npc = make('npc', 'dm')
    const wrapper = mountFor(npc.id)
    expect(box(wrapper, HIDDEN).attributes('disabled')).toBeUndefined()
    await box(wrapper, HIDDEN).setValue(true)
    expect(live(npc.id).hidden).toBe(true)
    await box(wrapper, HIDDEN).setValue(false)
    expect(live(npc.id).hidden).toBe(false)
  })

  it('disables hostile, unchecked, with its hint, for a player entity', () => {
    const { make } = setup()
    const npc = make('npc', 'player')
    const wrapper = mountFor(npc.id)
    expect(box(wrapper, HOSTILE).attributes('disabled')).toBeDefined()
    expect((box(wrapper, HOSTILE).element as HTMLInputElement).checked).toBe(false)
    expect(wrapper.find(`#dm-${npc.id}-hostile-hint`).text()).toBe(
      "players' entities are never hostile",
    )
    expect(box(wrapper, HOSTILE).attributes('aria-describedby')).toBe(`dm-${npc.id}-hostile-hint`)
  })

  it('toggles hostile on a dm entity, with its hint', async () => {
    const { make, live } = setup()
    const npc = make('npc', 'dm')
    const wrapper = mountFor(npc.id)
    expect(box(wrapper, HOSTILE).attributes('disabled')).toBeUndefined()
    expect(wrapper.find(`#dm-${npc.id}-hostile-hint`).text()).toBe('players see it as a foe')
    expect(box(wrapper, HOSTILE).attributes('aria-describedby')).toBe(`dm-${npc.id}-hostile-hint`)
    await box(wrapper, HOSTILE).setValue(true)
    expect(live(npc.id).hostile).toBe(true)
    await box(wrapper, HOSTILE).setValue(false)
    expect(live(npc.id).hostile).toBe(false)
  })

  it.each<[boolean, boolean, string | null]>([
    [false, false, null],
    [true, false, 'handing it to the players also shows it on their map'],
    [false, true, 'handing it to the players also clears hostile'],
    [true, true, 'handing it to the players shows it on their map and clears hostile'],
  ])('owner hint for a dm entity hidden %s, hostile %s', (hidden, hostile, copy) => {
    const { make, store } = setup()
    const npc = make('npc', 'dm')
    store.setEntityHidden(npc.id, hidden)
    store.setEntityHostile(npc.id, hostile)
    const wrapper = mountFor(npc.id)
    const hint = wrapper.find(`#dm-${npc.id}-owner-hint`)
    if (copy === null) {
      expect(hint.exists()).toBe(false)
      expect(select(wrapper).attributes('aria-describedby')).toBeUndefined()
    } else {
      expect(hint.text()).toBe(copy)
      expect(select(wrapper).attributes('aria-describedby')).toBe(`dm-${npc.id}-owner-hint`)
    }
  })

  it('shows no owner hint for a player entity', () => {
    const { make } = setup()
    const player = make('npc', 'player')
    expect(mountFor(player.id).find(`#dm-${player.id}-owner-hint`).exists()).toBe(false)
  })

  it('gives each entity its own ids', () => {
    const { make } = setup()
    const one = mountFor(make('npc', 'dm', 'a').id)
    const two = mountFor(make('npc', 'dm', 'b').id)
    const ids = [...one.findAll('[id]'), ...two.findAll('[id]')].map((el) => el.attributes('id'))
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toHaveLength(4)
  })
})
