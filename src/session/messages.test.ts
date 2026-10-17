import { describe, expect, it } from 'vitest'
import { MAX_NAME_LENGTH, PROTOCOL_VERSION, REFUSAL_REASONS, parseEnvelope, wrap } from './messages'
import { CHUNK_BYTES, chunk } from './wireChunks'

const piece = { id: 2, index: 0, count: 1, data: '{"turn":1}' }

/** PeerJS turns away a JSON message of this many bytes or more. */
const PEERJS_LIMIT = 16_300

describe('parseEnvelope', () => {
  it('round-trips every message through JSON', () => {
    for (const msg of [
      { type: 'hello', name: 'Mira' },
      { type: 'ping', at: 1234.5 },
      { type: 'pong', at: 0 },
      { type: 'welcome' },
      { type: 'seat', entityId: 'e-1' },
      { type: 'pending' },
      { type: 'kicked' },
      { type: 'resync' },
      { type: 'state', seq: 0, chunk: piece },
      { type: 'patch', base: 3, seq: 4, chunk: piece },
      ...REFUSAL_REASONS.map((reason) => ({ type: 'refused', reason }) as const),
    ] as const) {
      expect(parseEnvelope(JSON.parse(JSON.stringify(wrap(msg))))).toEqual(msg)
    }
  })

  it('trims a hello name', () => {
    expect(parseEnvelope(wrap({ type: 'hello', name: '  Mira ' }))).toEqual({
      type: 'hello',
      name: 'Mira',
    })
  })

  it.each([
    ['null', null],
    ['a string', 'hello'],
    ['an array', [PROTOCOL_VERSION, { type: 'ping', at: 1 }]],
    ['no version', { msg: { type: 'ping', at: 1 } }],
    ['another version', { v: PROTOCOL_VERSION + 1, msg: { type: 'ping', at: 1 } }],
    ['an extra envelope key', { v: PROTOCOL_VERSION, msg: { type: 'ping', at: 1 }, x: 1 }],
    ['an unknown type', { v: PROTOCOL_VERSION, msg: { type: 'shout', at: 1 } }],
    ['a missing type', { v: PROTOCOL_VERSION, msg: { at: 1 } }],
    ['a string time', { v: PROTOCOL_VERSION, msg: { type: 'ping', at: '1' } }],
    ['an infinite time', { v: PROTOCOL_VERSION, msg: { type: 'pong', at: Infinity } }],
    ['a NaN time', { v: PROTOCOL_VERSION, msg: { type: 'pong', at: NaN } }],
    ['an extra message key', { v: PROTOCOL_VERSION, msg: { type: 'ping', at: 1, name: 'x' } }],
    ['a nameless hello', { v: PROTOCOL_VERSION, msg: { type: 'hello' } }],
    ['a blank name', { v: PROTOCOL_VERSION, msg: { type: 'hello', name: '   ' } }],
    [
      'an overlong name',
      { v: PROTOCOL_VERSION, msg: { type: 'hello', name: 'x'.repeat(MAX_NAME_LENGTH + 1) } },
    ],
    ['a numeric name', { v: PROTOCOL_VERSION, msg: { type: 'hello', name: 7 } }],
    ['a welcome with a name', { v: PROTOCOL_VERSION, msg: { type: 'welcome', name: 'Mira' } }],
    ['a seat with no token', { v: PROTOCOL_VERSION, msg: { type: 'seat', entityId: '' } }],
    ['a seat with a numeric token', { v: PROTOCOL_VERSION, msg: { type: 'seat', entityId: 7 } }],
    ['a pending with a time', { v: PROTOCOL_VERSION, msg: { type: 'pending', at: 1 } }],
    ['a kicked with a reason', { v: PROTOCOL_VERSION, msg: { type: 'kicked', reason: 'kicked' } }],
    ['a refusal without a reason', { v: PROTOCOL_VERSION, msg: { type: 'refused' } }],
    ['an unknown reason', { v: PROTOCOL_VERSION, msg: { type: 'refused', reason: 'full' } }],
    ['an inherited reason', { v: PROTOCOL_VERSION, msg: { type: 'refused', reason: 'toString' } }],
    [
      'an extra refusal key',
      { v: PROTOCOL_VERSION, msg: { type: 'refused', reason: 'locked', at: 1 } },
    ],
    ['a resync with a seq', { v: PROTOCOL_VERSION, msg: { type: 'resync', seq: 1 } }],
    ['a state without a seq', { v: PROTOCOL_VERSION, msg: { type: 'state', chunk: piece } }],
    ['a negative seq', { v: PROTOCOL_VERSION, msg: { type: 'state', seq: -1, chunk: piece } }],
    ['a fractional seq', { v: PROTOCOL_VERSION, msg: { type: 'state', seq: 1.5, chunk: piece } }],
    ['a state without a chunk', { v: PROTOCOL_VERSION, msg: { type: 'state', seq: 1 } }],
    [
      'a malformed chunk',
      { v: PROTOCOL_VERSION, msg: { type: 'state', seq: 1, chunk: { ...piece, index: 1 } } },
    ],
    [
      'a state with a base',
      { v: PROTOCOL_VERSION, msg: { type: 'state', base: 0, seq: 1, chunk: piece } },
    ],
    [
      'a patch without a base',
      { v: PROTOCOL_VERSION, msg: { type: 'patch', seq: 2, chunk: piece } },
    ],
    [
      'a patch that goes nowhere',
      { v: PROTOCOL_VERSION, msg: { type: 'patch', base: 2, seq: 2, chunk: piece } },
    ],
    [
      'a patch that goes back',
      { v: PROTOCOL_VERSION, msg: { type: 'patch', base: 3, seq: 2, chunk: piece } },
    ],
  ])('rejects %s', (_label, data) => {
    expect(parseEnvelope(data)).toBeNull()
  })

  it('keeps the fullest piece of a patch under what PeerJS will carry', () => {
    const [full] = chunk('"'.repeat(CHUNK_BYTES), { id: Number.MAX_SAFE_INTEGER })
    const message = {
      type: 'patch',
      base: Number.MAX_SAFE_INTEGER - 1,
      seq: Number.MAX_SAFE_INTEGER,
      chunk: full,
    } as const
    const bytes = new TextEncoder().encode(JSON.stringify(wrap(message))).byteLength
    expect(bytes).toBeLessThan(PEERJS_LIMIT)
    expect(parseEnvelope(JSON.parse(JSON.stringify(wrap(message))))).toEqual(message)
  })
})
