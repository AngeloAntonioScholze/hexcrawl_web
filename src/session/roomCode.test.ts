import { describe, expect, it } from 'vitest'
import { ROOM_PREFIX, SUFFIX_LENGTH, makeRoomCode, normaliseRoomCode } from './roomCode'

describe('makeRoomCode', () => {
  it('is the prefix plus a suffix of the right length', () => {
    const code = makeRoomCode()
    expect(code.startsWith(ROOM_PREFIX)).toBe(true)
    expect(code).toHaveLength(ROOM_PREFIX.length + SUFFIX_LENGTH)
  })

  it('maps bytes onto the alphabet, wrapping past its end', () => {
    expect(makeRoomCode(() => new Uint8Array([0, 1, 2, 30, 31, 255]))).toBe('hexcrawl-abc9ah')
  })

  it('always normalises to itself', () => {
    for (let i = 0; i < 100; i++) {
      const code = makeRoomCode()
      expect(normaliseRoomCode(code)).toBe(code)
    }
  })
})

describe('normaliseRoomCode', () => {
  it('accepts the bare suffix, any case, with spaces', () => {
    expect(normaliseRoomCode('  AbC9aJ ')).toBe('hexcrawl-abc9aj')
    expect(normaliseRoomCode('HEXCRAWL-abc9aj')).toBe('hexcrawl-abc9aj')
  })

  it.each(['', 'abc9a', 'abc9ajk', 'abc0aj', 'hexcrawl-', 'other-abc9aj', 'abc 9aj'])(
    'rejects %j',
    (input) => {
      expect(normaliseRoomCode(input)).toBeNull()
    },
  )
})
