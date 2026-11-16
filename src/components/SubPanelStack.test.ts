// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import { useSubPanels, type ColumnMode } from '../composables/useSubPanels'
import { useHexMapStore } from '../stores/hexMap'
import SubPanelStack from './SubPanelStack.vue'

const panels = useSubPanels()

const setup = () => {
  const store = useHexMapStore()
  const caravan = store.addEntity('Saltwind', 'caravan')!
  const rider = store.entities[0]
  const merchant = store.addMerchant(caravan.id, 'smith', 'Brann')!
  return { store, caravan, rider, merchant }
}

const mountStack = (mode: ColumnMode) => mount(SubPanelStack, { props: { mode } })

const shown = (wrapper: ReturnType<typeof mountStack>) =>
  wrapper.findAll('aside').map((one) => ({
    level: one.attributes('data-level'),
    title: one.find('h2').text(),
    control: one.find('header button').attributes('aria-label'),
  }))

beforeEach(() => {
  setActivePinia(createPinia())
  panels.clear()
})

describe('SubPanelStack', () => {
  it('renders nothing with nothing open', () => {
    setup()
    expect(mountStack(3).findAll('aside')).toHaveLength(0)
  })

  it('shows both levels three-up, each closing with ×', () => {
    const { caravan, merchant } = setup()
    panels.open({ kind: 'entity', id: caravan.id }, 0)
    panels.open({ kind: 'merchant', id: merchant.id }, 1)
    expect(shown(mountStack(3))).toEqual([
      { level: '1', title: 'Saltwind', control: 'close Saltwind' },
      { level: '2', title: '🔨Brann', control: 'close Brann' },
    ])
  })

  it('shows only the deepest level two-up, with back to its carrier', () => {
    const { caravan, rider } = setup()
    panels.open({ kind: 'entity', id: caravan.id }, 0)
    panels.open({ kind: 'entity', id: rider.id }, 1)
    expect(shown(mountStack(2))).toEqual([
      { level: '2', title: rider.name, control: 'back to Saltwind' },
    ])
  })

  it('closes level 1 with × two-up, the dock being beside it', () => {
    const { caravan } = setup()
    panels.open({ kind: 'entity', id: caravan.id }, 0)
    expect(shown(mountStack(2))).toEqual([
      { level: '1', title: 'Saltwind', control: 'close Saltwind' },
    ])
  })

  it('stacked, steps back from level 1 to the entities list', () => {
    const { caravan } = setup()
    panels.open({ kind: 'entity', id: caravan.id }, 0)
    expect(shown(mountStack(1))).toEqual([
      { level: '1', title: 'Saltwind', control: 'back to entities' },
    ])
  })

  it('shows nothing for a panel whose entity is gone', () => {
    setup()
    panels.open({ kind: 'entity', id: 'nobody' }, 0)
    expect(mountStack(3).findAll('aside')).toHaveLength(0)
  })
})
