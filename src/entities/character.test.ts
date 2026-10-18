import { describe, expect, it } from 'vitest'
import {
  CHARACTER_LEVELS,
  characterIn,
  clampCharacterLevel,
  clampPurse,
  DEFAULT_CHARACTER,
  editCharacter,
  hasCharacter,
  PURSE_LIMITS,
  type CharacterSheet,
} from './character'

const empty: CharacterSheet = new Map()

describe('characters', () => {
  it('belong to parties and npcs, never to caravans or ships', () => {
    expect(hasCharacter('party')).toBe(true)
    expect(hasCharacter('npc')).toBe(true)
    expect(hasCharacter('caravan')).toBe(false)
    expect(hasCharacter('ship')).toBe(false)
  })

  it('start with an empty purse at the first level', () => {
    expect(characterIn(empty, 'p')).toEqual({ purse: 0, level: 1 })
    expect(DEFAULT_CHARACTER).toEqual({ purse: 0, level: 1 })
  })

  it('keep a purse in whole coins between none and the most it holds', () => {
    expect(clampPurse(-5)).toBe(0)
    expect(clampPurse(12.6)).toBe(13)
    expect(clampPurse(1e12)).toBe(PURSE_LIMITS.max)
    expect(clampPurse(Number.NaN)).toBe(0)
  })

  it('keep a level a whole number from 1 to 20', () => {
    expect(clampCharacterLevel(0)).toBe(1)
    expect(clampCharacterLevel(7.4)).toBe(7)
    expect(clampCharacterLevel(99)).toBe(CHARACTER_LEVELS.max)
    expect(clampCharacterLevel(Number.NaN)).toBe(CHARACTER_LEVELS.min)
  })

  it('change one entity and leave the rest at what they were', () => {
    const sheet = editCharacter(empty, 'p', { purse: 30 })
    const next = editCharacter(sheet, 'p', { level: 4 })

    expect(characterIn(next, 'p')).toEqual({ purse: 30, level: 4 })
    expect(characterIn(next, 'q')).toEqual(DEFAULT_CHARACTER)
    expect(characterIn(sheet, 'p')).toEqual({ purse: 30, level: 1 })
  })

  it('hand the same sheet back for an edit that changes nothing', () => {
    expect(editCharacter(empty, 'p', { purse: -3 })).toBe(empty)
    expect(editCharacter(empty, 'p', {})).toBe(empty)
  })
})
