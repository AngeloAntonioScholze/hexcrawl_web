// @vitest-environment happy-dom
// @vitest-environment-options {"url": "http://localhost:5173/"}
import { gunzipSync } from 'node:zlib'
import type { PostHog } from 'posthog-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Analytics = typeof import('./analytics')

const fetchSpy = vi.fn(async () => new Response('{}', { status: 200 }))

const load = async (env: { token?: string; host?: string } = {}): Promise<Analytics> => {
  vi.stubEnv('VITE_POSTHOG_PROJECT_TOKEN', env.token ?? '')
  vi.stubEnv('VITE_POSTHOG_HOST', env.host ?? '')
  return import('./analytics')
}

const configuredEnv = { token: 'phc_test', host: 'https://ph.invalid' }

const posthogOf = async (): Promise<PostHog> => (await import('posthog-js')).default

const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i++) await new Promise((done) => setTimeout(done, 0))
}

/** Posthog saves a beat after a change; this waits for its cookie to land. */
const written = (): Promise<void> =>
  vi.waitFor(() => expect(document.cookie).toContain('ph_phc_test'), { timeout: 1000 })

const bodyOf = async (init: RequestInit): Promise<string> => {
  const bytes = new Uint8Array(await new Response(init.body).arrayBuffer())
  const raw = bytes[0] === 0x1f && bytes[1] === 0x8b ? gunzipSync(bytes) : bytes
  return new TextDecoder().decode(raw)
}

const clearCookies = (): void => {
  for (const pair of document.cookie.split(';')) {
    const name = pair.split('=')[0].trim()
    if (name) document.cookie = `${name}=; Max-Age=0; path=/`
  }
}

/** Every key anything wrote, wherever it went. */
const stored = (): { local: string[]; session: string[]; cookies: string } => ({
  local: Object.keys(localStorage).sort(),
  session: Object.keys(sessionStorage).sort(),
  cookies: document.cookie,
})

