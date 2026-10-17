import { describe, expect, it } from 'vitest'
import { seatOf, withSeat, type Seat } from './seats'

const seats: Seat[] = [
  { name: 'Mira', entityId: 'a' },
  { name: 'Tom', entityId: 'b' },
]

describe('seatOf', () => {
  it('finds a name however it is spaced or cased', () => {
    expect(seatOf(seats, '  mira ', () => true)).toEqual({ name: 'Mira', entityId: 'a' })
  })

  it('finds nothing for a new name', () => {
    expect(seatOf(seats, 'Ash', () => true)).toBeUndefined()
  })

  it('finds nothing once the token is gone', () => {
    expect(seatOf(seats, 'Mira', (id) => id !== 'a')).toBeUndefined()
  })
})

describe('withSeat', () => {
  it('adds a new name at the end', () => {
    expect(withSeat(seats, ' Ash ', 'c')).toEqual([...seats, { name: 'Ash', entityId: 'c' }])
  })

  it('moves a name to its new token, leaving one seat for it', () => {
    expect(withSeat(seats, 'MIRA', 'c')).toEqual([
      { name: 'Tom', entityId: 'b' },
      { name: 'MIRA', entityId: 'c' },
    ])
  })

  it('leaves the list it was given alone', () => {
    withSeat(seats, 'Ash', 'c')
    expect(seats).toHaveLength(2)
  })
})
