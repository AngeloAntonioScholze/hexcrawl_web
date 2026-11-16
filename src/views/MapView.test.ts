// @vitest-environment happy-dom
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { useDebugMode } from '../composables/useDebugMode'
import { useStage } from '../composables/useStage'
import { useSubPanels } from '../composables/useSubPanels'
import { hexKey, range, type HexKey } from '../hex/coords'
import { useHexMapStore } from '../stores/hexMap'
import { useSessionStore } from '../stores/session'
import type { TerrainTile } from '../terrain/terrain'
import MapView from './MapView.vue'

const STUBS = [
  'HexCanvas',
  'DayNightDial',
  'DmToolbar',
  'EnterScreen',
  'HexDetails',
  'CaravanPanel',
  'MapList',
  'SessionBar',
  'ViewToggle',
  'InventoryList',
]

const panels = useSubPanels()
let wrapper: VueWrapper | null = null

const setWidth = (width: number): void => {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true })
}

const flatField = (radius: number): Map<HexKey, TerrainTile> =>
  new Map(
    range({ q: 0, r: 0 }, radius).map((hex) => [
      hexKey(hex),
      { hex, terrain: 'grass', height: 1, level: 1, elevation: 1.5, color: new Color3(0, 0, 0) },
    ]),
  )

/** With `aboard`, the party walks two hexes onto the caravan and rides in it. */
const mountAt = (width: number, aboard = false) => {
  setWidth(width)
  const store = useHexMapStore()
  const party = store.entities[0]
  const caravan = store.addEntity('Saltwind', 'caravan')!
  if (aboard) {
    store.setTiles(flatField(6))
    store.selectEntity(caravan.id)
    store.select({ q: 0, r: 0 })
    store.selectEntity(party.id)
    store.select({ q: 2, r: 0 })
    store.select({ q: 0, r: 0 })
    store.advanceTurn()
    store.advanceTurn()
  }
  wrapper = mount(MapView, {
    global: { stubs: Object.fromEntries(STUBS.map((name) => [name, true])) },
    attachTo: document.body,
  })
  return { view: wrapper, store, party, caravan }
}

const row = (view: VueWrapper, name: string) =>
  view.findAll('.entities li > button:not(.open)').find((one) => one.text().includes(name))!

const openButton = (view: VueWrapper, name: string) =>
  view.find(`.entities button[aria-label="open ${name}"]`)

const subColumns = (view: VueWrapper): string =>
  (view.find('main').element as HTMLElement).style.getPropertyValue('--sub-columns')

beforeEach(() => {
  setActivePinia(createPinia())
  panels.clear()
  useStage().veiled.value = false
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  useDebugMode().value = false
})

