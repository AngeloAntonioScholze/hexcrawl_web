// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { capture } from '../analytics/analytics'
import { useSessionStore } from '../stores/session'
import SessionBar from './SessionBar.vue'

vi.mock('../analytics/analytics', () => ({ capture: vi.fn() }))

beforeEach(() => {
  setActivePinia(createPinia())
  vi.mocked(capture).mockClear()
})

describe('SessionBar usage stats', () => {
  it.each(['host', 'guest'] as const)('counts a %s leaving, by role only', async (role) => {
    const session = useSessionStore()
    session.role = role
    const wrapper = mount(SessionBar)
    await wrapper.get('.leave').trigger('click')
    expect(vi.mocked(capture).mock.calls).toEqual([['session_left', { role }]])
    expect(session.role).toBeNull()
  })
})
