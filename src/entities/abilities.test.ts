import { describe, expect, it } from 'vitest'
import {
  ABILITY_LIMITS,
  abilityModifier,
  clampAbility,
  defaultAbilities,
  hasAbilities,
  isAbilityScore,
} from './abilities'

describe('abilities', () => {
  it('belong to parties and npcs alone', () => {
    expect(hasAbilities('party')).toBe(true)
    expect(hasAbilities('npc')).toBe(true)
    expect(hasAbilities('caravan')).toBe(false)
    expect(hasAbilities('ship')).toBe(false)
  })

  it('start at ten across the board', () => {
    expect(Object.values(defaultAbilities())).toEqual([10, 10, 10, 10, 10, 10])
  })

  it('give the modifier the whole table lists', () => {
    const table: [number, number][] = [
      [1, -5],
      [2, -4],
      [3, -4],
      [4, -3],
      [5, -3],
      [6, -2],
      [7, -2],
      [8, -1],
      [9, -1],
      [10, 0],
      [11, 0],
      [12, 1],
      [13, 1],
      [14, 2],
      [15, 2],
      [16, 3],
      [17, 3],
      [18, 4],
      [19, 4],
      [20, 5],
    ]
    for (const [score, modifier] of table) expect(abilityModifier(score)).toBe(modifier)
  })

  it('are clamped to whole numbers from one to twenty', () => {
    expect(clampAbility(0)).toBe(ABILITY_LIMITS.min)
    expect(clampAbility(25)).toBe(ABILITY_LIMITS.max)
    expect(clampAbility(13.6)).toBe(14)
    expect(clampAbility(Number.NaN)).toBe(10)
  })

  it('accept only whole scores in range', () => {
    expect(isAbilityScore(1)).toBe(true)
    expect(isAbilityScore(20)).toBe(true)
    expect(isAbilityScore(0)).toBe(false)
    expect(isAbilityScore(21)).toBe(false)
    expect(isAbilityScore(10.5)).toBe(false)
    expect(isAbilityScore('10')).toBe(false)
  })
})
