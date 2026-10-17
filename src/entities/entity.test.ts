import { describe, expect, it } from 'vitest'
import { TURNS_PER_PHASE } from '../time/clock'
import { MIN_NIGHT_SIGHT, newEntity, sightAt } from './entity'

const NIGHT = TURNS_PER_PHASE

describe('sightAt', () => {
  it('cuts sight down after dark', () => {
    const scout = { ...newEntity('the scout', 0), sight: 6 }
    expect(sightAt(scout, 0)).toBe(6)
    expect(sightAt(scout, NIGHT)).toBe(2)
  })

  it('never leaves an entity blind', () => {
    expect(sightAt({ ...newEntity('the mole', 0), sight: 1 }, NIGHT)).toBe(MIN_NIGHT_SIGHT)
  })

  it('leaves darkvision its whole sight by night', () => {
    const scout = { ...newEntity('the scout', 0), sight: 6, darkvision: true }
    expect(sightAt(scout, NIGHT)).toBe(6)
  })

  it('starts every new entity without darkvision', () => {
    expect(newEntity('the party', 0).darkvision).toBe(false)
  })
})
