// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { shallowRef } from 'vue'

const analytics = vi.hoisted(() => ({
  configured: true,
  consent: null as unknown as { value: 'granted' | 'declined' | null },
  grant: vi.fn(),
  decline: vi.fn(),
}))

vi.mock('../analytics/analytics', () => analytics)

const { default: EnterScreen } = await import('./EnterScreen.vue')

const mountScreen = () =>
  mount(EnterScreen, { global: { stubs: { HostForm: true, JoinForm: true } } })

beforeEach(() => {
  setActivePinia(createPinia())
  analytics.configured = true
  analytics.consent = shallowRef(null)
  analytics.grant.mockReset().mockImplementation(() => (analytics.consent.value = 'granted'))
  analytics.decline.mockReset().mockImplementation(() => (analytics.consent.value = 'declined'))
})

describe('EnterScreen usage stats switch', () => {
  it('is hidden when analytics is not configured', () => {
    analytics.configured = false
    analytics.consent.value = 'granted'
    expect(mountScreen().find('.stats-switch').exists()).toBe(false)
  })

  it('is hidden until there is an answer: the prompt asks first', () => {
    expect(mountScreen().find('.stats-switch').exists()).toBe(false)
  })

  it('shows on once granted, and switching it declines', async () => {
    analytics.consent.value = 'granted'
    const wrapper = mountScreen()
    const toggle = wrapper.get('.stats-switch')
    expect(toggle.attributes('role')).toBe('switch')
    expect(toggle.attributes('aria-checked')).toBe('true')
    expect(toggle.text()).toBe('Share usage stats: on')

    await toggle.trigger('click')
    expect(analytics.decline).toHaveBeenCalledTimes(1)
    expect(analytics.grant).not.toHaveBeenCalled()
    expect(toggle.attributes('aria-checked')).toBe('false')
    expect(toggle.text()).toBe('Share usage stats: off')
  })

  it('shows off once declined, and switching it grants', async () => {
    analytics.consent.value = 'declined'
    const wrapper = mountScreen()
    const toggle = wrapper.get('.stats-switch')
    expect(toggle.attributes('aria-checked')).toBe('false')

    await toggle.trigger('click')
    expect(analytics.grant).toHaveBeenCalledTimes(1)
    expect(analytics.decline).not.toHaveBeenCalled()
    expect(toggle.attributes('aria-checked')).toBe('true')
  })
})
