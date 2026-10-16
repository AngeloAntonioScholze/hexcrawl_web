import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import type { Mesh } from '@babylonjs/core/Meshes/mesh'
import { Scene } from '@babylonjs/core/scene'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LID_DRIFT, LID_MS, LID_RISE, createFogLids, lidPose, type FogLids } from './fogLids'

describe('lidPose', () => {
  it('starts solid and flat on the hex it comes off', () => {
    expect(lidPose(0)).toEqual({ drift: 0, rise: 0, roll: 0, alpha: 1, pale: 0 })
  })

  it('tips over, lifts and is carried off faster and faster, thinning as it goes', () => {
    const early = lidPose(0.25)
    const mid = lidPose(0.5)
    const late = lidPose(0.75)
    expect(mid.roll).toBeGreaterThan(early.roll)
    expect(mid.rise).toBeGreaterThan(early.rise)
    expect(late.drift - mid.drift).toBeGreaterThan(mid.drift - early.drift)
    expect(late.alpha).toBeLessThan(mid.alpha)
    expect(mid.pale).toBeGreaterThan(early.pale)
    expect(late.pale).toBe(1)
  })

  it('is gone by the end', () => {
    const end = lidPose(1)
    expect(end.alpha).toBe(0)
    expect(end.drift).toBeCloseTo(LID_DRIFT)
    expect(end.rise).toBeCloseTo(LID_RISE)
    expect(lidPose(2)).toEqual(end)
  })
})

describe('createFogLids', () => {
  let engine: NullEngine
  let scene: Scene
  let lids: FogLids

  beforeEach(() => {
    engine = new NullEngine()
    scene = new Scene(engine)
    // No stray in heading or pace: every lid goes exactly where it is sent.
    lids = createFogLids(scene, 1, new Color3(0.1, 0.1, 0.1), { random: () => 0.5 })
  })

  afterEach(() => {
    lids.dispose()
    scene.dispose()
    engine.dispose()
  })

  const mesh = (): Mesh => scene.getMeshByName('fogLids') as Mesh

  it('blows each lid off its hex along its heading, top tipping toward it', () => {
    lids.lift(3, 2, -1, 1, 0, 0)
    lids.lift(5, 1, 4, 0, -2, 0)
    lids.step(LID_MS / 2)

    expect(lids.active).toBe(true)
    expect(mesh().thinInstanceCount).toBe(2)
    const [first, second] = mesh().thinInstanceGetWorldMatrices()

    const at = first.getTranslation()
    expect(at.x).toBeGreaterThan(3)
    expect(at.y).toBeGreaterThan(2)
    expect(at.z).toBeCloseTo(-1)
    expect(Vector3.TransformNormal(Vector3.Up(), first).x).toBeGreaterThan(0)

    expect(second.getTranslation().z).toBeLessThan(4)
    expect(Vector3.TransformNormal(Vector3.Up(), second).z).toBeLessThan(0)
  })

  it('hides the bare prism while no lid is in the air', () => {
    expect(mesh().isVisible).toBe(false)
    lids.lift(0, 1, 0, 1, 0, 0)
    lids.step(1)
    expect(mesh().isVisible).toBe(true)
    lids.step(LID_MS * 2)
    expect(mesh().isVisible).toBe(false)
  })

  it('drops each lid once its flight is over', () => {
    lids.lift(0, 1, 0, 1, 0, 0)
    lids.lift(0, 1, 0, 1, 0, LID_MS / 2)
    lids.step(LID_MS)
    expect(mesh().thinInstanceCount).toBe(1)
    lids.step(LID_MS * 2)
    expect(lids.active).toBe(false)
    expect(mesh().thinInstanceCount).toBe(0)
  })
})
