import { describe, expect, it } from 'vitest'
import { hexKey, type Axial } from '../hex/coords'
import { createLayout, hexToWorld, worldToHex } from '../hex/layout'
import { hexUnderRay, neighborUnderRay } from './groundPick'

const layout = createLayout(2)
const SIZE = layout.size

const heights = (entries: [Axial, number][], floor?: number) => {
  const map = new Map(entries.map(([hex, height]) => [hexKey(hex), height]))
  return (hex: Axial): number | undefined => map.get(hexKey(hex)) ?? floor
}

// Aimed so that, unobstructed, it reaches the ground at the centre of `hex`.
const rayOnto = (hex: Axial, direction: { x: number; y: number; z: number }) => {
  const ground = hexToWorld(layout, hex)
  const back = 50
  return {
    origin: {
      x: ground.x - direction.x * back,
      y: -direction.y * back,
      z: ground.z - direction.z * back,
    },
    direction,
  }
}

const SLANT = { x: 0, y: -1, z: 0.9 }

describe('hexUnderRay', () => {
  it('lands on the hex straight below', () => {
    const hex = { q: 3, r: -2 }
    const ray = rayOnto(hex, { x: 0, y: -1, z: 0 })
    expect(hexUnderRay(layout, ray, heights([], 1), 1, SIZE)).toEqual(hex)
  })

  it('stops on a tall hex standing in front of the ground point', () => {
    const behind = { q: 0, r: 0 }
    const ray = rayOnto(behind, SLANT)
    const front = worldToHex(layout, {
      x: hexToWorld(layout, behind).x,
      z: hexToWorld(layout, behind).z - 4 * 0.9,
    })
    expect(front).not.toEqual(behind)

    const lookup = heights([[front, 6]], 0.5)
    expect(hexUnderRay(layout, ray, lookup, 6, SIZE)).toEqual(front)
  })

  it('meets raised flat ground where the ray crosses its top, not at y=0', () => {
    const ray = rayOnto({ q: 0, r: 0 }, SLANT)
    const lookup = heights([], 5)
    const top = 5 / -SLANT.y
    const expected = worldToHex(layout, {
      x: ray.origin.x + SLANT.x * (-ray.origin.y / SLANT.y - top),
      z: ray.origin.z + SLANT.z * (-ray.origin.y / SLANT.y - top),
    })
    expect(hexUnderRay(layout, ray, lookup, 5, SIZE)).toEqual(expected)
    expect(expected).not.toEqual({ q: 0, r: 0 })
  })

  it('misses where the window holds no hex', () => {
    const ray = rayOnto({ q: 40, r: 0 }, SLANT)
    expect(hexUnderRay(layout, ray, heights([[{ q: 0, r: 0 }, 1]]), 1, SIZE)).toBeNull()
  })

  it('falls through the border gap between tiles', () => {
    const edge = {
      x: (hexToWorld(layout, { q: 0, r: 0 }).x + hexToWorld(layout, { q: 1, r: 0 }).x) / 2,
      z: 0,
    }
    const ray = { origin: { x: edge.x, y: 10, z: edge.z }, direction: { x: 0, y: -1, z: 0 } }
    const lookup = heights([], 1)
    expect(hexUnderRay(layout, ray, lookup, 1, SIZE)).not.toBeNull()
    expect(hexUnderRay(layout, ray, lookup, 1, SIZE * 0.94)).toBeNull()
  })

  it('misses a ray that does not come down', () => {
    const ray = { origin: { x: 0, y: 10, z: 0 }, direction: { x: 0, y: 0.2, z: 1 } }
    expect(hexUnderRay(layout, ray, heights([], 1), 1, SIZE)).toBeNull()
  })
})

describe('neighborUnderRay', () => {
  const toward = (hex: Axial, other: Axial, top: number) => {
    const from = hexToWorld(layout, hex)
    const to = hexToWorld(layout, other)
    const x = from.x + (to.x - from.x) * 0.4
    const z = from.z + (to.z - from.z) * 0.4
    // Slanted, so a ray read at y=0 instead of on the top would land elsewhere.
    const direction = { x: 0, y: -1, z: 0.9 }
    return { origin: { x, y: top + 10, z: z - 9 }, direction }
  }

  it.each([
    [{ q: 1, r: 0 }],
    [{ q: 1, r: -1 }],
    [{ q: 0, r: -1 }],
    [{ q: -1, r: 0 }],
    [{ q: -1, r: 1 }],
    [{ q: 0, r: 1 }],
  ])('picks the neighbour across the side the ray meets the top nearest, toward %o', (other) => {
    const hex = { q: 2, r: -1 }
    const across = { q: hex.q + other.q, r: hex.r + other.r }
    expect(neighborUnderRay(layout, toward(hex, across, 4), hex, 4)).toEqual(across)
  })
})
