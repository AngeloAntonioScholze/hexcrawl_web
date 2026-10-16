/**
 * PeerJS refuses a JSON message of 16,300 bytes or more, and a map's state runs
 * to megabytes, so a payload goes over in pieces. Each piece is cut to fit in
 * CHUNK_BYTES once JSON-encoded, which leaves room for the envelope around it.
 */
export const CHUNK_BYTES = 15_000

export interface Chunk {
  /** Which transfer this is a piece of; a sender counts them up from zero. */
  id: number
  index: number
  count: number
  data: string
}

const encoder = new TextEncoder()

const jsonBytes = (value: unknown): number => encoder.encode(JSON.stringify(value)).byteLength

/** What one code point costs inside a JSON string, in UTF-8 bytes. */
const costOf = (code: number): number => {
  if (code === 0x22 || code === 0x5c) return 2
  if (code < 0x20) return 6
  if (code < 0x80) return 1
  if (code < 0x800) return 2
  // A lone surrogate, which JSON.stringify writes out as \uXXXX.
  if (code >= 0xd800 && code <= 0xdfff) return 6
  if (code < 0x10000) return 3
  return 4
}

/** A payload in pieces that each JSON-encode to at most `size` bytes. Never splits a code point. */
export function chunk(
  text: string,
  { id, size = CHUNK_BYTES }: { id: number; size?: number },
): Chunk[] {
  const widest = Number.MAX_SAFE_INTEGER
  const budget = size - jsonBytes({ id, index: widest, count: widest, data: '' })
  if (budget < costOf(0)) throw new RangeError(`A chunk of ${size} bytes cannot hold any data.`)

  const parts: string[] = []
  let start = 0
  let used = 0
  for (let at = 0; at < text.length;) {
    const code = text.codePointAt(at)!
    const cost = costOf(code)
    if (used + cost > budget) {
      parts.push(text.slice(start, at))
      start = at
      used = 0
    }
    used += cost
    at += code > 0xffff ? 2 : 1
  }
  parts.push(text.slice(start))

  return parts.map((data, index) => ({ id, index, count: parts.length, data }))
}

const isCount = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0

/** A piece off the wire, or null unless it is exactly one. */
export function parseChunk(value: unknown): Chunk | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const record = value as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length !== 4 || !['id', 'index', 'count', 'data'].every((key) => keys.includes(key)))
    return null

  const { id, index, count, data } = record
  if (!isCount(id) || !isCount(index) || !isCount(count) || typeof data !== 'string') return null
  // A code unit is at least a byte, so no honest piece is longer than this.
  if (count === 0 || index >= count || data.length > CHUNK_BYTES) return null
  return { id, index, count, data }
}

export interface ReassemblerOptions {
  /** How long a transfer may go without a piece before it is given up, in ms. */
  timeout?: number
  /** The most pieces one transfer may claim, which bounds what a sender can make us hold. */
  maxChunks?: number
  now?: () => number
}

export interface Reassembler {
  /** Takes anything off the wire; gives back a whole payload when this piece completes one. */
  accept(value: unknown): string | null
}

interface Transfer {
  id: number
  parts: (string | undefined)[]
  received: number
  touched: number
}

/**
 * Puts payloads back together from pieces arriving in any order. Only the
 * newest transfer counts: a piece of a newer one abandons the one in progress,
 * since the sender only starts another when what it was sending is out of date.
 */
export function createReassembler({
  timeout = 30_000,
  maxChunks = 4096,
  now = Date.now,
}: ReassemblerOptions = {}): Reassembler {
  let current: Transfer | null = null
  // The newest transfer finished or given up; nothing at or below it is taken.
  let settled = -1

  const settle = (id: number): null => {
    settled = Math.max(settled, id)
    current = null
    return null
  }

  return {
    accept(value) {
      const piece = parseChunk(value)
      if (!piece || piece.id <= settled) return null
      const at = now()

      if (current && (piece.id > current.id || at - current.touched > timeout)) settle(current.id)
      if (piece.id <= settled || (current && piece.id < current.id)) return null
      if (piece.count > maxChunks) return settle(piece.id)

      current ??= { id: piece.id, parts: new Array(piece.count), received: 0, touched: at }
      if (piece.count !== current.parts.length) return settle(piece.id)
      if (current.parts[piece.index] !== undefined) return null

      current.parts[piece.index] = piece.data
      current.received++
      current.touched = at
      if (current.received < current.parts.length) return null

      const text = current.parts.join('')
      settle(piece.id)
      return text
    },
  }
}