beforeEach(() => {
  vi.resetModules()
  localStorage.clear()
  sessionStorage.clear()
  clearCookies()
  fetchSpy.mockClear()
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(() => {
  history.replaceState(null, '', '/')
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('without env', () => {
  it('is unconfigured and does nothing, whatever is asked of it', async () => {
    const analytics = await load()
    expect(analytics.configured).toBe(false)

    analytics.startAnalytics()
    analytics.grant()
    analytics.capture('map_exported')
    analytics.setView('player')
    await settle()

    expect(analytics.consent.value).toBeNull()
    expect(stored()).toEqual({ local: [], session: [], cookies: '' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('needs both the token and the host', async () => {
    expect((await load({ token: 'phc_test' })).configured).toBe(false)
    vi.resetModules()
    expect((await load({ host: 'https://ph.invalid' })).configured).toBe(false)
  })

  it('ignores an answer stored while it was configured', async () => {
    localStorage.setItem('hexcrawl.analytics', 'granted')
    const analytics = await load()
    analytics.startAnalytics()
    await settle()
    expect(analytics.consent.value).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('before an answer', () => {
  it('stores nothing and sends nothing', async () => {
    const analytics = await load(configuredEnv)
    expect(analytics.configured).toBe(true)

    analytics.startAnalytics()
    analytics.capture('tool_used', { tool: 'paint' })
    analytics.captureException(new Error('boom'))
    analytics.setView('player')
    await settle()

    expect(analytics.consent.value).toBeNull()
    expect(stored()).toEqual({ local: [], session: [], cookies: '' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('decline', () => {
  it('stores only the answer and starts nothing', async () => {
    const analytics = await load(configuredEnv)
    analytics.startAnalytics()
    analytics.decline()
    analytics.capture('map_exported')
    await settle()

    expect(analytics.consent.value).toBe('declined')
    expect(stored()).toEqual({ local: ['hexcrawl.analytics'], session: [], cookies: '' })
    expect(localStorage.getItem('hexcrawl.analytics')).toBe('declined')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('is remembered on the next visit, still with nothing else stored', async () => {
    localStorage.setItem('hexcrawl.analytics', 'declined')
    const analytics = await load(configuredEnv)
    analytics.startAnalytics()
    await settle()
    expect(analytics.consent.value).toBe('declined')
    expect(stored()).toEqual({ local: ['hexcrawl.analytics'], session: [], cookies: '' })
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

describe('grant', () => {
  it('starts posthog with persistence, the super props and one pageview', async () => {
    const analytics = await load(configuredEnv)
    const posthog = await posthogOf()
    const init = vi.spyOn(posthog, 'init')
    const register = vi.spyOn(posthog, 'register')
    const capture = vi.spyOn(posthog, 'capture')

    analytics.setView('player')
    analytics.grant()
    await settle()

    expect(analytics.consent.value).toBe('granted')
    expect(localStorage.getItem('hexcrawl.analytics')).toBe('granted')
    expect(init).toHaveBeenCalledOnce()
    const config = init.mock.calls[0][1]!
    expect(config).toMatchObject({
      api_host: 'https://ph.invalid',
      persistence: 'localStorage+cookie',
      autocapture: false,
      disable_session_recording: true,
      capture_pageview: false,
    })
    expect(config).not.toHaveProperty('logs')
    expect(register).toHaveBeenCalledWith({ app: 'hexcrawl_web', view: 'player' })
    expect(capture.mock.calls.filter(([event]) => event === '$pageview')).toHaveLength(1)
    expect(posthog.has_opted_in_capturing()).toBe(true)
    expect(posthog.config.persistence).toBe('localStorage+cookie')
    await written()
    expect(stored().local.some((key) => key.startsWith('ph_phc_test'))).toBe(true)
  })

  it('picks a stored yes back up on the next visit', async () => {
    localStorage.setItem('hexcrawl.analytics', 'granted')
    const analytics = await load(configuredEnv)
    const posthog = await posthogOf()
    const init = vi.spyOn(posthog, 'init')

    analytics.startAnalytics()
    await settle()

    expect(analytics.consent.value).toBe('granted')
    expect(init).toHaveBeenCalledOnce()
  })

  it('updates the view super prop on a switch', async () => {
    const analytics = await load(configuredEnv)
    const posthog = await posthogOf()
    analytics.grant()
    await settle()
    const register = vi.spyOn(posthog, 'register')

    analytics.setView('player')

    expect(register).toHaveBeenCalledWith({ view: 'player' })
  })

  it('sends exceptions through posthog', async () => {
    const analytics = await load(configuredEnv)
    const posthog = await posthogOf()
    analytics.grant()
    await settle()
    const captureException = vi.spyOn(posthog, 'captureException')
    const error = new Error('boom')

    analytics.captureException(error)

    expect(captureException).toHaveBeenCalledWith(error)
  })

  it('sends no room code, even with one in the address bar', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Windows NT 10.0) Chrome/130 Safari/537.36',
    )
    vi.spyOn(navigator, 'webdriver', 'get').mockReturnValue(false)
    history.replaceState(null, '', '/?room=abc234')
    const analytics = await load(configuredEnv)
    const posthog = await posthogOf()
    const { scrubEvent } = await import('./scrub')
    const init = vi.spyOn(posthog, 'init')

    try {
      analytics.grant()
      analytics.capture('tool_used', { tool: 'paint' })
      await settle()
      posthog.capture('late', {}, { send_instantly: true })
      await settle()

      expect(init.mock.calls[0][1]!.before_send).toBe(scrubEvent)
      expect(location.search).toContain('abc234')
      const sent = await Promise.all(
        (fetchSpy.mock.calls as unknown as [string, RequestInit][]).map(([, init]) => bodyOf(init)),
      )
      expect(sent.length).toBeGreaterThan(0)
      expect(sent.join('')).not.toContain('abc234')
    } finally {
      // This instance outlives the test: opt out, then wait past its debounced saves.
      analytics.decline()
      await new Promise((done) => setTimeout(done, 400))
      localStorage.clear()
      clearCookies()
    }
  })
})

describe('revoking a yes', () => {
  it('leaves only the answer behind and stops sending', async () => {
    const analytics = await load(configuredEnv)
    const posthog = await posthogOf()
    analytics.grant()
    await written()

    analytics.decline()
    const capture = vi.spyOn(posthog, 'capture')
    analytics.capture('map_exported')
    // Past posthog's debounced save, which must not bring anything back.
    await new Promise((done) => setTimeout(done, 400))

    expect(analytics.consent.value).toBe('declined')
    expect(stored()).toEqual({ local: ['hexcrawl.analytics'], session: [], cookies: '' })
    expect(capture).not.toHaveBeenCalled()
    expect(posthog.has_opted_out_capturing()).toBe(true)
  })

  it('can be granted again in the same visit', async () => {
    const analytics = await load(configuredEnv)
    const posthog = await posthogOf()
    analytics.grant()
    await settle()
    analytics.decline()
    const capture = vi.spyOn(posthog, 'capture')

    analytics.grant()
    analytics.capture('map_exported')

    expect(posthog.has_opted_in_capturing()).toBe(true)
    expect(capture).toHaveBeenCalledWith('map_exported', {})
    await written()
  })

  it('declined while posthog is still loading, it never starts', async () => {
    const analytics = await load(configuredEnv)
    const posthog = await posthogOf()
    const init = vi.spyOn(posthog, 'init')

    analytics.grant()
    analytics.decline()
    await settle()

    expect(init).not.toHaveBeenCalled()
    expect(stored()).toEqual({ local: ['hexcrawl.analytics'], session: [], cookies: '' })
  })
})

describe('capture', () => {
  const granted = async (): Promise<{ analytics: Analytics; posthog: PostHog }> => {
    const analytics = await load(configuredEnv)
    const posthog = await posthogOf()
    analytics.grant()
    await settle()
    return { analytics, posthog }
  }

  it('sends the listed values of the listed properties', async () => {
    const { analytics, posthog } = await granted()
    const capture = vi.spyOn(posthog, 'capture')

    analytics.capture('tool_used', { tool: 'paint' })
    analytics.capture('map_created', { source: 'reseed' })
    analytics.capture('session_left', { role: 'guest' })
    analytics.capture('encounter_accepted')

    expect(capture.mock.calls).toEqual([
      ['tool_used', { tool: 'paint' }],
      ['map_created', { source: 'reseed' }],
      ['session_left', { role: 'guest' }],
      ['encounter_accepted', {}],
    ])
  })

  it('drops free text, unknown properties and unlisted values', async () => {
    const { analytics, posthog } = await granted()
    const capture = vi.spyOn(posthog, 'capture')
    const sneaky = { tool: 'paint', name: 'Sir Bob', seed: 1234 } as unknown as { tool: 'paint' }

    analytics.capture('tool_used', sneaky)
    analytics.capture('map_loaded', { source: 'my-map.json' } as unknown as { source: 'file' })
    analytics.capture('map_exported', ...([{ file: 'x.json' }] as unknown as []))

    expect(capture.mock.calls).toEqual([
      ['tool_used', { tool: 'paint' }],
      ['map_loaded', {}],
      ['map_exported', {}],
    ])
  })
})
