import { describe, expect, it } from 'vitest'
import { crewShown, draftCommit, draftValid } from './cardBody'

describe('the rows a card shows', () => {
  const crew = (n: number): number[] => Array.from({ length: n }, (_, i) => i)

  it('shows nobody when there is nobody', () => {
    expect(crewShown([])).toEqual({ shown: [], more: 0 })
  })

  it('shows up to six in full', () => {
    expect(crewShown(crew(6))).toEqual({ shown: crew(6), more: 0 })
  })

  it('gives the sixth row over to a count from seven on', () => {
    expect(crewShown(crew(7))).toEqual({ shown: crew(5), more: 2 })
    expect(crewShown(crew(12))).toEqual({ shown: crew(5), more: 7 })
  })
})

describe('a tally draft', () => {
  it('accepts a whole number within the limits', () => {
    expect(draftValid('0', 0, 1000)).toBe(true)
    expect(draftValid('1000', 0, 1000)).toBe(true)
  })

  it('turns away empty, fractional and out-of-range drafts', () => {
    expect(draftValid('', 0, 1000)).toBe(false)
    expect(draftValid('  ', 0, 1000)).toBe(false)
    expect(draftValid('2.5', 0, 1000)).toBe(false)
    expect(draftValid('1001', 0, 1000)).toBe(false)
    expect(draftValid('-1', 0, 1000)).toBe(false)
    expect(draftValid('abc', 0, 1000)).toBe(false)
  })

  it('commits any finite number rounded, and nothing for empty or junk', () => {
    expect(draftCommit('2.6')).toBe(3)
    expect(draftCommit('5000')).toBe(5000)
    expect(draftCommit('')).toBeNull()
    expect(draftCommit('abc')).toBeNull()
  })
})
