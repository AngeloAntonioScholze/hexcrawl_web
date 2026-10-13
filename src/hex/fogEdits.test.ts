import { describe, expect, it } from 'vitest'
import type { HexKey } from './coords'
import {
  createKnowledge,
  editFog,
  knownSet,
  NO_FOG_EDITS,
  withoutHidden,
  type Explored,
  type FogEdits,
} from './fogEdits'

const keys = (...list: string[]): Set<HexKey> => new Set(list as HexKey[])

const edits = (revealed: string[], hidden: string[]): FogEdits => ({
  revealed: keys(...revealed),
  hidden: keys(...hidden),
})

describe('editFog', () => {
  it('moves a hex from one side to the other, so the latest stroke wins', () => {
    const revealed = editFog(NO_FOG_EDITS, ['0,0', '1,0'] as HexKey[], 'reveal')
    expect(revealed).toEqual(edits(['0,0', '1,0'], []))

    const hidden = editFog(revealed, ['1,0', '2,0'] as HexKey[], 'hide')
    expect(hidden).toEqual(edits(['0,0'], ['1,0', '2,0']))
  })

  it('hands the same edits back when the stroke changes nothing', () => {
    const before = edits(['0,0'], ['1,0'])
    expect(editFog(before, ['0,0'] as HexKey[], 'reveal')).toBe(before)
    expect(editFog(before, ['1,0'] as HexKey[], 'hide')).toBe(before)
  })

  it('never mutates the edits it was given', () => {
    const before = edits(['0,0'], [])
    editFog(before, ['0,0'] as HexKey[], 'hide')
    expect(before).toEqual(edits(['0,0'], []))
  })
})

describe('knownSet', () => {
  it('adds what was revealed and takes away what was hidden, hidden first', () => {
    const known = knownSet(keys('0,0', '1,0'), edits(['5,5'], ['1,0']))
    expect([...known].sort()).toEqual(['0,0', '5,5'])
  })

  it('is the explored set itself when the DM has touched nothing', () => {
    const seen = keys('0,0')
    expect(knownSet(seen, NO_FOG_EDITS)).toBe(seen)
  })
})

describe('withoutHidden', () => {
  it('takes hidden hexes out of sight', () => {
    expect([...withoutHidden(keys('0,0', '1,0'), keys('1,0'))]).toEqual(['0,0'])
  })

  it('hands the same set back when nothing in sight is hidden', () => {
    const visible = keys('0,0')
    expect(withoutHidden(visible, keys('9,9'))).toBe(visible)
  })
})

describe('createKnowledge', () => {
  const explored = (version: number, seen: Set<HexKey>, added: Set<HexKey> | null): Explored => ({
    seen,
    added,
    version,
  })

  it('builds the first answer whole', () => {
    const know = createKnowledge()
    const answer = know(explored(1, keys('0,0'), null), edits(['3,0'], []))
    expect(answer.added).toBeNull()
    expect([...answer.seen].sort()).toEqual(['0,0', '3,0'])
  })

  it('steps a turn forward without the hidden or the already revealed', () => {
    const know = createKnowledge()
    const fog = edits(['2,0'], ['3,0'])
    know(explored(1, keys('0,0'), null), fog)

    const answer = know(
      explored(2, keys('0,0', '1,0', '2,0', '3,0'), keys('1,0', '2,0', '3,0')),
      fog,
    )

    expect([...answer.added!]).toEqual(['1,0'])
    expect(answer.lost.size).toBe(0)
    expect([...answer.seen].sort()).toEqual(['0,0', '1,0', '2,0'])
  })

  it('passes the explored set straight through while there are no edits', () => {
    const know = createKnowledge()
    know(explored(1, keys('0,0'), null), NO_FOG_EDITS)
    const seen = keys('0,0', '1,0')

    const answer = know(explored(2, seen, keys('1,0')), NO_FOG_EDITS)

    expect(answer.seen).toBe(seen)
    expect([...answer.added!]).toEqual(['1,0'])
  })

  it('hands on only the hexes a stroke changed', () => {
    const know = createKnowledge()
    const seen = keys('0,0', '1,0')
    know(explored(1, seen, null), NO_FOG_EDITS)

    const answer = know(explored(1, seen, null), edits(['4,0'], ['1,0']))

    expect([...answer.added!]).toEqual(['4,0'])
    expect([...answer.lost]).toEqual(['1,0'])
    expect([...answer.seen].sort()).toEqual(['0,0', '4,0'])
  })

  it('gives back what an undone stroke took away', () => {
    const know = createKnowledge()
    const seen = keys('0,0', '1,0')
    know(explored(1, seen, null), NO_FOG_EDITS)
    know(explored(1, seen, null), edits([], ['1,0']))

    const answer = know(explored(1, seen, null), NO_FOG_EDITS)

    expect([...answer.added!]).toEqual(['1,0'])
    expect(answer.seen).toBe(seen)
  })

  // A rewind rebuilds the explored set; the edits ride on top of the new one.
  it('keeps the edits over a rebuilt explored set', () => {
    const know = createKnowledge()
    const fog = edits(['9,0'], ['0,0'])
    know(explored(1, keys('0,0', '1,0', '2,0'), null), fog)

    const answer = know(explored(2, keys('0,0'), null), fog)

    expect(answer.added).toBeNull()
    expect([...answer.seen]).toEqual(['9,0'])
  })

  it('builds again when an answer was skipped', () => {
    const know = createKnowledge()
    know(explored(1, keys('0,0'), null), NO_FOG_EDITS)

    const answer = know(explored(3, keys('0,0', '1,0'), keys('1,0')), NO_FOG_EDITS)

    expect(answer.added).toBeNull()
  })

  it('counts its answers so the fog can tell a step from a jump', () => {
    const know = createKnowledge()
    const first = know(explored(1, keys(), null), NO_FOG_EDITS)
    const second = know(explored(1, keys(), null), edits(['0,0'], []))
    expect(second.version).toBe(first.version + 1)
  })
})
