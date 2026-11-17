// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { capture } from '../analytics/analytics'
import { useHexMapStore } from '../stores/hexMap'
import DmToolbar from './DmToolbar.vue'

vi.mock('../analytics/analytics', () => ({ capture: vi.fn() }))

const toolButton = (wrapper: ReturnType<typeof mount>, label: string) =>
  wrapper.findAll('.tools button').find((one) => one.text() === label)!

beforeEach(() => {
  setActivePinia(createPinia())
  vi.mocked(capture).mockClear()
})

describe('DmToolbar usage stats', () => {
  it('counts a tool when it is picked', async () => {
    const wrapper = mount(DmToolbar)
    await toolButton(wrapper, 'paint terrain').trigger('click')
    await toolButton(wrapper, 'river').trigger('click')
    expect(vi.mocked(capture).mock.calls).toEqual([
      ['tool_used', { tool: 'paint' }],
      ['tool_used', { tool: 'river' }],
    ])
  })

  it('does not count picking the tool already in hand', async () => {
    expect(useHexMapStore().dmTool).toBe('select')
    await toolButton(mount(DmToolbar), 'select').trigger('click')
    expect(capture).not.toHaveBeenCalled()
  })

  it('counts nothing per stroke or per hex painted', async () => {
    const store = useHexMapStore()
    const wrapper = mount(DmToolbar)
    await toolButton(wrapper, 'paint terrain').trigger('click')
    vi.mocked(capture).mockClear()

    store.startStroke({ q: 0, r: 0 })
    store.continueStroke({ q: 1, r: 0 })
    store.continueStroke({ q: 2, r: 0 })
    store.endStroke()
    await wrapper.find('.brush input').setValue('2')

    expect(capture).not.toHaveBeenCalled()
  })
})
