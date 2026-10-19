import { parseChunk, type Chunk } from './wireChunks'

/** Bumped when a message changes shape, so an older tab is turned away rather than misread. */
export const PROTOCOL_VERSION = 4

export const MAX_NAME_LENGTH = 40

export const REFUSAL_REASONS = ['locked', 'declined', 'name-taken', 'kicked'] as const

export type RefusalReason = (typeof REFUSAL_REASONS)[number]

export type SessionMessage =
  | { type: 'hello'; name: string }
  | { type: 'ping'; at: number }
  | { type: 'pong'; at: number }
  | { type: 'welcome' }
  /**
   * The tokens that are the guest's to play, sent once it is in and again
   * whenever the DM hands it more or takes some away.
   */
  | { type: 'seat'; entityIds: readonly string[] }
  | { type: 'pending' }
  | { type: 'refused'; reason: RefusalReason }
  | { type: 'kicked' }
  /** One piece of the whole of what the players see, as it stands at `seq`. */
  | { type: 'state'; seq: number; chunk: Chunk }
  /** One piece of what changed from `base` to `seq`. */
  | { type: 'patch'; base: number; seq: number; chunk: Chunk }
  /** From a guest that has lost track: send me the whole state. */
  | { type: 'resync' }

export interface Envelope {
  v: typeof PROTOCOL_VERSION
  msg: SessionMessage
}

export const wrap = (msg: SessionMessage): Envelope => ({ v: PROTOCOL_VERSION, msg })

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const hasExactly = (record: Record<string, unknown>, keys: readonly string[]): boolean => {
  const own = Object.keys(record)
  return own.length === keys.length && keys.every((key) => Object.hasOwn(record, key))
}

const isSeq = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0

const isRefusalReason = (value: unknown): value is RefusalReason =>
  REFUSAL_REASONS.some((reason) => reason === value)

const parseMessage = (msg: unknown): SessionMessage | null => {
  if (!isRecord(msg)) return null

  switch (msg.type) {
    case 'hello': {
      const { name } = msg
      if (!hasExactly(msg, ['type', 'name']) || typeof name !== 'string') return null
      const trimmed = name.trim()
      if (trimmed.length === 0 || trimmed.length > MAX_NAME_LENGTH) return null
      return { type: 'hello', name: trimmed }
    }
    case 'ping':
    case 'pong': {
      const { at } = msg
      if (!hasExactly(msg, ['type', 'at']) || typeof at !== 'number' || !Number.isFinite(at))
        return null
      return { type: msg.type, at }
    }
    case 'welcome':
    case 'pending':
    case 'kicked':
    case 'resync':
      return hasExactly(msg, ['type']) ? { type: msg.type } : null
    case 'seat': {
      const { entityIds } = msg
      if (!hasExactly(msg, ['type', 'entityIds']) || !Array.isArray(entityIds)) return null
      if (!entityIds.every((id) => typeof id === 'string' && id !== '')) return null
      return { type: 'seat', entityIds: [...(entityIds as string[])] }
    }
    case 'state': {
      const { seq } = msg
      const chunk = parseChunk(msg.chunk)
      if (!hasExactly(msg, ['type', 'seq', 'chunk']) || !isSeq(seq) || !chunk) return null
      return { type: 'state', seq, chunk }
    }
    case 'patch': {
      const { base, seq } = msg
      const chunk = parseChunk(msg.chunk)
      if (!hasExactly(msg, ['type', 'base', 'seq', 'chunk']) || !isSeq(base) || !isSeq(seq))
        return null
      if (base >= seq || !chunk) return null
      return { type: 'patch', base, seq, chunk }
    }
    case 'refused': {
      const { reason } = msg
      if (!hasExactly(msg, ['type', 'reason']) || !isRefusalReason(reason)) return null
      return { type: 'refused', reason }
    }
    default:
      return null
  }
}

/** Whatever came off the wire, or null when it is not exactly a message this build speaks. */
export const parseEnvelope = (data: unknown): SessionMessage | null => {
  if (!isRecord(data) || !hasExactly(data, ['v', 'msg']) || data.v !== PROTOCOL_VERSION) return null
  return parseMessage(data.msg)
}
