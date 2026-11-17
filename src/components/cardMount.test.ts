import { describe, expect, it } from 'vitest'
import { hexes, plateLines, type PlateFacts } from './cardMount'

describe('hexes', () => {
  it('counts one hex, and more as hexes', () => {
    expect(hexes(1)).toBe('1 hex')
    expect(hexes(0)).toBe('0 hexes')
    expect(hexes(1.5)).toBe('1.5 hexes')
  })
})

describe('plateLines', () => {
  const facts = (change: Partial<PlateFacts> = {}): PlateFacts => ({
    dmView: true,
    owner: 'player',
    player: null,
    riding: null,
    ahead: 0,
    ...change,
  })

  it('tells the DM who plays it', () => {
    expect(plateLines(facts({ player: 'Mira' }))[0]).toBe('played by Mira')
    expect(plateLines(facts())[0]).toBe('no player')
    expect(plateLines(facts({ owner: 'dm', player: 'Mira' }))[0]).toBe('dm')
  })

  it('tells what it is doing, riding first', () => {
    expect(plateLines(facts({ riding: 'Red Wagon', ahead: 3 }))[1]).toBe('riding Red Wagon')
    expect(plateLines(facts({ ahead: 3 }))[1]).toBe('3 hexes to go')
    expect(plateLines(facts({ ahead: 1 }))[1]).toBe('1 hex to go')
    expect(plateLines(facts())[1]).toBe('standing')
  })

  it('leaves who plays it out for the players', () => {
    expect(plateLines(facts({ dmView: false, player: 'Mira', ahead: 2 }))).toEqual([
      '2 hexes to go',
    ])
  })
})
