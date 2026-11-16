import { describe, expect, it } from 'vitest'
import { BUSTS, bustOf, FRAME_ART, frameVariant, type FrameBox, type FrameVariant } from './busts'
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
  const cases: [boolean, EntityKind, Owner, FrameVariant][] = [
    [true, 'party', 'player', 'crimson'],
    [true, 'party', 'dm', 'crimson'],
    [true, 'npc', 'player', 'crimson'],
    [true, 'npc', 'dm', 'crimson'],
    [true, 'caravan', 'player', 'crimson'],
    [true, 'caravan', 'dm', 'crimson'],
    [true, 'ship', 'player', 'crimson'],
    [true, 'ship', 'dm', 'crimson'],
    [false, 'caravan', 'player', 'bronze'],
    [false, 'caravan', 'dm', 'bronze'],
    [false, 'ship', 'player', 'bronze'],
    [false, 'ship', 'dm', 'bronze'],
    [false, 'party', 'player', 'steel'],
    [false, 'npc', 'player', 'steel'],
    [false, 'party', 'dm', 'bronze'],
    [false, 'npc', 'dm', 'bronze'],
  ]

  it.each(cases)('frames hidden=%s %s owned by the %s in %s', (hidden, kind, owner, variant) => {
    expect(frameVariant({ hidden, hostile: false, kind, owner })).toBe(variant)
  })

  it.each(cases)(
    'frames hostile hidden=%s %s owned by the %s in crimson',
    (hidden, kind, owner) => {
      expect(frameVariant({ hidden, hostile: true, kind, owner })).toBe('crimson')
    },
  )
})

describe('frame art', () => {
  it('has a frame and a window mask for every variant, each its own picture', () => {
    const urls = Object.values(FRAME_ART).flatMap((one) => [one.frame, one.window])
    expect(urls).toHaveLength(6)
    expect(new Set(urls).size).toBe(6)
    for (const url of urls) expect(url).not.toBe('')
  })

  const inside = ({ left, top, width, height }: FrameBox): boolean =>
    left >= 0 && top >= 0 && width > 0 && height > 0 && left + width <= 100 && top + height <= 100

  const overlap = (a: FrameBox, b: FrameBox): boolean =>
    a.left < b.left + b.width &&
    b.left < a.left + a.width &&
    a.top < b.top + b.height &&
    b.top < a.top + a.height

  it.each(Object.entries(FRAME_ART))('keeps every %s region inside the frame', (_, art) => {
    const { slots, ...rest } = art.regions
    for (const region of [...Object.values(rest), ...slots]) expect(inside(region)).toBe(true)
  })

  it.each(Object.entries(FRAME_ART))('never overlaps two %s slots', (_, art) => {
    const [one, two, three] = art.regions.slots
    expect(overlap(one, two)).toBe(false)
    expect(overlap(two, three)).toBe(false)
    expect(overlap(one, three)).toBe(false)
  })

  it.each(Object.entries(FRAME_ART))(
    'stops the %s pick area above the banner, inside the window',
    (_, art) => {
      const { window, pick, banner } = art.regions
      expect(pick.top + pick.height).toBeLessThan(banner.top)
      expect(pick.top + pick.height).toBeLessThanOrEqual(window.top + window.height)
    },
  )
})
