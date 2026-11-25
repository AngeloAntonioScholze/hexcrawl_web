import type { RefusalReason, SessionMessage } from './messages'
import { plainName } from './names'

/**
 * Who may sit at the host's table. Names are matched by their key (see
 * nameKey), so "Mira" and " mira" are one player; `known` keeps the form
 * they were first admitted under, for display. Names are not secret: every
 * guest sees the tokens named after them. A name that holds a seat comes back
 * past the lock only by proving the secret the host gave it when it was first
 * let in. Every function returns a new state and leaves the one it was given alone.
 */
export interface Admission {
  /** No new names; names that prove their seat's secret still come back. */
  locked: boolean
  /** New names wait for the DM to accept them. */
  approval: boolean
  /** Name key to display name, for everyone admitted so far, online or not. */
  known: ReadonlyMap<string, string>
  /** Name key to the peer connected under it now. */
  online: ReadonlyMap<string, string>
  /** Name keys turned away for good this session. */
  kicked: ReadonlySet<string>
  /** Peer id to the name it is waiting under. */
  pending: ReadonlyMap<string, string>
  /** Name key to the seat secret handed out under it this session. */
  secrets: ReadonlyMap<string, string>
}

export type Reply = Extract<SessionMessage, { type: 'welcome' | 'pending' | 'refused' }>

export interface Decision {
  state: Admission
  reply: Reply
}

/**
 * What a hello brings besides its name: `held` is the secret the map keeps
 * for that name from an earlier session, `proven` the secret the hello's
 * proof was checked against and matched (see proves).
 */
export interface Claim {
  held?: string
  proven?: string
}

/** One key for every way of typing a name: its plain form (see plainName), lower-cased. */
export const nameKey = (name: string): string => plainName(name).toLowerCase()

const SECRET_BYTES = 16

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

/** 128 random bits, as hex: a seat secret, a challenge nonce or a table id. */
export const newSecret = (): string => toHex(crypto.getRandomValues(new Uint8Array(SECRET_BYTES)))

const sameText = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * What a guest sends for a seat instead of its secret: HMAC-SHA256 under the
 * secret of the host's nonce and the name, so it is good for one connection
 * and one name only.
 */
export async function seatProof(secret: string, nonce: string, name: string): Promise<string> {
  const raw = Uint8Array.from(secret.match(/../g) ?? [], (pair) => parseInt(pair, 16))
  const key = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  const message = new TextEncoder().encode(`${nonce}|${nameKey(name)}`)
  return toHex(new Uint8Array(await crypto.subtle.sign('HMAC', key, message)))
}

/** Whether a hello's proof is the one `secret` makes for this nonce and name. */
export const proves = async (
  proof: string,
  secret: string,
  nonce: string,
  name: string,
): Promise<boolean> => sameText(proof, await seatProof(secret, nonce, name))

/** The secret a name must prove: the one this room handed out, else the one the map kept. */
export const secretToProve = (state: Admission, name: string, saved?: string): string | undefined =>
  state.secrets.get(nameKey(name)) ?? saved

/** A room before anyone says hello; `known` are names to list as players, as display names. */
export const openRoom = (
  options: { locked?: boolean; approval?: boolean; known?: Iterable<string> } = {},
): Admission => ({
  locked: options.locked ?? false,
  approval: options.approval ?? false,
  known: new Map([...(options.known ?? [])].map((name) => [nameKey(name), name.trim()])),
  online: new Map(),
  kicked: new Set(),
  pending: new Map(),
  secrets: new Map(),
})

const without = <K, V>(map: ReadonlyMap<K, V>, key: K): Map<K, V> => {
  const next = new Map(map)
  next.delete(key)
  return next
}

const pendingPeer = (state: Admission, key: string): string | undefined =>
  [...state.pending].find(([, name]) => nameKey(name) === key)?.[0]

const admit = (state: Admission, name: string, peerId: string, secret: string): Decision => {
  const key = nameKey(name)
  return {
    state: {
      ...state,
      known: state.known.has(key) ? state.known : new Map(state.known).set(key, name.trim()),
      online: new Map(state.online).set(key, peerId),
      pending: without(state.pending, peerId),
      secrets: new Map(state.secrets).set(key, secret),
    },
    reply: { type: 'welcome', secret },
  }
}

/**
 * The answer to a peer's hello. A name that holds a seat, from this session
 * or one saved with the map, is let back in past the lock and approval only
 * with a proof of that seat's secret. Without one the hello is a stranger's: the lock and
 * approval apply, and with neither in the way it is still refused, since the
 * seat is somebody else's. Only the DM accepting it hands the seat over, under
 * a fresh secret.
 */
export function decide(
  state: Admission,
  name: string,
  peerId: string,
  claim: Claim = {},
): Decision {
  const key = nameKey(name)
  const refuse = (reason: RefusalReason): Decision => ({
    state,
    reply: { type: 'refused', reason },
  })
  const held = secretToProve(state, name, claim.held)

  if (state.kicked.has(key)) return refuse('kicked')
  if (state.online.has(key) || pendingPeer(state, key) !== undefined) return refuse('name-taken')
  if (held !== undefined && claim.proven !== undefined && sameText(held, claim.proven))
    return admit(state, name, peerId, held)
  if (state.locked) return refuse('locked')
  if (state.approval)
    return {
      state: { ...state, pending: new Map(state.pending).set(peerId, name.trim()) },
      reply: { type: 'pending' },
    }
  if (held !== undefined) return refuse('name-taken')
  return admit(state, name, peerId, newSecret())
}

/** The DM lets a waiting peer in; null when that peer is not waiting. */
export function accept(state: Admission, peerId: string): Decision | null {
  const name = state.pending.get(peerId)
  return name === undefined ? null : admit(state, name, peerId, newSecret())
}

/** The DM turns a waiting peer away; it may ask again. Null when that peer is not waiting. */
export function decline(state: Admission, peerId: string): Decision | null {
  if (!state.pending.has(peerId)) return null
  return {
    state: { ...state, pending: without(state.pending, peerId) },
    reply: { type: 'refused', reason: 'declined' },
  }
}

/** A peer's connection closed: its name goes offline but stays known, so it can come back. */
export function disconnect(state: Admission, peerId: string): Admission {
  const key = [...state.online].find(([, peer]) => peer === peerId)?.[0]
  if (key === undefined && !state.pending.has(peerId)) return state
  return {
    ...state,
    online: key === undefined ? state.online : without(state.online, key),
    pending: without(state.pending, peerId),
  }
}

/**
 * Turns a name away for the rest of the session, whether it is online, waiting
 * or not here at all. `peerId` is the connection to send 'kicked' to and close.
 */
export function kick(state: Admission, name: string): { state: Admission; peerId?: string } {
  const key = nameKey(name)
  const peerId = state.online.get(key) ?? pendingPeer(state, key)
  const next: Admission = {
    ...state,
    known: without(state.known, key),
    online: without(state.online, key),
    kicked: new Set(state.kicked).add(key),
    pending: peerId === undefined ? state.pending : without(state.pending, peerId),
  }
  return peerId === undefined ? { state: next } : { state: next, peerId }
}

export const setLocked = (state: Admission, locked: boolean): Admission => ({ ...state, locked })

/** Turning approval off leaves anyone already waiting for the DM to accept or decline. */
export const setApproval = (state: Admission, approval: boolean): Admission => ({
  ...state,
  approval,
})
