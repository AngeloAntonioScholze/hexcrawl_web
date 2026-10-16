import { describe, expect, it } from 'vitest'
import { roomFromLink } from './roomLink'

describe('roomFromLink', () => {
  it('reads the full code', () => {
    expect(roomFromLink('?room=hexcrawl-abc234')).toBe('abc234')
  })

  it('reads just the suffix, in any case', () => {
    expect(roomFromLink('?room=ABC234')).toBe('abc234')
  })

  it('finds the room among other parameters', () => {
    expect(roomFromLink('?debug=1&room=abc234')).toBe('abc234')
  })

  it('has nothing for a plain visit', () => {
    expect(roomFromLink('')).toBeNull()
  })

  it('turns down a code that could not be one', () => {
    expect(roomFromLink('?room=abc10l')).toBeNull()
    expect(roomFromLink('?room=')).toBeNull()
  })
})
