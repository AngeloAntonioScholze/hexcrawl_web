import { readonly, shallowRef } from 'vue'
import type { PostHog, PostHogConfig } from 'posthog-js'
import { scrubEvent } from './scrub'

type Consent = 'granted' | 'declined'
export type View = 'dm' | 'player'

const CONSENT_KEY = 'hexcrawl.analytics'

const token = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN as string | undefined
const host = import.meta.env.VITE_POSTHOG_HOST as string | undefined

/** Without both env values there is no prompt, no switch and nothing sent. */
export const configured = Boolean(token && host)

/**
 * Every event the app sends and the only values each property may take. Free
 * text never goes out: names, codes, seeds and file names stay in the browser.
 */
const EVENTS = {
  map_created: { source: ['new', 'reseed'] },
  map_loaded: { source: ['file', 'storage', 'session'] },
  map_exported: {},
  resources_generated: {},
  view_switched: { to: ['dm', 'player'] },
  tool_used: { tool: ['select', 'paint', 'fog', 'road', 'river'] },
  entity_added: { kind: ['party', 'caravan', 'npc', 'ship'] },
  turn_advanced: { advance_type: ['turn', 'phase'] },
  encounter_accepted: {},
  session_hosted: {},
  session_joined: {},
  session_left: { role: ['host', 'guest'] },
  session_join_decided: { decision: ['approved', 'declined'] },
  render_init_failed: { reason: ['no_webgl', 'context_lost', 'other'] },
} as const satisfies Record<string, Record<string, readonly string[]>>

type Events = typeof EVENTS
type EventName = keyof Events
type EventProps<E extends EventName> = {
  [P in keyof Events[E]]: Events[E][P] extends readonly (infer V)[] ? V : never
}

// Posthog's own keys: the persistence blob, its consent flag, its window ids.
const POSTHOG_KEY = /^(__)?ph_/

const CONFIG: Partial<PostHogConfig> = {
  defaults: '2026-08-30',
  persistence: 'localStorage+cookie',
  // A host-only cookie is one that can be found again to delete.
  cross_subdomain_cookie: false,
  // Posthog never captures or stores on its own say: only opt_in_capturing,
  // called right after init, turns it on, and opting out drops its storage.
  opt_out_capturing_by_default: true,
  opt_out_persistence_by_default: true,
  // A canvas app: nothing watches the DOM, the pointer or the frame.
  autocapture: false,
  rageclick: false,
  capture_dead_clicks: false,
  capture_heatmaps: false,
  capture_performance: false,
  capture_exceptions: false,
  capture_pageview: false,
  capture_pageleave: false,
  disable_session_recording: true,
  disable_surveys: true,
  disable_product_tours: true,
  disable_conversations: true,
  disable_web_experiments: true,
  disable_external_dependency_loading: true,
  advanced_disable_flags: true,
  person_profiles: 'identified_only',
  before_send: scrubEvent,
}

const readConsent = (): Consent | null => {
  try {
    const stored = localStorage.getItem(CONSENT_KEY)
    return stored === 'granted' || stored === 'declined' ? stored : null
  } catch {
    return null
  }
}

const writeConsent = (answer: Consent): void => {
  try {
    localStorage.setItem(CONSENT_KEY, answer)
  } catch {
    // Without storage the answer still holds for this visit.
  }
}

const answer = shallowRef<Consent | null>(configured ? readConsent() : null)

/** The visitor's answer; null until they give one, and always null unconfigured. */
export const consent = readonly(answer)

let client: PostHog | null = null
let loading: Promise<PostHog | null> | null = null
let view: View = 'dm'

const switchOn = (posthog: PostHog): void => {
  posthog.opt_in_capturing({ captureEventName: false })
  posthog.register({ app: 'hexcrawl_web', view })
  posthog.capture('$pageview')
}

// Posthog is only fetched and started once there is a yes, so before one there
// is no posthog code running to store or send anything.
const load = (): Promise<PostHog | null> =>
  (loading ??= import('posthog-js').then(
    ({ default: posthog }) => {
      if (answer.value !== 'granted') {
        loading = null
        return null
      }
      posthog.init(token!, { ...CONFIG, api_host: host! })
      client = posthog
      switchOn(posthog)
      return posthog
    },
    () => {
      loading = null
      return null
    },
  ))

const sweep = (store: Storage): void => {
  for (const key of Object.keys(store)) if (POSTHOG_KEY.test(key)) store.removeItem(key)
}

/** Removes whatever posthog wrote, wherever it wrote it. */
const purge = (): void => {
  try {
    sweep(localStorage)
    sweep(sessionStorage)
  } catch {
    // No storage, nothing in it.
  }
  for (const pair of document.cookie.split(';')) {
    const name = pair.split('=')[0].trim()
    if (POSTHOG_KEY.test(name)) document.cookie = `${name}=; Max-Age=0; path=/`
  }
}

/** Picks up a yes given on an earlier visit. */
export const startAnalytics = (): void => {
  if (configured && answer.value === 'granted') void load()
}

export const grant = (): void => {
  if (!configured) return
  writeConsent('granted')
  answer.value = 'granted'
  if (client) switchOn(client)
  else void load()
}

export const decline = (): void => {
  if (!configured) return
  writeConsent('declined')
  answer.value = 'declined'
  if (client) {
    client.opt_out_capturing()
    client.reset()
  }
  purge()
}

const send = (run: (posthog: PostHog) => void): void => {
  if (answer.value !== 'granted') return
  if (client) run(client)
  else
    void loading?.then((posthog) => {
      if (posthog && answer.value === 'granted') run(posthog)
    })
}

/** Only the listed values of the listed properties go out; anything else is dropped. */
const allowed = <E extends EventName>(
  event: E,
  props: object | undefined,
): Record<string, string> => {
  const rules: Record<string, readonly string[]> = EVENTS[event]
  const kept: Record<string, string> = {}
  for (const [key, value] of Object.entries(props ?? {})) {
    if (typeof value === 'string' && rules[key]?.includes(value)) kept[key] = value
  }
  return kept
}

export function capture<E extends EventName>(
  event: E,
  ...props: keyof Events[E] extends never ? [] : [EventProps<E>]
): void {
  if (!configured) return
  const properties = allowed(event, props[0])
  send((posthog) => posthog.capture(event, properties))
}

export const captureException = (error: unknown): void => {
  if (!configured) return
  send((posthog) => posthog.captureException(error))
}

/** Which side of the view switch the events that follow come from. */
export const setView = (next: View): void => {
  view = next
  if (configured) send((posthog) => posthog.register({ view }))
}
