import { describe, expect, it } from 'vitest'
import { createLayout } from '../hex/layout'
import { WORLD_SIZES } from '../stores/hexMap'
import {
  budgetFor,
  hexCount,
  maxZoomFor,
  MIN_MAX_ZOOM,
  viewRect,
  windowCost,
  ZOOM_BUDGET,
} from './useHexWindow'

const layout = createLayout(2)

describe('viewRect', () => {
  it('reaches far enough to cover the view at any rotation', () => {
    const rect = viewRect({ x: 0, z: 0 }, 40, 2)

    // The corner of the unrotated view is the furthest point the camera can
    // swing over the ground, so the rectangle has to hold it.
    expect(rect.maxX).toBeGreaterThanOrEqual(Math.hypot(80, 40))
    expect(rect.maxZ).toBeGreaterThanOrEqual(Math.hypot(80, 40))
  })

  it('sits on the view it was given rather than the middle of the world', () => {
    const rect = viewRect({ x: 100, z: -40 }, 20, 1)
    expect((rect.minX + rect.maxX) / 2).toBeCloseTo(100)
    expect((rect.minZ + rect.maxZ) / 2).toBeCloseTo(-40)
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

describe('budgetFor', () => {
  it('asks for the whole world when the world is small enough to hold', () => {
    expect(budgetFor(WORLD_SIZES.large)).toBe(hexCount(WORLD_SIZES.large))
  })

  it('stops at the ceiling for a world that is not', () => {
    expect(budgetFor(WORLD_SIZES.huge)).toBe(ZOOM_BUDGET)
  })
})
