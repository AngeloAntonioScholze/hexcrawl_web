import { describe, expect, it } from 'vitest'
import { SEAT_TURN, seatAt, seatHeadings, type SeatView } from './stageSeats'

// Heading 0 puts the camera on +x looking back at the centre; +z is then screen right.
const view = (alpha: number): SeatView => ({
  alpha,
  beta: Math.PI / 4,
  right: { x: -Math.sin(alpha), z: Math.cos(alpha) },
  pixelsPerUnit: 10,
})

describe('seatAt', () => {
  it('puts the seat the camera faces at the front, square on', () => {
    const seat = seatAt(0.7, view(0.7), 20)
    expect(seat.x).toBeCloseTo(0)
    expect(seat.y).toBeCloseTo(0)
    expect(seat.facing).toBeCloseTo(1)
  })

  it('swings a seat a quarter round out to the side and up the screen', () => {
    const seat = seatAt(Math.PI / 2, view(0), 20)
    expect(seat.x).toBeCloseTo(200)
    expect(seat.y).toBeLessThan(0)
    expect(seat.facing).toBeCloseTo(0)
  })

  it('stands the seat across the centre behind it, foreshortened by the tilt', () => {
    const seat = seatAt(Math.PI, view(0), 20)
    expect(seat.x).toBeCloseTo(0)
    expect(seat.y).toBeCloseTo(-400 * Math.cos(Math.PI / 4))
    expect(seat.facing).toBeCloseTo(-1)
  })

  it('carries a seat to the front as the camera turns onto its heading', () => {
    const far = seatAt(SEAT_TURN, view(0), 20)
    const half = seatAt(SEAT_TURN, view(SEAT_TURN / 2), 20)
    const there = seatAt(SEAT_TURN, view(SEAT_TURN), 20)
    expect(half.facing).toBeGreaterThan(far.facing)
    expect(there.facing).toBeCloseTo(1)
    expect(Math.abs(half.x)).toBeLessThan(Math.abs(far.x))
  })
})

describe('seatHeadings', () => {
  it('spaces three seats a third of the way round from home', () => {
    const { home, host, join } = seatHeadings(0.3, view(0.3).right)
    expect(Math.abs(host - home)).toBeCloseTo(SEAT_TURN)
    expect(Math.abs(join - home)).toBeCloseTo(SEAT_TURN)
    expect(host).not.toBeCloseTo(join)
  })

  it('puts host on the right of the screen from home, whichever way right points', () => {
    for (const flip of [1, -1]) {
      const right = { x: 0, z: flip }
      const { host, join } = seatHeadings(0, right)
      const at = { ...view(0), right }
      expect(seatAt(host, at, 20).x).toBeGreaterThan(0)
      expect(seatAt(join, at, 20).x).toBeLessThan(0)
    }
  })
})
