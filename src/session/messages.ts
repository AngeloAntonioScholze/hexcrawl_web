/** Bumped when a message changes shape, so an older tab is turned away rather than misread. */
export const PROTOCOL_VERSION = 1

export const MAX_NAME_LENGTH = 40

export type SessionMessage =
  { type: 'hello'; name: string } | { type: 'ping'; at: number } | { type: 'pong'; at: number }

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
    default:
      return null
  }
}

/** Whatever came off the wire, or null when it is not exactly a message this build speaks. */
export const parseEnvelope = (data: unknown): SessionMessage | null => {
  if (!isRecord(data) || !hasExactly(data, ['v', 'msg']) || data.v !== PROTOCOL_VERSION) return null
  return parseMessage(data.msg)
}
