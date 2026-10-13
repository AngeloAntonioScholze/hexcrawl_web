import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { Scene } from '@babylonjs/core/scene'

// Unit height, so per-tile elevation is just the Y scale of the instance matrix.
const HEIGHT = 1

export interface HexPrismOptions {
  /** Radius of the rounded top edge, as a fraction of the hex size. */
  bevel?: number
  /** Segments across the rounded edge; more means a smoother roll-off. */
  bevelSegments?: number
}

export interface HexPrismGeometry {
  positions: number[]
  indices: number[]
  normals: number[]
}

const DEFAULT_BEVEL = 0.14
const DEFAULT_BEVEL_SEGMENTS = 3

/** How far the rounded edge reaches in from the rim, in world units. */
export const bevelRadius = (size: number, bevel = DEFAULT_BEVEL): number =>
  Math.min(size * bevel, size * 0.4)

// Matches hex/layout corners(): vertex angles at 60i - 30 degrees, giving a
// pointy-top hexagon on the XZ plane.
export function hexCornerOffsets(size: number): { x: number; z: number }[] {
  const result: { x: number; z: number }[] = []
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 180) * (60 * i - 30)
    result.push({ x: size * Math.cos(angle), z: size * Math.sin(angle) })
  }
  return result
}

export interface ProfileRing {
  /** Centre-to-corner radius of the ring. */
  radius: number
  /** Height of the ring on the unit-height prism. */
  y: number
}

/**
 * The rings of the top, from the rim of the flat cap out to the top of the
 * wall, each a hexagon flat across every side. No bevel is a plain prism: the
 * cap's rim is the top of the wall, the only ring.
 */
export function bevelProfile(size: number, options: HexPrismOptions = {}): ProfileRing[] {
  const bevel = bevelRadius(size, options.bevel)
  const segments = bevel > 0 ? Math.max(1, options.bevelSegments ?? DEFAULT_BEVEL_SEGMENTS) : 0
  const capRadius = size - bevel
  // A quarter-round profile: each ring steps outward and downward along the arc,
  // ending flush with the wall.
  const profile: ProfileRing[] = []
  for (let step = 0; step <= segments; step++) {
    const angle = segments > 0 ? (Math.PI / 2) * (step / segments) : 0
    profile.push({
      radius: capRadius + bevel * Math.sin(angle),
      y: HEIGHT - bevel * (1 - Math.cos(angle)),
    })
  }
  return profile
}

export function buildHexPrismGeometry(
  size: number,
  options: HexPrismOptions = {},
): HexPrismGeometry {
  const unit = hexCornerOffsets(1)

  const positions: number[] = []
  const indices: number[] = []

  // The top cap sits inset by the bevel radius; the rounded edge rolls from its
  // rim out to the full hex radius before the wall drops straight down.
  const profile = bevelProfile(size, options)
  const capRadius = profile[0].radius
  positions.push(0, HEIGHT, 0)
  for (const corner of unit) positions.push(corner.x * capRadius, HEIGHT, corner.z * capRadius)
  for (let i = 0; i < 6; i++) {
    indices.push(0, 1 + i, 1 + ((i + 1) % 6))
  }

  profile.push({ radius: size, y: 0 })

  // Each side gets its own vertices so faces shade flat across the hex, while
  // rings within a side are shared so the rounded edge shades smoothly.
  for (let face = 0; face < 6; face++) {
    const a = unit[face]
    const b = unit[(face + 1) % 6]
    const base = positions.length / 3

    for (const ring of profile) {
      positions.push(a.x * ring.radius, ring.y, a.z * ring.radius)
      positions.push(b.x * ring.radius, ring.y, b.z * ring.radius)
    }

    for (let ring = 0; ring < profile.length - 1; ring++) {
      const top = base + ring * 2
      const bottom = top + 2
      indices.push(top, bottom, top + 1, top + 1, bottom, bottom + 1)
    }
  }

  const normals: number[] = []
  VertexData.ComputeNormals(positions, indices, normals)

  return { positions, indices, normals }
}

export function createHexPrismMesh(
  scene: Scene,
  size: number,
  name = 'hex',
  options: HexPrismOptions = {},
): Mesh {
  const mesh = new Mesh(name, scene)
  const geometry = buildHexPrismGeometry(size, options)

  const vertexData = new VertexData()
  vertexData.positions = geometry.positions
  vertexData.indices = geometry.indices
  vertexData.normals = geometry.normals
  vertexData.applyToMesh(mesh)

  return mesh
}
