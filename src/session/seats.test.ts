import { describe, expect, it } from 'vitest'
import { assignSeat, seatAt, seatOf, seatsOf, withSeat, type Seat } from './seats'

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

describe('seatsOf', () => {
  const several: Seat[] = [...seats, { name: 'mira', entityId: 'c' }]

  it('lists every token a name plays, in the order it got them', () => {
    expect(seatsOf(several, ' MIRA', () => true)).toEqual(['a', 'c'])
  })

  it('leaves out tokens no longer on the map', () => {
    expect(seatsOf(several, 'Mira', (id) => id !== 'a')).toEqual(['c'])
  })

  it('lists nothing for a new name', () => {
    expect(seatsOf(several, 'Ash', () => true)).toEqual([])
  })
})

describe('seatAt', () => {
  it('finds who plays a token', () => {
    expect(seatAt(seats, 'b')).toEqual({ name: 'Tom', entityId: 'b' })
    expect(seatAt(seats, 'z')).toBeUndefined()
  })
})

describe('assignSeat', () => {
  it('gives a seated name one more token, under the name it was first seated as', () => {
    expect(assignSeat(seats, 'c', ' mira ')).toEqual([...seats, { name: 'Mira', entityId: 'c' }])
  })

  it('moves a token from one player to another', () => {
    expect(assignSeat(seats, 'a', 'Tom')).toEqual([
      { name: 'Tom', entityId: 'b' },
      { name: 'Tom', entityId: 'a' },
    ])
  })

  it("takes a token out of everybody's hands", () => {
    expect(assignSeat(seats, 'a', null)).toEqual([{ name: 'Tom', entityId: 'b' }])
    expect(assignSeat(seats, 'a', '  ')).toEqual([{ name: 'Tom', entityId: 'b' }])
  })

  it('seats a name new to the map', () => {
    expect(assignSeat(seats, 'c', ' Ash ')).toEqual([...seats, { name: 'Ash', entityId: 'c' }])
  })
})
