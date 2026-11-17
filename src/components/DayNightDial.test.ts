// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { capture } from '../analytics/analytics'
import { useHexMapStore } from '../stores/hexMap'
import DayNightDial from './DayNightDial.vue'

vi.mock('../analytics/analytics', () => ({ capture: vi.fn() }))

beforeEach(() => {
  setActivePinia(createPinia())
  vi.mocked(capture).mockClear()
})

describe('DayNightDial usage stats', () => {
  it('counts a turn let pass', async () => {
    const store = useHexMapStore()
    const wrapper = mount(DayNightDial)
    await wrapper.get('button[title="let a turn pass"]').trigger('click')
    expect(store.turn).toBe(1)
    expect(vi.mocked(capture).mock.calls).toEqual([['turn_advanced', { advance_type: 'turn' }]])
  })

  it('counts a skip to the next phase', async () => {
    const wrapper = mount(DayNightDial)
    await wrapper.get('.skip').trigger('click')
    expect(vi.mocked(capture).mock.calls).toEqual([['turn_advanced', { advance_type: 'phase' }]])
  })

  it('counts nothing for winding a turn back', async () => {
    const store = useHexMapStore()
    store.advanceTurn()
    const wrapper = mount(DayNightDial)
    await wrapper.get('button[title="take the last turn back"]').trigger('click')
    expect(capture).not.toHaveBeenCalled()
  })
})
