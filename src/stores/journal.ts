import type { Viewer } from '../session/permissions'
import type { Step, StepCause } from './history'

export type Json =
  null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json }

/**
 * One thing a step changed, with what it was and what it became; null stands
 * for absent. Where it sits in the slot depends on the slot: a record's id and
 * field, a map's key, a set's member, a list's index.
 */
export interface JournalChange {
  target: string
  key?: string
  field?: string
  at?: number
  old: Json
  new: Json
}

/** One committed change to the game, as whoever made it made it. */
export interface JournalEntry {
  id: string
  who: Viewer
  cause: StepCause
  /** The turn the crawl stood at before the step. */
  turn: number
  at: number
  changes: readonly JournalChange[]
}

type Kind = 'records' | 'map' | 'set' | 'fog' | 'value' | 'fields' | 'list' | 'frames'

/** The store slots the journal follows, and how each is told apart; the rest is view state. */
const JOURNALED: Readonly<Record<string, Kind>> = {
  entities: 'records',
  merchants: 'records',
  items: 'records',
  resources: 'records',
  catalogOverrides: 'records',
  origins: 'map',
  queue: 'map',
  notes: 'map',
  events: 'map',
  locations: 'map',
  supplies: 'map',
  abilities: 'map',
  characters: 'map',
  terrainOverrides: 'map',
  roads: 'set',
  rivers: 'set',
  fogEdits: 'fog',
  revealed: 'value',
  playerReachCapped: 'value',
  resourceSpacing: 'value',
  turn: 'value',
  worldRadius: 'value',
  resourceChances: 'fields',
  terrain: 'fields',
  encounterOverrides: 'list',
  seats: 'list',
  frames: 'frames',
}

type JsonObject = { readonly [key: string]: Json }

export const toJson = (value: unknown): Json => {
  if (value === undefined || value === null) return null
  if (value instanceof Map) {
    return Object.fromEntries([...value].map(([key, one]) => [String(key), toJson(one)]))
  }
  if (value instanceof Set) return [...value].map(toJson)
  if (Array.isArray(value)) return value.map(toJson)
  if (typeof value === 'object') {
    const out: Record<string, Json> = {}
    for (const [key, one] of Object.entries(value)) if (one !== undefined) out[key] = toJson(one)
    return out
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  return value as Json
}

export const sameJson = (a: Json, b: Json): boolean => {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((one, index) => sameJson(one, (b as readonly Json[])[index]))
  }
  const left = a as JsonObject
  const right = b as JsonObject
  const keys = Object.keys(left)
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && sameJson(left[key], right[key]))
  )
}

type Changes = JournalChange[]

const fieldChanges = (
  base: Omit<JournalChange, 'old' | 'new' | 'field'>,
  before: Json,
  after: Json,
  into: Changes,
): void => {
  const old = (before ?? {}) as JsonObject
  const next = (after ?? {}) as JsonObject
  for (const field of new Set([...Object.keys(old), ...Object.keys(next)])) {
    const a = old[field] ?? null
    const b = next[field] ?? null
    if (!sameJson(a, b)) into.push({ ...base, field, old: a, new: b })
  }
}

const records = (target: string, before: unknown, after: unknown, into: Changes): void => {
  const was = before as readonly { id: string }[]
  const now = after as readonly { id: string }[]
  const prior = new Map(was.map((one) => [one.id, one]))
  const kept = new Set(now.map((one) => one.id))
  was.forEach((one, at) => {
    if (!kept.has(one.id)) into.push({ target, key: one.id, at, old: toJson(one), new: null })
  })
  now.forEach((one, at) => {
    const old = prior.get(one.id)
    if (old === undefined) into.push({ target, key: one.id, at, old: null, new: toJson(one) })
    else if (old !== one) fieldChanges({ target, key: one.id }, toJson(old), toJson(one), into)
  })
}

const keyed = (target: string, before: unknown, after: unknown, into: Changes): void => {
  const was = before as ReadonlyMap<string, unknown>
  const now = after as ReadonlyMap<string, unknown>
  for (const [key, old] of was) {
    if (!now.has(key)) into.push({ target, key, old: toJson(old), new: null })
  }
  for (const [key, value] of now) {
    const had = was.has(key)
    const old = was.get(key)
    if (had && Object.is(old, value)) continue
    // A list under a key, such as a caravan's stores turn by turn, only grows
    // or changes at one end, so writing it whole each time would grow the
    // journal with the square of the list.
    if (Array.isArray(old) && Array.isArray(value)) {
      splice({ target, key }, old, value, into)
      continue
    }
    const a = had ? toJson(old) : null
    const b = toJson(value)
    if (!sameJson(a, b)) into.push({ target, key, old: a, new: b })
  }
}

