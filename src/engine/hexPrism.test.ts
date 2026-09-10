import { describe, expect, it } from 'vitest'
import { corners, createLayout } from '../hex/layout'
import { buildHexPrismGeometry, hexCornerOffsets } from './hexPrism'

const SIZE = 3

describe('hexCornerOffsets', () => {
  it('matches the layout corners of a hex at the origin', () => {
    const expected = corners(createLayout(SIZE), { q: 0, r: 0 })
    const actual = hexCornerOffsets(SIZE)
    expect(actual).toHaveLength(6)
    actual.forEach((offset, i) => {
      expect(offset.x).toBeCloseTo(expected[i].x, 10)
      expect(offset.z).toBeCloseTo(expected[i].z, 10)
    })
  })

  it('scales with the layout size', () => {
    for (const offset of hexCornerOffsets(7)) {
      expect(Math.hypot(offset.x, offset.z)).toBeCloseTo(7, 10)
    }
  })
})

describe('buildHexPrismGeometry', () => {
  const SEGMENTS = 3
  const BEVEL = 0.14
  const geometry = buildHexPrismGeometry(SIZE, { bevel: BEVEL, bevelSegments: SEGMENTS })
  const vertex = (i: number): [number, number, number] => [
    geometry.positions[i * 3],
    geometry.positions[i * 3 + 1],
    geometry.positions[i * 3 + 2],
  ]
  const normal = (i: number): [number, number, number] => [
    geometry.normals[i * 3],
    geometry.normals[i * 3 + 1],
    geometry.normals[i * 3 + 2],
  ]
  const vertexCount = geometry.positions.length / 3

  it('spans exactly one unit of height so elevation is the instance Y scale', () => {
    const ys = geometry.positions.filter((_, i) => i % 3 === 1)
    expect(Math.min(...ys)).toBe(0)
    expect(Math.max(...ys)).toBe(1)
  })

  it('insets the flat top by the bevel radius', () => {
    expect(vertex(0)).toEqual([0, 1, 0])
    for (let i = 1; i <= 6; i++) {
      const [x, y, z] = vertex(i)
      expect(y).toBe(1)
      expect(Math.hypot(x, z)).toBeCloseTo(SIZE - SIZE * BEVEL, 10)
    }
  })

  it('reaches the full hex radius at the wall', () => {
    const widest = Math.max(
      ...Array.from({ length: vertexCount }, (_, i) => {
        const [x, , z] = vertex(i)
        return Math.hypot(x, z)
      }),
    )
    expect(widest).toBeCloseTo(SIZE, 10)
  })

  it('rolls the edge over the bevel rather than cutting one chamfer', () => {
    // A rounded edge produces a spread of partly-up normals; a single chamfer
    // would produce just one repeated value.
    const tilted = new Set<string>()
    for (let i = 7; i < vertexCount; i++) {
      const [, ny] = normal(i)
      if (ny > 0.05 && ny < 0.95) tilted.add(ny.toFixed(4))
    }
    expect(tilted.size).toBeGreaterThanOrEqual(SEGMENTS)
  })

  it('keeps the wall vertical below the bevel', () => {
    let verticalWall = 0
    for (let i = 7; i < vertexCount; i++) {
      if (vertex(i)[1] === 0 && Math.abs(normal(i)[1]) < 0.02) verticalWall++
    }
    expect(verticalWall).toBe(12)
  })

  it('points every side and bevel normal outward', () => {
    for (let i = 7; i < vertexCount; i++) {
      const [x, , z] = vertex(i)
      const [nx, , nz] = normal(i)
      expect(nx * x + nz * z, `vertex ${i}`).toBeGreaterThan(0)
    }
  })

  it('points the top cap normals straight up', () => {
    for (let i = 0; i <= 6; i++) {
      expect(geometry.normals[i * 3 + 1]).toBeCloseTo(1, 6)
    }
  })

  it('produces a unit normal per vertex', () => {
    expect(geometry.normals).toHaveLength(geometry.positions.length)
    for (let i = 0; i < vertexCount; i++) {
      const [nx, ny, nz] = normal(i)
      expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 6)
    }
  })

  it('adds a ring per bevel segment', () => {
    const perFace = (SEGMENTS + 2) * 2
    expect(vertexCount).toBe(7 + 6 * perFace)
  })

  it('references only existing vertices', () => {
    for (const index of geometry.indices) {
      expect(index).toBeGreaterThanOrEqual(0)
      expect(index).toBeLessThan(vertexCount)
    }
  })
})
