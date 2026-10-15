import { describe, expect, it } from 'vitest'
import { MAX_NAME_LENGTH, PROTOCOL_VERSION, parseEnvelope, wrap } from './messages'

describe('parseEnvelope', () => {
  it('round-trips every message through JSON', () => {
    for (const msg of [
      { type: 'hello', name: 'Mira' },
      { type: 'ping', at: 1234.5 },
      { type: 'pong', at: 0 },
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
  ])('rejects %s', (_label, data) => {
    expect(parseEnvelope(data)).toBeNull()
  })
})
