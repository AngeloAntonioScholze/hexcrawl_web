import { describe, expect, it } from 'vitest'
import { plainName } from './names'

describe('plainName', () => {
  it('folds compatibility forms and trims, keeping case', () => {
    expect(plainName('  Ｍｉｒａ ')).toBe('Mira')
    expect(plainName('ﬁona')).toBe('fiona')
  })

  it('drops zero-width, bidi and control characters', () => {
    expect(plainName('Mi​ra‍﻿')).toBe('Mira')
    expect(plainName('‮Mira‬⁦⁩‎‏')).toBe('Mira')
    expect(plainName('Mi\u0000ra\u0007\n')).toBe('Mira')
  })

  it('leaves look-alike letters from other scripts as they are', () => {
    expect(plainName('Мira')).toBe('Мira')
  })

  it('is the same on a name already plain', () => {
    const typed = 'e‍́ Ｍｉｒａ‮'
    expect(plainName(plainName(typed))).toBe(plainName(typed))
    expect(plainName(typed)).toBe('é Mira')
  })

  it('is nothing for a name of only marks', () => {
    expect(plainName('​‮⁦')).toBe('')
  })
})
