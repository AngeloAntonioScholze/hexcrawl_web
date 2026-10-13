import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { Scene } from '@babylonjs/core/scene'
import { describe, expect, it } from 'vitest'
import { TIMES_OF_DAY, type TimeOfDay } from '../time/clock'
import { bodyDirection, daylightFor, lowness, skyGlow } from './sky'

const DAY: TimeOfDay[] = ['morning', 'noon', 'afternoon', 'twilight']
const NIGHT: TimeOfDay[] = ['dusk', 'midnight', 'late night']

describe('bodyDirection', () => {
  it('carries the sun from east to west across the day', () => {
    const xs = DAY.map((time) => bodyDirection(time).x)
    expect(xs[0]).toBeGreaterThan(0)
    expect(xs[xs.length - 1]).toBeLessThan(0)
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeLessThan(xs[i - 1])
  })

  it('carries the moon from east to west across the night', () => {
    const xs = NIGHT.map((time) => bodyDirection(time).x)
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeLessThan(xs[i - 1])
  })

  it('stands highest at noon and midnight, and down by the horizon at the ends', () => {
    expect(bodyDirection('noon').y).toBeGreaterThan(bodyDirection('morning').y)
    expect(bodyDirection('midnight').y).toBeGreaterThan(bodyDirection('dusk').y)
    expect(lowness(bodyDirection('twilight'))).toBeGreaterThan(0.8)
    expect(lowness(bodyDirection('dawn'))).toBeGreaterThan(0.9)
  })

  it('is a unit vector above the ground every turn', () => {
    for (const time of TIMES_OF_DAY) {
      const toward = bodyDirection(time)
      expect(toward.length()).toBeCloseTo(1)
      expect(toward.y).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('daylightFor', () => {
  it('shines from the body, never from below the light floor', () => {
    for (const time of TIMES_OF_DAY) {
      const { direction } = daylightFor(time)
      expect(direction.y).toBeLessThan(-Math.sin((25 * Math.PI) / 180) + 1e-9)
      expect(Math.sign(direction.x)).toBe(-Math.sign(bodyDirection(time).x) || 0)
    }
  })

  it('goes orange as the sun nears the horizon', () => {
    const noon = daylightFor('noon').warmth
    const twilight = daylightFor('twilight').warmth
    expect(twilight.r).toBeCloseTo(1)
    expect(twilight.b).toBeLessThan(noon.b - 0.3)
    expect(twilight.g).toBeLessThan(noon.g)
  })

  it('lights the night blue', () => {
    for (const time of NIGHT) {
      const { warmth } = daylightFor(time)
      expect(warmth.b).toBeGreaterThan(warmth.r)
    }
  })
})

describe('skyGlow', () => {
  const engine = new NullEngine()
  const scene = new Scene(engine)
  const camera = new ArcRotateCamera('test', -Math.PI / 2, 0.8, 100, Vector3.Zero(), scene)
  const view = () => camera.getViewMatrix(true)

  it('rises on the right of the resting view and sets on the left', () => {
    expect(skyGlow('morning', view()).x).toBeGreaterThan(0.9)
    expect(skyGlow('twilight', view()).x).toBeLessThan(0.1)
    expect(skyGlow('dusk', view()).x).toBeGreaterThan(0.9)
  })

  it('follows the camera round when it turns', () => {
    const before = skyGlow('morning', view())
    camera.alpha += Math.PI
    const after = skyGlow('morning', view())
    camera.alpha -= Math.PI
    expect(after.x).toBeCloseTo(1 - before.x)
  })

  it('glows orange by day and blue by night, strongest at the horizon', () => {
    const [r, , b] = skyGlow('twilight', view()).color
    expect(r).toBeGreaterThan(b)
    const [mr, , mb] = skyGlow('midnight', view()).color
    expect(mb).toBeGreaterThan(mr)
    expect(skyGlow('twilight', view()).strength).toBeGreaterThan(skyGlow('noon', view()).strength)
  })
})
