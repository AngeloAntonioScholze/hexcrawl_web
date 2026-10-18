import type { RefusalReason, SessionMessage } from './messages'

/**
 * Who may sit at the host's table. Names are matched by their key (trimmed,
 * lower case), so "Mira" and " mira" are one player; `known` keeps the form
 * they were first admitted under, for display. Every function returns a new
 * state and leaves the one it was given alone.
 */
export interface Admission {
  /** No new names; known ones still come back. */
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
}

export type Reply = Extract<SessionMessage, { type: 'welcome' | 'pending' | 'refused' }>

export interface Decision {
  state: Admission
  reply: Reply
}

export const nameKey = (name: string): string => name.trim().toLowerCase()

/** A room before anyone says hello; `known` are the names to let back in, as display names. */
export const openRoom = (
  options: { locked?: boolean; approval?: boolean; known?: Iterable<string> } = {},
): Admission => ({
  locked: options.locked ?? false,
  approval: options.approval ?? false,
  known: new Map([...(options.known ?? [])].map((name) => [nameKey(name), name.trim()])),
  online: new Map(),
  kicked: new Set(),
  pending: new Map(),
})

const without = <K, V>(map: ReadonlyMap<K, V>, key: K): Map<K, V> => {
  const next = new Map(map)
  next.delete(key)
  return next
}

const pendingPeer = (state: Admission, key: string): string | undefined =>
  [...state.pending].find(([, name]) => nameKey(name) === key)?.[0]

const admit = (state: Admission, name: string, peerId: string): Decision => {
  const key = nameKey(name)
  return {
    state: {
      ...state,
      known: state.known.has(key) ? state.known : new Map(state.known).set(key, name.trim()),
      online: new Map(state.online).set(key, peerId),
      pending: without(state.pending, peerId),
    },
    reply: { type: 'welcome' },
  }
}

/**
 * The answer to a peer's hello. A `returning` name, one that already has a
 * seat at this table from before the room was opened, is let back in like a
 * known one: a DM who reloads and reopens finds the door forgot everyone.
 */
export function decide(
  state: Admission,
  name: string,
  peerId: string,
  returning = false,
): Decision {
  const key = nameKey(name)
  const refuse = (reason: RefusalReason): Decision => ({
    state,
    reply: { type: 'refused', reason },
  })

  if (state.kicked.has(key)) return refuse('kicked')
  if (state.online.has(key) || pendingPeer(state, key) !== undefined) return refuse('name-taken')
  if (state.known.has(key) || returning) return admit(state, name, peerId)
  if (state.locked) return refuse('locked')
  if (state.approval)
    return {
      state: { ...state, pending: new Map(state.pending).set(peerId, name.trim()) },
      reply: { type: 'pending' },
    }
  return admit(state, name, peerId)
}

/** The DM lets a waiting peer in; null when that peer is not waiting. */
export function accept(state: Admission, peerId: string): Decision | null {
  const name = state.pending.get(peerId)
  return name === undefined ? null : admit(state, name, peerId)
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
