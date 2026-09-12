import { NullEngine } from '@babylonjs/core/Engines/nullEngine'
import { Scene } from '@babylonjs/core/scene'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { hexKey, type Axial } from '../hex/coords'
import { createLayout, hexToWorld } from '../hex/layout'
import { createVisionOverlay, type VisionOverlay } from './visionOverlay'

const layout = createLayout(2)
const elevations = new Map<string, number>()
const elevationOf = (hex: Axial): number => elevations.get(hexKey(hex)) ?? 1

const LIFT = 0.05

let engine: NullEngine
let scene: Scene
let overlay: VisionOverlay

beforeEach(() => {
  elevations.clear()
  engine = new NullEngine()
  scene = new Scene(engine)
  overlay = createVisionOverlay(scene, layout, elevationOf)
})

afterEach(() => {
  overlay.dispose()
  scene.dispose()
  engine.dispose()
})

describe('createVisionOverlay', () => {
  it('starts hidden and empty', () => {
    expect(overlay.litCount).toBe(0)
    expect(overlay.shadowCount).toBe(0)
    expect(overlay.lit.isVisible).toBe(false)
    expect(overlay.shadow.isVisible).toBe(false)
  })

  it('draws one plate per hex on each side of the field', () => {
    overlay.setShown(true)
    overlay.setField(
      [
        { q: 0, r: 0 },
        { q: 1, r: 0 },
      ],
      [{ q: 2, r: 0 }],
    )

    expect(overlay.litCount).toBe(2)
    expect(overlay.shadowCount).toBe(1)
    expect(overlay.lit.thinInstanceCount).toBe(2)
    expect(overlay.shadow.thinInstanceCount).toBe(1)
  })

  it('stays hidden while the toggle is off, however full the field is', () => {
    overlay.setField([{ q: 0, r: 0 }], [{ q: 1, r: 0 }])

    expect(overlay.lit.isVisible).toBe(false)
    expect(overlay.shadow.isVisible).toBe(false)
  })

  it('shows both halves once the toggle goes on', () => {
    overlay.setField([{ q: 0, r: 0 }], [{ q: 1, r: 0 }])
    overlay.setShown(true)

    expect(overlay.lit.isVisible).toBe(true)
    expect(overlay.shadow.isVisible).toBe(true)
  })

  it('keeps an empty half hidden rather than drawing nothing at the origin', () => {
    overlay.setShown(true)
    overlay.setField([{ q: 0, r: 0 }], [])

    expect(overlay.lit.isVisible).toBe(true)
    expect(overlay.shadow.isVisible).toBe(false)
  })

  it('lays each plate over its own hex, clear of the terrain', () => {
    const hex = { q: 2, r: -1 }
    elevations.set(hexKey(hex), 3)
    overlay.setShown(true)
    overlay.setField([hex], [])

    const matrix = overlay.lit.thinInstanceGetWorldMatrices()[0]
    const world = hexToWorld(layout, hex)
    const placed = matrix.getTranslation()

    expect(placed.x).toBeCloseTo(world.x, 6)
    expect(placed.y).toBeCloseTo(3 + LIFT, 6)
    expect(placed.z).toBeCloseTo(world.z, 6)
  })

  it('replaces the whole field rather than piling plates up', () => {
    overlay.setShown(true)
    overlay.setField(
      [
        { q: 0, r: 0 },
        { q: 1, r: 0 },
      ],
      [{ q: 2, r: 0 }],
    )
    overlay.setField([{ q: 5, r: 0 }], [])

    expect(overlay.litCount).toBe(1)
    expect(overlay.shadowCount).toBe(0)
  })
})
