import { describe, expect, it } from 'vitest'
import { buildCsp } from './csp'

const directives = (policy: string): string[] => policy.split('; ').map((d) => d.split(' ')[0]!)

describe('buildCsp', () => {
  it('pins the directive list', () => {
    expect(directives(buildCsp(undefined))).toEqual([
      'default-src',
      'script-src',
      'worker-src',
      'connect-src',
      'img-src',
      'font-src',
      'style-src',
      'object-src',
      'base-uri',
    ])
  })

  it('leaves PostHog out when the host is unset', () => {
    expect(buildCsp(undefined)).toContain(
      "connect-src 'self' https://0.peerjs.com wss://0.peerjs.com;",
    )
    expect(buildCsp('')).not.toContain('posthog')
  })

  it('adds only the origin of the host', () => {
    const policy = buildCsp('https://eu.i.posthog.com/')
    expect(policy).toContain('wss://0.peerjs.com https://eu.i.posthog.com;')
    expect(buildCsp('http://localhost:8000')).toContain('http://localhost:8000;')
  })

  it.each([
    'https://a;sandbox',
    'https://a b',
    'eu.i.posthog.com',
    'javascript:alert(1)',
    'data:text/html,x',
    'ftp://a.com',
    'https://a.com/path',
    'https://u@a.com',
  ])('rejects %s, naming the variable', (host) => {
    expect(() => buildCsp(host)).toThrow(/VITE_POSTHOG_HOST/)
  })
})
