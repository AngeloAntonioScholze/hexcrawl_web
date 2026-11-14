import { describe, expect, it } from 'vitest'
import { BUSTS, bustOf, FRAME_ART, frameVariant } from './busts'
import type { EntityKind, Owner } from './entity'

describe('busts', () => {
  // Small files come back inlined as data URLs, so a picture is told apart by
  // what it is, not by the file it came from.
  it('gives every bust its own id, a label and a picture of its own', () => {
    const ids = BUSTS.map((one) => one.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(BUSTS.map((one) => one.url)).size).toBe(ids.length)
    for (const one of BUSTS) {
      expect(one.label).not.toBe('')
      expect(one.url).not.toBe('')
    }
  })

  it('keeps the order the picker shows them in', () => {
    expect(BUSTS.map((one) => one.id)).toEqual([
      'knight',
      'ranger',
      'rogue',
      'wizard',
      'cleric',
      'bard',
      'dwarf',
      'elf',
      'crone',
      'brute',
      'merchant',
      'captain',
      'wagon',
      'ship',
    ])
  })

  it('finds a bust by its id', () => {
    expect(bustOf('wizard')?.label).toBe('Wizard')
  })

  it('finds nothing for no id, or one this build does not ship', () => {
    expect(bustOf(undefined)).toBeUndefined()
    expect(bustOf('dusk-road')).toBeUndefined()
  })
})

describe('frame variant', () => {
  const cases: [EntityKind, Owner, string][] = [
    ['caravan', 'player', 'bronze'],
    ['caravan', 'dm', 'bronze'],
    ['ship', 'player', 'bronze'],
    ['ship', 'dm', 'bronze'],
    ['party', 'player', 'steel'],
    ['npc', 'player', 'steel'],
    ['party', 'dm', 'crimson'],
    ['npc', 'dm', 'crimson'],
  ]

  it.each(cases)('frames a %s owned by the %s in %s', (kind, owner, variant) => {
    expect(frameVariant({ kind, owner })).toBe(variant)
  })

  it('has a frame, crest and foot for every variant, each its own picture', () => {
    const urls = Object.values(FRAME_ART).flatMap((one) => [one.frame, one.crest, one.foot])
    expect(urls).toHaveLength(9)
    expect(new Set(urls).size).toBe(9)
    for (const url of urls) expect(url).not.toBe('')
  })
})
