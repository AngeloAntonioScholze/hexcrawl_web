import { describe, expect, it } from 'vitest'
import { chunk, CHUNK_BYTES, createReassembler, parseChunk, type Chunk } from './wireChunks'

const bytes = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).byteLength

/** Text that leans on every width UTF-8 has, and on what JSON escapes. */
const mixed = (length: number): string => {
  const pieces = [
    'plain ascii, ',
    'quote " slash \\ ',
    'tab\tnewline\n',
    'café ',
    'ハックス ',
    '🐉🗺️ ',
  ]
  let text = ''
  for (let i = 0; text.length < length; i++) text += pieces[i % pieces.length]
  return text
}

// A seeded shuffle, so a failure can be run again.
const shuffled = <T>(list: readonly T[], seed = 7): T[] => {
  const out = [...list]
  let state = seed
  for (let i = out.length - 1; i > 0; i--) {
    state = (state * 1103515245 + 12345) % 2 ** 31
    const j = state % (i + 1)
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

const reassemble = (pieces: readonly unknown[]): string[] => {
  const reassembler = createReassembler()
  return pieces.flatMap((one) => reassembler.accept(one) ?? [])
}

describe('cutting a payload', () => {
  it('cuts a multi-megabyte payload into pieces that each fit the channel', () => {
    const text = mixed(3_000_000)
    const pieces = chunk(text, { id: 0 })
    expect(pieces.length).toBeGreaterThan(200)
    for (const piece of pieces) expect(bytes(piece)).toBeLessThanOrEqual(CHUNK_BYTES)
    expect(pieces.map((one) => one.data).join('')).toBe(text)
  })

  it('never splits a code point between pieces', () => {
    const text = '🐉'.repeat(5000)
    for (const piece of chunk(text, { id: 0, size: 1001 })) {
      expect(piece.data.length % 2).toBe(0)
      expect(bytes(piece)).toBeLessThanOrEqual(1001)
    }
  })

  it('stays inside the size when escapes swell the text', () => {
    const text = '\u0001"\\'.repeat(20_000)
    const pieces = chunk(text, { id: 3, size: 2000 })
    for (const piece of pieces) expect(bytes(piece)).toBeLessThanOrEqual(2000)
    expect(pieces.map((one) => one.data).join('')).toBe(text)
  })

  it('numbers the pieces of one transfer', () => {
    const pieces = chunk(mixed(50_000), { id: 9, size: 4000 })
    expect(pieces.map((one) => one.index)).toEqual(pieces.map((_, index) => index))
    expect(pieces.every((one) => one.id === 9 && one.count === pieces.length)).toBe(true)
  })

  it('sends an empty payload as one empty piece', () => {
    expect(chunk('', { id: 0 })).toEqual([{ id: 0, index: 0, count: 1, data: '' }])
  })

  it('refuses a size too small to carry anything', () => {
    expect(() => chunk('text', { id: 0, size: 40 })).toThrow(RangeError)
  })
})

describe('putting a payload back together', () => {
  const text = mixed(2_000_000)
  const pieces = chunk(text, { id: 1 })

  it('rebuilds it from pieces in order', () => {
    expect(reassemble(pieces)).toEqual([text])
  })

  it('rebuilds it from pieces in any order', () => {
    expect(reassemble(shuffled(pieces))).toEqual([text])
  })

  it('rebuilds it from pieces that went through JSON', () => {
    const wire = pieces.map((one) => JSON.parse(JSON.stringify(one)) as unknown)
    expect(reassemble(wire)).toEqual([text])
  })

  it('takes a repeated piece once, and nothing after the payload is whole', () => {
    const doubled = pieces.flatMap((one) => [one, one])
    expect(reassemble([...doubled, ...pieces])).toEqual([text])
  })

  it('gives up a transfer when a newer one starts', () => {
    const older = chunk('the older state of the map', { id: 1, size: 80 })
    const newer = chunk('newer state', { id: 2, size: 80 })
    expect(older.length).toBeGreaterThan(1)

    const interleaved = [older[0], newer[0], ...older.slice(1), ...newer.slice(1)]
    expect(reassemble(interleaved)).toEqual(['newer state'])
  })

  it('ignores an older transfer arriving late', () => {
    const newer = chunk('newer', { id: 5 })
    const older = chunk('older', { id: 4 })
    expect(reassemble([...newer, ...older])).toEqual(['newer'])
  })

  it('keeps transfers apart that follow one another', () => {
    expect(reassemble([...chunk('one', { id: 0 }), ...chunk('two', { id: 1 })])).toEqual([
      'one',
      'two',
    ])
  })

  it('gives up a transfer that stalls', () => {
    let clock = 0
    const reassembler = createReassembler({ timeout: 1000, now: () => clock })
    const pieces = chunk('a slow payload that takes a while', { id: 0, size: 80 })
    reassembler.accept(pieces[0])

    clock = 5000
    expect(pieces.slice(1).map((one) => reassembler.accept(one))).toEqual(
      pieces.slice(1).map(() => null),
    )
    expect(reassembler.accept(chunk('fresh', { id: 1 })[0])).toBe('fresh')
  })

  it('refuses a transfer claiming more pieces than it allows', () => {
    const reassembler = createReassembler({ maxChunks: 10 })
    expect(reassembler.accept({ id: 0, index: 0, count: 11, data: '' })).toBeNull()
  })

  it('gives up a transfer whose pieces disagree on their count', () => {
    const reassembler = createReassembler()
    expect(reassembler.accept({ id: 0, index: 0, count: 2, data: 'a' })).toBeNull()
    expect(reassembler.accept({ id: 0, index: 1, count: 3, data: 'b' })).toBeNull()
    expect(reassembler.accept({ id: 0, index: 2, count: 3, data: 'c' })).toBeNull()
  })
})

describe('a piece off the wire', () => {
  const good: Chunk = { id: 0, index: 0, count: 1, data: 'x' }

  it('is taken when it is exactly a piece', () => {
    expect(parseChunk(good)).toEqual(good)
  })

  it.each([
    ['nothing', null],
    ['a string', 'chunk'],
    ['a list', [0, 0, 1, 'x']],
    ['a missing field', { id: 0, index: 0, count: 1 }],
    ['an extra field', { ...good, more: true }],
    ['a negative id', { ...good, id: -1 }],
    ['a fractional index', { ...good, index: 0.5 }],
    ['an index past the count', { ...good, index: 1 }],
    ['a count of none', { ...good, count: 0, index: 0 }],
    ['data that is not text', { ...good, data: 1 }],
    ['data longer than any piece', { ...good, data: 'x'.repeat(CHUNK_BYTES + 1) }],
  ])('is refused when it is %s', (_, value) => {
    expect(parseChunk(value)).toBeNull()
    expect(createReassembler().accept(value)).toBeNull()
  })
})
