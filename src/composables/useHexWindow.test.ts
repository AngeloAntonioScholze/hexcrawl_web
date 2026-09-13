import { describe, expect, it } from 'vitest'
import { FAR_BETA } from '../engine/camera'
import { chunkSpanFor, rectCorners, spanCapacity } from '../engine/hexWindow'
import { createLayout } from '../hex/layout'
import { WORLD_SIZES } from '../stores/hexMap'
import {
  budgetFor,
  FARTHEST_ZOOM,
  gridCapacity,
  hexCount,
  maxZoomFor,
  MIN_MAX_ZOOM,
  viewFootprint,
  viewSpan,
  windowCost,
  ZOOM_BUDGET,
  type View,
} from './useHexWindow'

const layout = createLayout(2)

/** The camera's closest lean, which it only takes at its closest zooms. */
const NEAR_BETA = (75 * Math.PI) / 180

const MAP_VIEW: View = { x: 0, z: 0, zoom: 40, aspect: 16 / 9, alpha: -Math.PI / 2, beta: FAR_BETA }

const extent = (view: View): { x: number; z: number } => {
  const corners = viewFootprint(view)
  return {
    x: Math.max(...corners.map((corner) => corner.x)) - view.x,
    z: Math.max(...corners.map((corner) => corner.z)) - view.z,
  }
}

describe('viewFootprint', () => {
  it('lays screen width flat and stretches screen height by the lean', () => {
    // Turned to alpha 0, screen height runs along x and screen width along z.
    const reach = extent({ ...MAP_VIEW, aspect: 1.5, alpha: 0, beta: Math.PI / 3 })
    expect(reach.x).toBeCloseTo(80)
    expect(reach.z).toBeCloseTo(60)
  })

  it('turns with the camera', () => {
    const reach = extent({ ...MAP_VIEW, aspect: 1.5, alpha: Math.PI / 2, beta: Math.PI / 3 })
    expect(reach.x).toBeCloseTo(60)
    expect(reach.z).toBeCloseTo(80)
  })

  it('sits on the view it was given rather than the middle of the world', () => {
    const corners = viewFootprint({ ...MAP_VIEW, x: 100, z: -40 })
    const mean = (values: number[]): number => values.reduce((a, b) => a + b, 0) / values.length
    expect(mean(corners.map((corner) => corner.x))).toBeCloseTo(100)
    expect(mean(corners.map((corner) => corner.z))).toBeCloseTo(-40)
  })

  it('carries fewer chunks than the circle the grid is sized from', () => {
    const zoom = 130
    const reach = Math.hypot((zoom * 16) / 9, zoom)
    const circle = chunkSpanFor(
      layout,
      rectCorners({ minX: -reach, maxX: reach, minZ: -reach, maxZ: reach }),
    )

    expect(spanCapacity(viewSpan(layout, { ...MAP_VIEW, zoom }))).toBeLessThan(spanCapacity(circle))
  })
})

describe('what a view costs', () => {
  it('charges only for ground the world actually has', () => {
    const wide = 400
    expect(windowCost(layout, wide, 20)).toBe(hexCount(20))
  })

  it('charges for the window when the world runs past it', () => {
    expect(windowCost(layout, 40, WORLD_SIZES.huge)).toBeLessThan(hexCount(WORLD_SIZES.huge))
  })
})

