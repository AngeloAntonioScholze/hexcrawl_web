// @vitest-environment happy-dom
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { capture, setView } from '../analytics/analytics'
import { useDebugMode } from '../composables/useDebugMode'
import { useStage } from '../composables/useStage'
import { hexKey, range, type HexKey } from '../hex/coords'
import { serialiseMap } from '../persistence/mapFile'
import { useHexMapStore } from '../stores/hexMap'
import type { TerrainTile } from '../terrain/terrain'
import MapView from './MapView.vue'

vi.mock('../analytics/analytics', () => ({ capture: vi.fn(), setView: vi.fn() }))

const STUBS = [
  'HexCanvas',
  'DayNightDial',
  'DmToolbar',
  'EnterScreen',
  'HexDetails',
  'CaravanPanel',
  'MapList',
  'SessionBar',
  'InventoryList',
]

let wrapper: VueWrapper | null = null

const mountView = (stubToggle = true): VueWrapper => {
  Object.defineProperty(window, 'innerWidth', { value: 1600, configurable: true, writable: true })
  const stubs = Object.fromEntries(
    [...STUBS, ...(stubToggle ? ['ViewToggle'] : [])].map((name) => [name, true]),
  )
  wrapper = mount(MapView, { global: { stubs }, attachTo: document.body })
  return wrapper
}

const button = (view: VueWrapper, label: string) =>
  view.findAll('button').find((one) => one.text() === label)!

// happy-dom has no window.confirm to spy on.
const answerConfirm = (yes: boolean) => {
  const confirm = vi.fn(() => yes)
  vi.stubGlobal('confirm', confirm)
  return confirm
}

const calls = () => vi.mocked(capture).mock.calls

const flatField = (radius: number): Map<HexKey, TerrainTile> =>
  new Map(
    range({ q: 0, r: 0 }, radius).map((hex) => [
      hexKey(hex),
      { hex, terrain: 'grass', height: 1, level: 1, elevation: 1.5, color: new Color3(0, 0, 0) },
    ]),
  )

beforeEach(() => {
  setActivePinia(createPinia())
  useStage().veiled.value = false
  vi.mocked(capture).mockClear()
  vi.mocked(setView).mockClear()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  useDebugMode().value = false
  localStorage.clear()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('MapView usage stats: view_switched', () => {
  it('counts nothing when a stored player view is put back to the DM on mount', async () => {
    localStorage.setItem('hexcrawl.playerView', '1')
    const store = useHexMapStore()
    mountView()
    await nextTick()
    expect(store.dmView).toBe(true)
    expect(calls().filter(([event]) => event === 'view_switched')).toEqual([])
    expect(setView).toHaveBeenLastCalledWith('dm')
  })

  it('counts nothing when debug goes off while the DM peeks', async () => {
    useDebugMode().value = true
    const store = useHexMapStore()
    mountView()
    store.dmView = false
    await nextTick()
    expect(setView).toHaveBeenLastCalledWith('player')

    useDebugMode().value = false
    await nextTick()
    expect(store.dmView).toBe(true)
    expect(setView).toHaveBeenLastCalledWith('dm')
    expect(capture).not.toHaveBeenCalled()
  })

  it('counts each flip of the view switch, to the side it lands on', async () => {
    useDebugMode().value = true
    const view = mountView(false)
    await view.get('.view-toggle').trigger('click')
    await view.get('.view-toggle').trigger('click')
    expect(calls()).toEqual([
      ['view_switched', { to: 'player' }],
      ['view_switched', { to: 'dm' }],
    ])
  })
})

describe('MapView usage stats: world panel', () => {
  it('counts a reroll of the world as a map made by reseed', async () => {
    const store = useHexMapStore()
    const seed = store.terrain.seed
    await button(mountView(), 'roll a new world').trigger('click')
    expect(store.terrain.seed).not.toBe(seed)
    expect(calls()).toEqual([['map_created', { source: 'reseed' }]])
  })

  it('counts generated resources, and nothing when the replace is cancelled', async () => {
    const store = useHexMapStore()
    store.setTiles(flatField(6))
    const view = mountView()
    const confirm = answerConfirm(true)

    await button(view, 'generate resources').trigger('click')
    expect(calls()).toEqual([['resources_generated']])
    expect(store.resources.length).toBeGreaterThan(0)

    confirm.mockReturnValue(false)
    await button(view, 'generate resources').trigger('click')
    expect(confirm).toHaveBeenCalled()
    expect(calls()).toEqual([['resources_generated']])
  })

  it('counts an added entity by its kind only', async () => {
    const view = mountView()
    await view.get('#panel-entities .row select').setValue('npc')
    await button(view, 'add').trigger('click')
    expect(calls()).toEqual([['entity_added', { kind: 'npc' }]])
  })

  it('counts an export', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:map')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await button(mountView(), 'export map').trigger('click')
    expect(calls()).toEqual([['map_exported']])
  })

  describe('importing without storage', () => {
    const pick = async (view: VueWrapper): Promise<void> => {
      const input = view.get('input[type="file"]')
      const file = new File([serialiseMap(useHexMapStore().snapshot)], 'mine.hexmap')
      Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
      await input.trigger('change')
      await flushPromises()
    }

    it('counts the replaced map as loaded from a file', async () => {
      answerConfirm(true)
      const view = mountView()
      await pick(view)
      expect(calls()).toEqual([['map_loaded', { source: 'file' }]])
    })

    it('counts nothing when the replace is cancelled', async () => {
      const confirm = answerConfirm(false)
      const view = mountView()
      await pick(view)
      expect(confirm).toHaveBeenCalled()
      expect(capture).not.toHaveBeenCalled()
    })
  })
})
