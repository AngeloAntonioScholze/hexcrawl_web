import { describe, expect, it } from 'vitest'
import { boxContains, minimapToWorld, viewBox, worldToMinimap, type MinimapFrame } from './minimap'

const frame: MinimapFrame = { bounds: { minX: -100, maxX: 100, minZ: -50, maxZ: 50 }, size: 200 }

describe('worldToMinimap', () => {
  it('fits the longer world axis to the drawing', () => {
    expect(worldToMinimap(frame, -100, 50)).toEqual({ x: 0, y: 0 })
    expect(worldToMinimap(frame, 100, 50)).toEqual({ x: 200, y: 0 })
  })

  it('draws the far edge of the world at the top', () => {
    expect(worldToMinimap(frame, 0, 50).y).toBeLessThan(worldToMinimap(frame, 0, -50).y)
  })
})

describe('minimapToWorld', () => {
  it('undoes worldToMinimap', () => {
    for (const [x, z] of [
      [0, 0],
      [-73.5, 12],
      [100, -50],
    ]) {
      const back = minimapToWorld(frame, worldToMinimap(frame, x, z))
      expect(back.x).toBeCloseTo(x, 10)
      expect(back.z).toBeCloseTo(z, 10)
    }
  })
})

describe('viewBox', () => {
  it('centres on the camera target and scales with zoom and aspect', () => {
    const box = viewBox(frame, { x: 10, z: -10 }, 20, 2, 3)
    expect(box).toEqual({ x: 110, y: 60, width: 80, height: 40 })
  })

  it('never draws thinner than the least size', () => {
    const box = viewBox(frame, { x: 0, z: 0 }, 0.1, 1, 3)
    expect(box.width).toBe(3)
    expect(box.height).toBe(3)
  })
})

describe('boxContains', () => {
  const box = { x: 50, y: 50, width: 20, height: 10 }

  it('takes points inside and on the edge', () => {
    expect(boxContains(box, { x: 50, y: 50 })).toBe(true)
    expect(boxContains(box, { x: 60, y: 55 })).toBe(true)
  })

  it('refuses points outside', () => {
    expect(boxContains(box, { x: 61, y: 50 })).toBe(false)
    expect(boxContains(box, { x: 50, y: 44 })).toBe(false)
  })
})