describe('maxZoomFor', () => {
  it('lets a world small enough to draw be looked at whole', () => {
    const radius = 40
    const zoom = maxZoomFor(layout, radius)

    // Half the world's height is what a view of that zoom covers.
    expect(zoom).toBeGreaterThanOrEqual(radius * layout.size * 1.5)
  })

  it('stops a world too big to draw where the grid stops', () => {
    const zoom = maxZoomFor(layout, WORLD_SIZES.huge)
    const whole = WORLD_SIZES.huge * layout.size * 1.5

    expect(zoom).toBeLessThan(whole)
    expect(windowCost(layout, zoom, WORLD_SIZES.huge)).toBeLessThanOrEqual(ZOOM_BUDGET)
  })

  it('stops a world too big to see whole at the farthest zoom', () => {
    expect(maxZoomFor(layout, WORLD_SIZES.huge)).toBe(FARTHEST_ZOOM)
  })

  it('still lets the large world be seen whole', () => {
    expect(maxZoomFor(layout, WORLD_SIZES.large)).toBeGreaterThan(FARTHEST_ZOOM)
  })

  it('never asks the grid for more than the ceiling, at any size', () => {
    for (const radius of Object.values(WORLD_SIZES)) {
      const zoom = maxZoomFor(layout, radius)
      expect(windowCost(layout, zoom, radius)).toBeLessThanOrEqual(ZOOM_BUDGET)
    }
  })

  it('keeps a usable view however small the world is', () => {
    expect(maxZoomFor(layout, 1)).toBe(MIN_MAX_ZOOM)
  })

  it('gives a tighter budget a narrower view of the same world', () => {
    const tight = maxZoomFor(layout, WORLD_SIZES.huge, 30_000)
    const roomy = maxZoomFor(layout, WORLD_SIZES.huge)

    expect(tight).toBeLessThan(roomy)
    expect(windowCost(layout, tight, WORLD_SIZES.huge)).toBeLessThanOrEqual(30_000)
  })

  // The floor is a promise about the view, not about the buffers: a budget too
  // small to pay for it loses, and the grid is sized off the same floor.
  it('keeps the floor even when the budget cannot pay for it', () => {
    expect(maxZoomFor(layout, WORLD_SIZES.huge, 1)).toBe(MIN_MAX_ZOOM)
  })
})

describe('gridCapacity', () => {
  it('holds the widest view of any world, not only the named sizes', () => {
    const capacity = gridCapacity(layout)
    for (let radius = 10; radius <= 400; radius += 7) {
      expect(windowCost(layout, maxZoomFor(layout, radius), radius)).toBeLessThanOrEqual(capacity)
    }
  })

  // The frozen map: the large world's limit left standing on the huge one.
  it('cannot hold a view the huge world was never allowed', () => {
    const stale = maxZoomFor(layout, WORLD_SIZES.large)
    const span = viewSpan(layout, { ...MAP_VIEW, zoom: stale })
    expect(spanCapacity(span)).toBeGreaterThan(gridCapacity(layout))
  })
})

describe('viewSpan', () => {
  it('never outgrows the grid, at any turn or lean the camera can take', () => {
    const capacity = gridCapacity(layout)
    const widest = maxZoomFor(layout, WORLD_SIZES.huge)

    for (let step = 0; step < 36; step++) {
      const alpha = (step / 36) * Math.PI
      for (const aspect of [0.5, 16 / 9, 3.5, 5]) {
        const far = viewSpan(layout, { ...MAP_VIEW, zoom: widest, aspect, alpha }, capacity)
        const near = viewSpan(
          layout,
          { ...MAP_VIEW, zoom: 20, aspect, alpha, beta: NEAR_BETA },
          capacity,
        )
        expect(spanCapacity(far)).toBeLessThanOrEqual(capacity)
        expect(spanCapacity(near)).toBeLessThanOrEqual(capacity)
      }
    }
  })

  it('squeezes only a view that would not fit', () => {
    const view = { ...MAP_VIEW, zoom: 60 }
    expect(viewSpan(layout, view, gridCapacity(layout))).toEqual(viewSpan(layout, view))
  })
})

describe('budgetFor', () => {
  it('asks for the whole world when the world is small enough to hold', () => {
    expect(budgetFor(WORLD_SIZES.large)).toBe(hexCount(WORLD_SIZES.large))
  })

  it('stops at the ceiling for a world that is not', () => {
    expect(budgetFor(400)).toBe(ZOOM_BUDGET)
  })
})
