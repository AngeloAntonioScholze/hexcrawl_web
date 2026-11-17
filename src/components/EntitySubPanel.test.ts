// @vitest-environment happy-dom
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { useSubPanels } from '../composables/useSubPanels'
import type { Entity, EntityKind } from '../entities/entity'
import { hexKey, range, type HexKey } from '../hex/coords'
import { useHexMapStore } from '../stores/hexMap'
import type { TerrainTile } from '../terrain/terrain'
import EntitySubPanel from './EntitySubPanel.vue'

const panels = useSubPanels()

const flatField = (radius: number): Map<HexKey, TerrainTile> =>
  new Map(
    range({ q: 0, r: 0 }, radius).map((hex) => [
      hexKey(hex),
      { hex, terrain: 'grass', height: 1, level: 1, elevation: 1.5, color: new Color3(0, 0, 0) },
    ]),
  )

/** The party walks two hexes onto the caravan and rides in it. */
const boarded = () => {
  const store = useHexMapStore()
  store.setTiles(flatField(6))
  const party = store.entities[0]
  const caravan = store.addEntity('Saltwind', 'caravan')!
  store.selectEntity(caravan.id)
  store.select({ q: 0, r: 0 })
  store.selectEntity(party.id)
  store.select({ q: 2, r: 0 })
  store.select({ q: 0, r: 0 })
  store.advanceTurn()
  store.advanceTurn()
  return { store, party, caravan }
}

const mountPanel = (entity: Entity, level: 1 | 2 = 1) =>
  mount(EntitySubPanel, {
    props: { entity, level, parentName: 'entities', parentInView: true },
    attachTo: document.body,
  })

const sections = (wrapper: ReturnType<typeof mountPanel>): string[] =>
  wrapper.findAll('section.psec').map((one) => one.find('.psec-name').text())

const added = (kind: EntityKind, name: string): Entity => {
  const store = useHexMapStore()
  return store.addEntity(name, kind)!
}

beforeEach(() => {
  setActivePinia(createPinia())
  panels.clear()
  document.body.innerHTML = ''
})

