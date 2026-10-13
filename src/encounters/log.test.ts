import { describe, expect, it } from 'vitest'
import type { HexEvent } from '../hex/content'
import type { HexKey } from '../hex/coords'
import { encountersMet, encountersUpTo, interleave, type LoggedEncounter } from './log'

const written: HexEvent = { id: 'note', title: 'a shrine', description: '' }
const met = (id: string, turn: number): HexEvent => ({ id, title: id, description: '', turn })

const events = (): ReadonlyMap<HexKey, readonly HexEvent[]> =>
  new Map<HexKey, readonly HexEvent[]>([
    ['0,0', [written, met('wolves', 4)]],
    ['1,0', [met('bandits', 1)]],
    ['2,0', [met('ogre', 6)]],
  ])

describe('the encounters met', () => {
  it('lists only accepted encounters, oldest first, with where they were met', () => {
    expect(encountersMet(events())).toEqual([
      { id: 'bandits', hex: '1,0', turn: 1, title: 'bandits' },
      { id: 'wolves', hex: '0,0', turn: 4, title: 'wolves' },
      { id: 'ogre', hex: '2,0', turn: 6, title: 'ogre' },
    ])
  })

  it('cuts the ones met after a turn, keeping the DM’s own events', () => {
    const cut = encountersUpTo(events(), 3)
    expect([...cut]).toEqual([
      ['0,0', [written]],
      ['1,0', [met('bandits', 1)]],
    ])
  })

  it('keeps an encounter met on the turn itself', () => {
    expect(encountersMet(encountersUpTo(events(), 4)).map((one) => one.id)).toEqual([
      'bandits',
      'wolves',
    ])
  })

  it('hands the same events back when there is nothing to cut', () => {
    const before = events()
    expect(encountersUpTo(before, 6)).toBe(before)
  })
})

describe('the adventure log', () => {
  const at = (id: string, turn: number): LoggedEncounter => ({
    id,
    hex: '0,0',
    turn,
    title: id,
  })
  const rows = [{ turn: 0 }, { turn: 1 }, { turn: 2 }]
  const order = (entries: ReturnType<typeof interleave<{ turn: number }>>): string[] =>
    entries.map((one) => (one.kind === 'turn' ? `t${one.row.turn}` : one.encounter.id))

  it('puts an encounter after the turn that brought the crawl to it', () => {
    expect(order(interleave(rows, [at('start', 0), at('mid', 2), at('also', 2)]))).toEqual([
      'start',
      't0',
      't1',
      'mid',
      'also',
      't2',
    ])
  })

  it('ends with the encounters met where the crawl stands now', () => {
    expect(order(interleave(rows, [at('last', 3)]))).toEqual(['t0', 't1', 't2', 'last'])
    expect(order(interleave([], [at('alone', 0)]))).toEqual(['alone'])
  })
})
