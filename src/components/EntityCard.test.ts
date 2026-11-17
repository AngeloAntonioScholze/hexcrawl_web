// @vitest-environment happy-dom
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { hexKey, range, type HexKey } from '../hex/coords'
import { useHexMapStore } from '../stores/hexMap'
import type { TerrainTile } from '../terrain/terrain'
import CaravanCardBody from './CaravanCardBody.vue'
import { hexes } from './cardMount'
import CharacterCard from './CharacterCard.vue'
import EntityCard from './EntityCard.vue'
import ShipCardBody from './ShipCardBody.vue'
import StatHexagon from './StatHexagon.vue'

const flat = (radius: number): Map<HexKey, TerrainTile> =>
  new Map(
    range({ q: 0, r: 0 }, radius).map((hex) => [
      hexKey(hex),
      { hex, terrain: 'grass', height: 1, level: 1, elevation: 1.5, color: new Color3(0, 0, 0) },
    ]),
  )

const setUp = () => {
  const store = useHexMapStore()
  store.setTiles(flat(8))
  return store
}

const cardOf = (id: string) => {
  const store = useHexMapStore()
  return mount(EntityCard, {
    props: { entity: store.entities.find((one) => one.id === id)!, headingLevel: 4 },
  })
}

const plate = (wrapper: ReturnType<typeof cardOf>): string[] =>
  wrapper.findAll('.plate .line').map((line) => line.text())

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('EntityCard', () => {
  it('gives a party level and gold to edit, sight read-only, and the stat hexagon', async () => {
    const store = setUp()
    const party = store.selectedEntity!
    const wrapper = cardOf(party.id)
    const slots = wrapper.findAll('.slot')
    expect(slots).toHaveLength(3)
    expect(slots[0]!.find('input').attributes('aria-label')).toBe('level')
    expect(slots[1]!.find('input').attributes('aria-label')).toBe('gold, in coins')
    expect(slots[2]!.find('[role="group"]').attributes('aria-label')).toBe(
      `sight ${hexes(party.sight)}`,
    )
    expect(slots[2]!.find('.word').text()).toBe('sight')
    expect(wrapper.find('h4.name').text()).toBe(party.name)
    expect(wrapper.findComponent(StatHexagon).props('editable')).toBe(true)

    await slots[0]!.find('input').setValue('4')
    await slots[1]!.find('input').setValue('1250')
    expect(store.characterOf(party.id)).toEqual({ level: 4, purse: 1250 })
  })

  it('sets an ability typed into the hexagon', async () => {
    const store = setUp()
    const party = store.selectedEntity!
    const wrapper = cardOf(party.id)
    await wrapper.find('input[aria-label="strength score"]').setValue('15')
    expect(store.abilitiesOf(party.id)?.strength).toBe(15)
  })

  it('gives an npc the same sheet as a party, played by the dm', () => {
    const store = setUp()
    const npc = store.addEntity('Old Ferris', 'npc')!
    store.setEntityOwner(npc.id, 'dm')
    store.setLevel(npc.id, 7)
    const wrapper = cardOf(npc.id)
    expect(wrapper.find('.slot input[aria-label="level"]').element).toHaveProperty('value', '7')
    expect(wrapper.find('.slot input[aria-label="gold, in coins"]').exists()).toBe(true)
    expect(wrapper.findComponent(StatHexagon).exists()).toBe(true)
    expect(plate(wrapper)).toEqual(['dm', 'standing'])
  })

  it('gives a caravan its gold to edit, pace and sight read-only, and its merchants', async () => {
    const store = setUp()
    const caravan = store.addEntity('Saltwind', 'caravan')!
    store.addMerchant(caravan.id, 'smith', 'Brann', 3)
    const wrapper = cardOf(caravan.id)
    const slots = wrapper.findAll('.slot')
    expect(slots).toHaveLength(3)
    expect(slots[0]!.find('input').attributes('aria-label')).toBe('caravan gold, in coins')
    expect(slots[1]!.find('[role="group"]').attributes('aria-label')).toBe(
      `pace ${hexes(caravan.pacePerTurn)} a turn`,
    )
    expect(slots[2]!.find('[role="group"]').attributes('aria-label')).toBe(
      `sight ${hexes(caravan.sight)}`,
    )
    expect(wrapper.findComponent(CaravanCardBody).text()).toContain('Brann')
    expect(wrapper.findComponent(StatHexagon).exists()).toBe(false)

    await slots[0]!.find('input').setValue('300')
    expect(store.suppliesOf(caravan.id).gold).toBe(300)
  })

  it('gives a ship pace and sight read-only, an empty third slot and the aboard list', () => {
    const store = setUp()
    const ship = store.addEntity('the ship', 'ship')!
    const wrapper = cardOf(ship.id)
    const labels = wrapper
      .findAll('.slot [role="group"]')
      .map((one) => one.attributes('aria-label'))
    expect(labels).toEqual([`pace ${hexes(ship.pacePerTurn)} a turn`, `sight ${hexes(ship.sight)}`])
    expect(wrapper.findAll('.slot')).toHaveLength(2)
    expect(wrapper.find('input').exists()).toBe(false)
    expect(wrapper.findComponent(ShipCardBody).exists()).toBe(true)
    expect(wrapper.findComponent(StatHexagon).exists()).toBe(false)
  })

  it('tells the DM who plays the party and how far it has to go', () => {
    const store = setUp()
    const party = store.selectedEntity!
    store.assignEntity(party.id, 'Mira')
    store.select({ q: 0, r: 0 })
    store.select({ q: 3, r: 0 })
    expect(store.plannedHexes).toHaveLength(3)
    expect(plate(cardOf(party.id))).toEqual(['played by Mira', '3 hexes to go'])
  })

  it('turns a picked bust into the entity portrait', () => {
    const store = setUp()
    const party = store.selectedEntity!
    const wrapper = cardOf(party.id)
    const card = wrapper.findComponent(CharacterCard)
    expect(card.props('pickable')).toBe(true)
    card.vm.$emit('bust', 'knight')
    expect(store.entities.find((one) => one.id === party.id)?.portrait).toBe('knight')
  })

  it('shows the players their party from the projection, with no picking and no seat', () => {
    const store = setUp()
    const party = store.selectedEntity!
    store.assignEntity(party.id, 'Mira')
    store.setLevel(party.id, 5)
    store.select({ q: 0, r: 0 })
    store.select({ q: 2, r: 0 })
    store.dmView = false
    const wrapper = cardOf(party.id)
    expect(wrapper.findComponent(CharacterCard).props('pickable')).toBe(false)
    expect(plate(wrapper)).toEqual(['2 hexes to go'])
    expect(wrapper.find('.slot input[aria-label="level"]').element).toHaveProperty('value', '5')
    expect(wrapper.findComponent(StatHexagon).exists()).toBe(true)
  })

  it('reads people from the projection in the player view, not the store', () => {
    const store = setUp()
    const npc = store.addEntity('Shade', 'npc')!
    store.setEntityOwner(npc.id, 'dm')
    store.setEntityHidden(npc.id, true)
    store.dmView = false
    const wrapper = mount(EntityCard, {
      props: { entity: store.entities.find((one) => one.id === npc.id)! },
    })
    // The store still holds the hidden npc's sheet; the projection never sent it.
    expect(store.characterOf(npc.id)).not.toBeNull()
    expect(wrapper.findAll('.slot')).toHaveLength(1)
    expect(wrapper.findComponent(StatHexagon).exists()).toBe(false)
  })
})
