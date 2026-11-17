// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, shallowRef } from 'vue'

const analytics = vi.hoisted(() => ({
  configured: true,
  consent: null as unknown as { value: 'granted' | 'declined' | null },
  grant: vi.fn(),
  decline: vi.fn(),
}))

vi.mock('../analytics/analytics', () => analytics)

const { default: ConsentPrompt } = await import('./ConsentPrompt.vue')

const reserve = (): string => document.documentElement.style.getPropertyValue('--consent-reserve')

const strip = (matches: boolean): void => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  )
}

const withOutside = defineComponent({
  setup: () => () => [h('button', { id: 'outside' }, 'outside'), h(ConsentPrompt)],
})

beforeEach(() => {
  analytics.configured = true
  analytics.consent = shallowRef(null)
  analytics.grant.mockReset().mockImplementation(() => (analytics.consent.value = 'granted'))
  analytics.decline.mockReset().mockImplementation(() => (analytics.consent.value = 'declined'))
  strip(false)
  document.body.innerHTML = ''
  document.documentElement.style.removeProperty('--consent-reserve')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ConsentPrompt', () => {
  it('shows nothing when analytics is not configured', () => {
    analytics.configured = false
    const wrapper = mount(ConsentPrompt)
    expect(wrapper.find('section').exists()).toBe(false)
  })

  it('shows nothing once there is an answer', () => {
    analytics.consent.value = 'declined'
    expect(mount(ConsentPrompt).find('section').exists()).toBe(false)
  })

  it('is a named region with the copy and two equal buttons, share first', () => {
    const wrapper = mount(ConsentPrompt, { attachTo: document.body })
    const section = wrapper.get('section')
    expect(section.attributes('aria-labelledby')).toBe('consent-title')
    expect(section.attributes('role')).toBeUndefined()
    expect(section.attributes('aria-modal')).toBeUndefined()
    expect(wrapper.get('#consent-title').text()).toBe('Usage stats')
    expect(wrapper.get('p').text()).toBe(
      'Count which tools and views get used, to make hexcrawl better. Never your maps or names.',
    )
    const buttons = wrapper.findAll('button')
    expect(buttons.map((one) => one.text())).toEqual(['Share stats', "Don't share"])
    expect(buttons.map((one) => one.attributes('type'))).toEqual(['button', 'button'])
    expect(buttons.map((one) => one.classes())).toEqual([[], []])
    // It never takes focus on its own.
    expect(section.element.contains(document.activeElement)).toBe(false)
  })

  it('Share stats grants and the prompt goes', async () => {
    const wrapper = mount(ConsentPrompt)
    await wrapper.findAll('button')[0].trigger('click')
    expect(analytics.grant).toHaveBeenCalledOnce()
    expect(analytics.decline).not.toHaveBeenCalled()
    expect(wrapper.find('section').exists()).toBe(false)
  })

  it("Don't share declines and the prompt goes", async () => {
    const wrapper = mount(ConsentPrompt)
    await wrapper.findAll('button')[1].trigger('click')
    expect(analytics.decline).toHaveBeenCalledOnce()
    expect(analytics.grant).not.toHaveBeenCalled()
    expect(wrapper.find('section').exists()).toBe(false)
  })

  it('still goes when the answer throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    analytics.grant.mockImplementation(() => {
      throw new Error('no posthog')
    })
    const wrapper = mount(ConsentPrompt)
    await wrapper.findAll('button')[0].trigger('click')
    expect(analytics.consent.value).toBeNull()
    expect(wrapper.find('section').exists()).toBe(false)
  })

  it('ignores Escape: there is no dismissing it without an answer', async () => {
    const wrapper = mount(ConsentPrompt, { attachTo: document.body })
    const share = wrapper.findAll('button')[0]
    ;(share.element as HTMLElement).focus()
    await share.trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('section').exists()).toBe(true)
    expect(analytics.grant).not.toHaveBeenCalled()
    expect(analytics.decline).not.toHaveBeenCalled()
  })

  it('hands focus back to where it came from once answered', async () => {
    const wrapper = mount(withOutside, { attachTo: document.body })
    const outside = wrapper.get('#outside').element as HTMLElement
    const decline = wrapper.findAll('section button')[1]
    outside.focus()
    ;(decline.element as HTMLElement).focus()
    await decline.trigger('focusin', { relatedTarget: outside })

    await decline.trigger('click')
    await nextTick()

    expect(document.activeElement).toBe(outside)
  })

  it('leaves focus alone when it was not in the prompt', async () => {
    const wrapper = mount(withOutside, { attachTo: document.body })
    const outside = wrapper.get('#outside').element as HTMLElement
    outside.focus()
    await wrapper.findAll('section button')[0].trigger('click')
    expect(document.activeElement).toBe(outside)
  })

  it('reserves its height only in strip mode, and gives it back once answered', async () => {
    strip(true)
    const wrapper = mount(ConsentPrompt, { attachTo: document.body })
    await nextTick()
    expect(reserve()).toMatch(/^\d+px$/)

    await wrapper.findAll('button')[1].trigger('click')
    await nextTick()
    expect(reserve()).toBe('')
  })

  it('reserves nothing as a card', async () => {
    mount(ConsentPrompt, { attachTo: document.body })
    await nextTick()
    expect(reserve()).toBe('')
  })

  it('gives the reserve back when unmounted', async () => {
    strip(true)
    const wrapper = mount(ConsentPrompt, { attachTo: document.body })
    await nextTick()
    wrapper.unmount()
    expect(reserve()).toBe('')
  })
})
