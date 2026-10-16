import { describe, expect, it } from 'vitest'
import {
  WAVE_BAND,
  WAVE_GAP,
  WAVE_PEAK,
  WAVE_QUEUE,
  WAVE_REACH,
  WAVE_SPEED,
  nextWaveStart,
  waveDone,
  waveLift,
} from './fogWave'

/** When the front reaches a hex this far out. */
const arrival = (distance: number): number => distance / WAVE_SPEED

describe('waveLift', () => {
  it('leaves a hex still until the front reaches it', () => {
    expect(waveLift(10, 0)).toBe(0)
    expect(waveLift(10, arrival(10))).toBe(0)
    expect(waveLift(10, arrival(9))).toBe(0)
  })

  it('raises a hex as the front passes and sets it back down behind the band', () => {
    const rising = waveLift(10, arrival(10 + WAVE_BAND / 4))
    const crest = waveLift(10, arrival(10 + WAVE_BAND / 2))
    const falling = waveLift(10, arrival(10 + (3 * WAVE_BAND) / 4))
    expect(rising).toBeGreaterThan(0)
    expect(crest).toBeGreaterThan(rising)
    expect(falling).toBeCloseTo(rising, 10)
    expect(waveLift(10, arrival(10 + WAVE_BAND))).toBe(0)
    expect(waveLift(10, arrival(30))).toBe(0)
  })

  it('never sinks a hex below where it rests', () => {
    for (let elapsed = 0; elapsed < arrival(WAVE_REACH + WAVE_BAND); elapsed += 7) {
      for (let distance = 0; distance < WAVE_REACH + 5; distance += 0.5) {
        expect(waveLift(distance, elapsed)).toBeGreaterThanOrEqual(0)
        expect(waveLift(distance, elapsed)).toBeLessThanOrEqual(WAVE_PEAK)
      }
    }
  })

  it('swells less the farther out the ring has spread', () => {
    const crestAt = (distance: number): number =>
      waveLift(distance, arrival(distance + WAVE_BAND / 2))
    expect(crestAt(2)).toBeGreaterThan(crestAt(15))
    expect(crestAt(15)).toBeGreaterThan(crestAt(35))
  })

  it('never reaches past its reach', () => {
    for (let elapsed = 0; elapsed < arrival(WAVE_REACH * 2); elapsed += 11) {
      expect(waveLift(WAVE_REACH, elapsed)).toBe(0)
      expect(waveLift(WAVE_REACH + 3, elapsed)).toBe(0)
    }
  })
})

describe('waveDone', () => {
  it('runs until the band has cleared the farthest hex', () => {
    expect(waveDone(arrival(20), 20)).toBe(false)
    expect(waveDone(arrival(20 + WAVE_BAND) - 1, 20)).toBe(false)
    expect(waveDone(arrival(20 + WAVE_BAND), 20)).toBe(true)
  })

  it('ends at the reach on a map wider than it', () => {
    expect(waveDone(arrival(WAVE_REACH + WAVE_BAND), 500)).toBe(true)
  })

  it('leaves every hex at rest once it reports done', () => {
    const farthest = 30
    let elapsed = 0
    while (!waveDone(elapsed, farthest)) elapsed += 16
    for (let distance = 0; distance <= farthest; distance += 0.25) {
      expect(waveLift(distance, elapsed)).toBe(0)
    }
  })
})

describe('nextWaveStart', () => {
  it('sets off at once with nothing rolling', () => {
    expect(nextWaveStart([], 100)).toBe(100)
  })

  it('sets off at once when the last ring is a band ahead already', () => {
    expect(nextWaveStart([0], WAVE_GAP + 5)).toBe(WAVE_GAP + 5)
  })

  it('follows one band behind a ring that has only just set off', () => {
    expect(nextWaveStart([100], 150)).toBe(100 + WAVE_GAP)
    expect(nextWaveStart([100, 100 + WAVE_GAP], 150)).toBe(100 + 2 * WAVE_GAP)
  })

  it('adds none once the queue is full', () => {
    const starts = [100]
    for (let i = 0; i < WAVE_QUEUE; i++) starts.push(nextWaveStart(starts, 150)!)
    expect(nextWaveStart(starts, 150)).toBeNull()
  })
})
