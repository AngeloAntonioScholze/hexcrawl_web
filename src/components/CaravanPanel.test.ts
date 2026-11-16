// @vitest-environment happy-dom
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { hexKey, range, type HexKey } from '../hex/coords'
import { useHexMapStore } from '../stores/hexMap'
import type { TerrainTile } from '../terrain/terrain'
import CaravanPanel from './CaravanPanel.vue'

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
  store.setPanelOpen('caravan', true)
  return { store, party, caravan }
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('CaravanPanel', () => {
  it('is not in the DM dock: the DM opens a caravan as a sub-panel', () => {
    boarded()
    expect(mount(CaravanPanel).find('aside').exists()).toBe(false)
  })

  it('shows the players the caravan they ride in, read-only', () => {
    const { store, party } = boarded()
    store.dmView = false
    const wrapper = mount(CaravanPanel)
    expect(wrapper.find('#panel-caravan-head').text()).toContain('Saltwind')
    expect(wrapper.findAll('.summary dt').map((one) => one.text())).toEqual([
      'standing',
      'headed',
      'pace',
    ])
    expect(wrapper.findAll('.psec-name').map((one) => one.text())).toEqual([
      'supplies',
      'inventory',
      'riders',
      'merchants',
    ])
    expect(wrapper.find('.list').text()).toContain(party.name)
    expect(wrapper.find('.bust-row').exists()).toBe(false)
  })

  it('tells the players when they travel with no caravan', () => {
    const store = useHexMapStore()
    store.setPanelOpen('caravan', true)
    store.dmView = false
    expect(mount(CaravanPanel).find('.empty').text()).toBe('not travelling with a caravan')
  })
})