const members = (target: string, before: unknown, after: unknown, into: Changes): void => {
  const was = before as ReadonlySet<string>
  const now = after as ReadonlySet<string>
  for (const key of was) if (!now.has(key)) into.push({ target, key, old: true, new: null })
  for (const key of now) if (!was.has(key)) into.push({ target, key, old: null, new: true })
}

interface FogSets {
  revealed: ReadonlySet<string>
  hidden: ReadonlySet<string>
}

const fog = (target: string, before: unknown, after: unknown, into: Changes): void => {
  const was = before as FogSets
  const now = after as FogSets
  const mark = ({ revealed, hidden }: FogSets, hex: string): Json =>
    revealed.has(hex) ? 'revealed' : hidden.has(hex) ? 'hidden' : null
  const hexes = new Set([...was.revealed, ...was.hidden, ...now.revealed, ...now.hidden])
  for (const hex of hexes) {
    const old = mark(was, hex)
    const next = mark(now, hex)
    if (old !== next) into.push({ target, key: hex, old, new: next })
  }
}

const value = (target: string, before: unknown, after: unknown, into: Changes): void => {
  const old = toJson(before)
  const next = toJson(after)
  if (!sameJson(old, next)) into.push({ target, old, new: next })
}

const fields = (target: string, before: unknown, after: unknown, into: Changes): void =>
  fieldChanges({ target }, toJson(before), toJson(after), into)

const list = (target: string, before: unknown, after: unknown, into: Changes): void =>
  splice({ target }, before as readonly unknown[], after as readonly unknown[], into)

/** The one stretch of a list that changed, everything before and after it left out. */
function splice(
  base: Pick<JournalChange, 'target' | 'key'>,
  before: readonly unknown[],
  after: readonly unknown[],
  into: Changes,
): void {
  const was = before.map(toJson)
  const now = after.map(toJson)
  let start = 0
  while (start < was.length && start < now.length && sameJson(was[start], now[start])) start += 1
  let end = 0
  while (
    end < was.length - start &&
    end < now.length - start &&
    sameJson(was[was.length - 1 - end], now[now.length - 1 - end])
  ) {
    end += 1
  }
  const old = was.slice(start, was.length - end)
  const next = now.slice(start, now.length - end)
  if (old.length > 0 || next.length > 0) into.push({ ...base, at: start, old, new: next })
}

// The frames that come after a cut are worked out again by playing the turns,
// so only the ones dropped are written out in full; the ones added are counted.
const frames = (target: string, before: unknown, after: unknown, into: Changes): void => {
  const was = before as readonly unknown[]
  const now = after as readonly unknown[]
  let start = 0
  while (start < was.length && start < now.length && Object.is(was[start], now[start])) start += 1
  const dropped = was.slice(start).map(toJson)
  const added = now.length - start
  if (dropped.length > 0 || added > 0) into.push({ target, at: start, old: dropped, new: added })
}

const DIFFS: Readonly<
  Record<Kind, (target: string, before: unknown, after: unknown, into: Changes) => void>
> = { records, map: keyed, set: members, fog, value, fields, list, frames }

/** What a step changed in the journaled slots, as compact old-to-new pieces. */
export function diffStep(step: Step): JournalChange[] {
  const changes: Changes = []
  for (const name of step.slots) {
    const kind = JOURNALED[name]
    if (kind) DIFFS[kind](name, step.before[name], step.after[name], changes)
  }
  return changes
}

interface RecorderOptions {
  now?: () => number
  newId?: () => string
}

const copyWho = (who: Viewer): Viewer =>
  who.role === 'dm'
    ? { role: 'dm' }
    : { role: 'player', ...(who.plays ? { plays: [...who.plays] } : {}) }

/**
 * Turns history steps into journal entries. A step that folds into the one
 * before it replaces that one's entry, or takes it out when the two cancel, so
 * an edit burst is one entry, as it is one undo.
 */
export function createRecorder(
  read: () => readonly JournalEntry[],
  write: (next: readonly JournalEntry[]) => void,
  context: () => { who: Viewer; turn: number },
  { now = Date.now, newId = () => crypto.randomUUID() }: RecorderOptions = {},
): (step: Step) => void {
  // The entry the step told before wrote, while a merged one could replace it.
  let last: string | null = null

  return (step) => {
    const journal = read()
    const tail = journal[journal.length - 1]
    const replaced = step.merged && last !== null && tail?.id === last ? tail : null
    const kept = replaced ? journal.slice(0, -1) : journal
    const changes = diffStep(step)
    if (changes.length === 0) {
      last = null
      if (replaced) write(kept)
      return
    }
    const { who, turn } = context()
    const entry: JournalEntry = {
      id: newId(),
      who: copyWho(who),
      cause: step.cause,
      turn: replaced?.turn ?? (step.slots.includes('turn') ? Number(step.before.turn) : turn),
      at: now(),
      changes,
    }
    last = entry.id
    write([...kept, entry])
  }
}