describe('MapView sub-panel columns', () => {
  it('shows a › open button on every list row', () => {
    const { view, party } = mountAt(1600)
    expect(openButton(view, party.name).attributes('title')).toBe('open')
    expect(openButton(view, 'Saltwind').exists()).toBe(true)
  })

  it.each([1280, 1600])('at %ipx, a row click selects and opens beside the dock', async (width) => {
    const { view, store, caravan } = mountAt(width)
    await row(view, 'Saltwind').trigger('click')
    await nextTick()
    expect(store.selectedId).toBe(caravan.id)
    expect(panels.stack.value).toEqual([{ kind: 'entity', id: caravan.id }])
    expect(view.find('.subpanels').classes()).not.toContain('stacked')
    expect(view.find('.subpanels #col-1-title').text()).toBe('Saltwind')
    expect(row(view, 'Saltwind').attributes('aria-current')).toBe('true')
    expect(subColumns(view)).toBe('1')
    expect(view.find('.panels').attributes('inert')).toBeUndefined()
  })

  it.each([1280, 1600])('at %ipx, a click on the selected row keeps it selected', async (width) => {
    const { view, store, caravan } = mountAt(width)
    store.selectEntity(caravan.id)
    await row(view, 'Saltwind').trigger('click')
    await row(view, 'Saltwind').trigger('click')
    expect(store.selectedId).toBe(caravan.id)
    expect(panels.stack.value).toEqual([{ kind: 'entity', id: caravan.id }])
  })

  it('lowers the session bar while a column is beside the dock', async () => {
    useSessionStore().role = 'host'
    const { view } = mountAt(1600)
    expect(view.find('session-bar-stub').classes()).not.toContain('lowered')
    await openButton(view, 'Saltwind').trigger('click')
    expect(view.find('session-bar-stub').classes()).toContain('lowered')
  })

  it('stacked, the session bar is not lowered', async () => {
    useSessionStore().role = 'host'
    const { view } = mountAt(1024)
    await openButton(view, 'Saltwind').trigger('click')
    expect(view.find('session-bar-stub').classes()).not.toContain('lowered')
  })

  it('gives rider rows › and aria-current too', async () => {
    const { view, store, party, caravan } = mountAt(1600, true)
    expect(store.carrierOf(party.id)).toBe(caravan.id)
    const riderRow = view.find('.riders li > button:not(.open)')
    expect(riderRow.text()).toContain(party.name)
    await view.find(`.riders button[aria-label="open ${party.name}"]`).trigger('click')
    expect(store.selectedId).toBe(party.id)
    expect(panels.stack.value).toEqual([{ kind: 'entity', id: party.id }])
    expect(view.find('.riders li > button:not(.open)').attributes('aria-current')).toBe('true')
  })

  it('empties the stack when the enter screen comes back up', async () => {
    const { view } = mountAt(1600)
    await openButton(view, 'Saltwind').trigger('click')
    useStage().veiled.value = true
    await nextTick()
    expect(panels.stack.value).toEqual([])
  })

  it('removing the open entity from the dock puts focus on the entities header', async () => {
    const { view } = mountAt(1600)
    await openButton(view, 'Saltwind').trigger('click')
    await nextTick()
    const remove = view.findAll('button').find((one) => one.text() === 'remove Saltwind')!
    ;(remove.element as HTMLElement).focus()
    await remove.trigger('click')
    await nextTick()
    await nextTick()
    expect(panels.stack.value).toEqual([])
    expect(document.activeElement?.id).toBe('panel-entities-head')
  })

  it('moves focus to the opened title, and back to › on close', async () => {
    const { view } = mountAt(1600)
    const open = openButton(view, 'Saltwind')
    ;(open.element as HTMLElement).focus()
    await open.trigger('click')
    await nextTick()
    expect(document.activeElement?.id).toBe('col-1-title')

    await view.find('.subpanels button[aria-label="close Saltwind"]').trigger('click')
    await nextTick()
    expect(panels.stack.value).toEqual([])
    expect(document.activeElement).toBe(open.element)
  })

  it('› selects without ever putting the selection down', async () => {
    const { view, store, caravan } = mountAt(1600)
    store.selectEntity(caravan.id)
    await openButton(view, 'Saltwind').trigger('click')
    expect(store.selectedId).toBe(caravan.id)
    expect(panels.stack.value).toHaveLength(1)
  })

  it.each([360, 768, 1024])('at %ipx (stacked), a row click only selects', async (width) => {
    const { view, store, caravan } = mountAt(width)
    await row(view, 'Saltwind').trigger('click')
    expect(store.selectedId).toBe(caravan.id)
    expect(panels.stack.value).toEqual([])
    expect(view.find('.subpanels').exists()).toBe(false)
  })

  it('stacked, a click on the selected row puts the selection down, as before', async () => {
    const { view, store, caravan } = mountAt(1024)
    store.selectEntity(caravan.id)
    await row(view, 'Saltwind').trigger('click')
    expect(store.selectedId).toBe('')
    expect(panels.stack.value).toEqual([])
  })

  it('stacked, › opens in the dock box, hides the dock, and back brings it back', async () => {
    const { view, store, caravan } = mountAt(1024)
    const open = openButton(view, 'Saltwind')
    ;(open.element as HTMLElement).focus()
    await open.trigger('click')
    await nextTick()
    expect(store.selectedId).toBe(caravan.id)
    expect(view.find('.subpanels').classes()).toContain('stacked')
    expect(view.find('.panels').classes()).toContain('behind')
    expect(view.find('.panels').attributes('inert')).toBeDefined()
    expect(subColumns(view)).toBe('0')

    await view.find('.subpanels button[aria-label="back to entities"]').trigger('click')
    await nextTick()
    expect(view.find('.subpanels').exists()).toBe(false)
    expect(view.find('.panels').classes()).not.toContain('behind')
    expect(view.find('.panels').attributes('inert')).toBeUndefined()
    expect(document.activeElement).toBe(open.element)
  })

  it('stacked, level 2 shows alone and back steps out one level', async () => {
    const { view, caravan, store } = mountAt(1024)
    const merchant = store.addMerchant(caravan.id, 'smith', 'Brann')!
    panels.open({ kind: 'entity', id: caravan.id }, 0)
    panels.open({ kind: 'merchant', id: merchant.id }, 1)
    await nextTick()
    expect(view.findAll('.subpanels aside').map((one) => one.attributes('data-level'))).toEqual([
      '2',
    ])
    await view.find('.subpanels button[aria-label="back to Saltwind"]').trigger('click')
    await nextTick()
    expect(view.findAll('.subpanels aside').map((one) => one.attributes('data-level'))).toEqual([
      '1',
    ])
  })

  it('counts the shown columns into --sub-columns as the width changes', async () => {
    const { view, caravan, store } = mountAt(1600)
    const merchant = store.addMerchant(caravan.id, 'smith', 'Brann')!
    panels.open({ kind: 'entity', id: caravan.id }, 0)
    panels.open({ kind: 'merchant', id: merchant.id }, 1)
    await nextTick()
    expect(subColumns(view)).toBe('2')

    setWidth(1280)
    window.dispatchEvent(new Event('resize'))
    await nextTick()
    expect(panels.stack.value).toHaveLength(2)
    expect(subColumns(view)).toBe('1')
    expect(view.findAll('.subpanels aside').map((one) => one.attributes('data-level'))).toEqual([
      '2',
    ])

    setWidth(1000)
    window.dispatchEvent(new Event('resize'))
    await nextTick()
    expect(panels.stack.value).toHaveLength(2)
    expect(subColumns(view)).toBe('0')
  })

  it('closes the focused level on Escape and hands focus to the parent title', async () => {
    const { view, caravan, store } = mountAt(1600)
    const merchant = store.addMerchant(caravan.id, 'smith', 'Brann')!
    panels.open({ kind: 'entity', id: caravan.id }, 0)
    panels.open({ kind: 'merchant', id: merchant.id }, 1)
    await nextTick()
    const close = view.find('.subpanels button[aria-label="close Brann"]')
    ;(close.element as HTMLElement).focus()
    await close.trigger('keydown', { key: 'Escape' })
    await nextTick()
    expect(panels.stack.value).toEqual([{ kind: 'entity', id: caravan.id }])
    expect(document.activeElement?.id).toBe('col-1-title')
  })

  it('empties the stack when the level-1 entity is removed', async () => {
    const { view, caravan, store } = mountAt(1600)
    await openButton(view, 'Saltwind').trigger('click')
    await nextTick()
    ;(view.find('#col-1-title').element as HTMLElement).focus()
    store.removeEntity(caravan.id)
    await nextTick()
    await nextTick()
    expect(panels.stack.value).toEqual([])
    expect(document.activeElement?.id).toBe('panel-entities-head')
  })

  it('closes level 2 when its merchant is let go', async () => {
    const { caravan, store } = mountAt(1600)
    const merchant = store.addMerchant(caravan.id, 'smith', 'Brann')!
    panels.open({ kind: 'entity', id: caravan.id }, 0)
    panels.open({ kind: 'merchant', id: merchant.id }, 1)
    await nextTick()
    store.removeMerchant(merchant.id)
    await nextTick()
    expect(panels.stack.value).toEqual([{ kind: 'entity', id: caravan.id }])
  })

  it('closes level 2 when the rider is not aboard the level-1 entity', async () => {
    const { caravan, party } = mountAt(1600)
    panels.open({ kind: 'entity', id: caravan.id }, 0)
    panels.open({ kind: 'entity', id: party.id }, 1)
    await nextTick()
    expect(panels.stack.value).toEqual([{ kind: 'entity', id: caravan.id }])
  })

  it('empties the stack on a dmView change, and players get no columns', async () => {
    const { view, store, party } = mountAt(1600)
    await openButton(view, 'Saltwind').trigger('click')
    useDebugMode().value = true
    store.dmView = false
    await nextTick()
    expect(panels.stack.value).toEqual([])
    expect(openButton(view, party.name).exists()).toBe(false)
  })
})