describe('EntitySubPanel', () => {
  it('shows a party its details, inventory and log, with an empty card slot', () => {
    const { store, party } = boarded()
    const wrapper = mountPanel(store.entities.find((one) => one.id === party.id)!)
    expect(sections(wrapper)).toEqual(['details', 'inventory', 'adventure log'])
    expect(wrapper.find('#sec-l1-person-details').exists()).toBe(true)
    expect(wrapper.find('#sec-l1-person-log').exists()).toBe(true)
    expect(wrapper.find('[data-testid="card-slot"]').element.children).toHaveLength(0)
    expect(wrapper.find('.psec-meta').text()).toBe('party')
  })

  it('gives an npc no inventory', () => {
    useHexMapStore()
    const wrapper = mountPanel(added('npc', 'Old Ferris'))
    expect(sections(wrapper)).toEqual(['details'])
    expect(wrapper.find('#sec-l1-person-details').exists()).toBe(true)
  })

  it('gives a ship its inventory and riders, and no supplies or merchants', () => {
    useHexMapStore()
    const wrapper = mountPanel(added('ship', 'Gull'))
    expect(sections(wrapper)).toEqual(['details', 'inventory', 'riders'])
    expect(wrapper.find('#sec-l1-ship-riders').text()).toContain('nobody aboard')
    expect(wrapper.find('[data-testid="card-slot"]').element.children).toHaveLength(0)
  })

  it('gives a moved npc and a moved ship their adventure log', () => {
    const store = useHexMapStore()
    const field = flatField(6)
    for (const [key, tile] of field) {
      if (tile.hex.q >= 3) field.set(key, { ...tile, terrain: 'water', height: -0.5 })
    }
    store.setTiles(field)
    const npc = added('npc', 'Old Ferris')
    const ship = added('ship', 'Gull')
    store.selectEntity(npc.id)
    store.select({ q: 0, r: 1 })
    store.select({ q: -2, r: 1 })
    store.selectEntity(ship.id)
    store.select({ q: 4, r: 0 })
    store.select({ q: 6, r: -1 })
    store.advanceTurn()
    store.advanceTurn()
    const current = (id: string) => store.entities.find((one) => one.id === id)!

    expect(store.hexesWalkedFor(npc.id)).toBeGreaterThan(0)
    expect(store.hexesWalkedFor(ship.id)).toBeGreaterThan(0)
    const person = mountPanel(current(npc.id))
    expect(sections(person)).toEqual(['details', 'adventure log'])
    expect(person.find('#sec-l1-person-log').exists()).toBe(true)
    person.unmount()
    const sailed = mountPanel(current(ship.id))
    expect(sections(sailed)).toEqual(['details', 'inventory', 'riders', 'adventure log'])
    expect(sailed.find('#sec-l1-ship-log').exists()).toBe(true)
  })

  it('gives the DM a caravan its whole sheet, with the bust row in the card slot', () => {
    const { store, caravan } = boarded()
    const wrapper = mountPanel(store.entities.find((one) => one.id === caravan.id)!)
    expect(sections(wrapper)).toEqual([
      'details',
      'supplies',
      'inventory',
      'riders',
      'merchants',
      'adventure log',
    ])
    expect(wrapper.find('#sec-l1-caravan-details').exists()).toBe(true)
    expect(wrapper.find('#sec-l1-caravan-riders').exists()).toBe(true)
    const slot = wrapper.find('[data-testid="card-slot"]')
    expect(slot.find('.bust-row').text()).toContain('bust')
    expect(slot.find('.bust-choose').attributes('title')).toBe('choose a bust for Saltwind')
    expect(wrapper.find('section.psec').find('.psec-meta').text()).toBe('caravan')
  })

  it('opens a rider at level 2 and selects it, the carrier staying open', async () => {
    const { store, party, caravan } = boarded()
    store.selectEntity(caravan.id)
    panels.open({ kind: 'entity', id: caravan.id }, 0)
    const wrapper = mountPanel(store.entities.find((one) => one.id === caravan.id)!)
    const rider = wrapper.find('.riders button')
    expect(rider.text()).toContain(party.name)
    expect(rider.text()).toContain('›')

    await rider.trigger('click')
    await nextTick()
    expect(store.selectedId).toBe(party.id)
    expect(panels.stack.value).toEqual([
      { kind: 'entity', id: caravan.id },
      { kind: 'entity', id: party.id },
    ])
    expect(wrapper.find('.riders button').attributes('aria-current')).toBe('true')
  })

  it('edits the open entity, not the selected one', async () => {
    const { store, party, caravan } = boarded()
    store.selectEntity(party.id)
    const wrapper = mountPanel(store.entities.find((one) => one.id === caravan.id)!)
    const pace = wrapper.find('input[aria-label="pace"]')
    ;(pace.element as HTMLInputElement).value = '2.5'
    await pace.trigger('input')
    const name = wrapper.find('input[aria-label="the entity\'s name"]')
    ;(name.element as HTMLInputElement).value = 'Dustwind'
    await name.trigger('change')

    const after = (id: string) => store.entities.find((one) => one.id === id)!
    expect(after(caravan.id).pacePerTurn).toBe(2.5)
    expect(after(caravan.id).name).toBe('Dustwind')
    expect(after(party.id).name).toBe(party.name)
  })

  it('logs the open entity, whoever is selected', () => {
    const { store, party, caravan } = boarded()
    store.selectEntity(caravan.id)
    const wrapper = mountPanel(store.entities.find((one) => one.id === party.id)!)
    const walked = store.hexesWalkedFor(party.id)
    expect(walked).toBeGreaterThan(0)
    expect(wrapper.find('#sec-l1-person-log .row .value').text()).toBe(String(walked))
    expect(wrapper.findAll('.journey li')).toHaveLength(store.adventureLogFor(party.id).length)
  })

  it('gives the dm the owner, hidden and hostile controls in details, and players none', async () => {
    const store = useHexMapStore()
    const npc = added('npc', 'Hob')
    const wrapper = mountPanel(npc)
    expect(wrapper.find('#sec-l1-person-details .dm-controls').exists()).toBe(true)
    store.dmView = false
    await nextTick()
    expect(wrapper.find('.dm-controls').exists()).toBe(false)
  })

  it('shows the DM caravan compact merchant rows, a click opening level 2', async () => {
    const { store, caravan } = boarded()
    const merchant = store.addMerchant(caravan.id, 'smith', 'Brann', 3)!
    panels.clear()
    panels.open({ kind: 'entity', id: caravan.id }, 0)
    const wrapper = mountPanel(store.entities.find((one) => one.id === caravan.id)!)
    const row = wrapper.get('button.merchant')
    expect(row.text()).toContain('lv 3')
    expect(wrapper.find('.stepper').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('nothing offered yet')
    await row.trigger('click')
    expect(panels.stack.value).toEqual([
      { kind: 'entity', id: caravan.id },
      { kind: 'merchant', id: merchant.id },
    ])
  })
})
