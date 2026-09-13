import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder'
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData'
import { TransformNode } from '@babylonjs/core/Meshes/transformNode'
import type { Scene } from '@babylonjs/core/scene'
import type { Axial } from '../hex/coords'
import { hexToWorld, type Layout } from '../hex/layout'

/** Builds the number shown on a marker; returns the meshes to hang off it. */
export type LabelMaker = (scene: Scene, text: string, width: number, height: number) => Mesh[]

export interface WaypointMarkerOptions {
  /** Width of the triangle, as a fraction of the hex size. */
  size?: number
  /** How far above its tile the tip hangs, as a fraction of the hex size. */
  hover?: number
  /** Height of the bob, as a fraction of the hex size. */
  bob?: number
  bobPeriod?: number
  /** Seconds for one full turn about the Y axis. */
  spinPeriod?: number
  label?: LabelMaker
}

export interface WaypointMarkers {
  /** The markers standing right now, first stop first. */
  readonly shown: readonly TransformNode[]
  /** How many stops are marked; any at all are bobbing and spinning. */
  readonly count: number
  setStops(hexes: readonly Axial[], color: string): void
  /** Advances the bob and the spin; driven by the render loop. */
  advance(seconds: number): void
  dispose(): void
}

const DEFAULTS = {
  size: 3.3,
  hover: 1.6,
  bob: 0.18,
  bobPeriod: 1.8,
  spinPeriod: 3.2,
} as const

/** Staggers the bob so a row of stops ripples instead of moving in lockstep. */
const PHASE_STEP = 0.17

export interface MarkerPose {
  lift: number
  spin: number
}

export function markerPose(
  time: number,
  index: number,
  motion: { bob: number; bobPeriod: number; spinPeriod: number },
): MarkerPose {
  const phase = time / motion.bobPeriod + index * PHASE_STEP
  return {
    lift: Math.sin(phase * Math.PI * 2) * motion.bob,
    spin: ((time / motion.spinPeriod) % 1) * Math.PI * 2,
  }
}

/**
 * A flat triangular slab, tip at the origin pointing down and the flat edge on
 * top, so the node's position is exactly where the marker points.
 */
export function buildTriangle(scene: Scene, width: number, height: number, depth: number): Mesh {
  const half = depth / 2
  const corners: [number, number][] = [
    [-width / 2, height],
    [width / 2, height],
    [0, 0],
  ]

  const positions: number[] = []
  const indices: number[] = []
  // Every face gets its own vertices so the normals stay flat and the edges read.
  const face = (points: [number, number, number][]): void => {
    const start = positions.length / 3
    for (const [x, y, z] of points) positions.push(x, y, z)
    for (let i = 1; i < points.length - 1; i++) indices.push(start, start + i, start + i + 1)
  }

  face(corners.map(([x, y]) => [x, y, -half]))
  face([...corners].reverse().map(([x, y]) => [x, y, half]))
  corners.forEach(([ax, ay], i) => {
    const [bx, by] = corners[(i + 1) % corners.length]
    face([
      [ax, ay, -half],
      [ax, ay, half],
      [bx, by, half],
      [bx, by, -half],
    ])
  })

  const normals: number[] = []
  VertexData.ComputeNormals(positions, indices, normals)

  const data = new VertexData()
  data.positions = positions
  data.indices = indices
  data.normals = normals

  const mesh = new Mesh('stopMarker', scene)
  data.applyToMesh(mesh)
  return mesh
}

/** The stop number printed on both faces, so it reads whichever way it has spun. */
const numberPlates: LabelMaker = (scene, text, width, height) => {
  const texture = new DynamicTexture('stopLabel', { width: 128, height: 128 }, scene, true)
  texture.hasAlpha = true
  texture.drawText(text, null, 100, 'bold 96px sans-serif', '#15171c', 'transparent', true)

  const material = new StandardMaterial('stopLabel', scene)
  material.diffuseTexture = texture
  material.useAlphaFromDiffuseTexture = true
  material.emissiveColor = Color3.White()
  material.disableLighting = true

  // Centred on the triangle's centroid, which sits two thirds of the way up.
  const side = width * 0.42
  return [-1, 1].map((facing) => {
    const plate = CreatePlane('stopLabel', { size: side }, scene)
    plate.material = material
    plate.isPickable = false
    plate.position.set(0, (height * 2) / 3, facing * (width * 0.08 + 0.01))
    if (facing > 0) plate.rotation.y = Math.PI
    return plate
  })
}

interface Marker {
  root: TransformNode
  meshes: Mesh[]
  baseY: number
}

export function createWaypointMarkers(
  scene: Scene,
  layout: Layout,
  elevationOf: (hex: Axial) => number,
  options: WaypointMarkerOptions = {},
): WaypointMarkers {
  const width = layout.size * (options.size ?? DEFAULTS.size)
  const height = width * 0.9
  const depth = width * 0.16
  const hover = layout.size * (options.hover ?? DEFAULTS.hover)
  const motion = {
    bob: layout.size * (options.bob ?? DEFAULTS.bob),
    bobPeriod: options.bobPeriod ?? DEFAULTS.bobPeriod,
    spinPeriod: options.spinPeriod ?? DEFAULTS.spinPeriod,
  }
  const label = options.label ?? numberPlates

  // One material for every triangle: they all wear the selected entity's colour.
  const material = new StandardMaterial('stopMarker', scene)
  material.specularColor = Color3.Black()
  material.backFaceCulling = false
  material.twoSidedLighting = true

  // Kept by position in the chain, so marker n is always labelled n and a label
  // is only ever drawn once.
  const pool: Marker[] = []
  let count = 0
  let time = 0

  const markerAt = (index: number): Marker => {
    const known = pool[index]
    if (known) return known

    const root = new TransformNode(`stop${index + 1}`, scene)
    const triangle = buildTriangle(scene, width, height, depth)
    triangle.material = material
    triangle.isPickable = false
    const meshes = [triangle, ...label(scene, String(index + 1), width, height)]
    for (const mesh of meshes) mesh.parent = root

    const made = { root, meshes, baseY: 0 }
    pool[index] = made
    return made
  }

  const pose = (marker: Marker, index: number): void => {
    const { lift, spin } = markerPose(time, index, motion)
    marker.root.position.y = marker.baseY + lift
    marker.root.rotation.y = spin
  }

  const markers: WaypointMarkers = {
    get shown() {
      return pool.slice(0, count).map((marker) => marker.root)
    },

    get count() {
      return count
    },

    setStops(hexes, color): void {
      const tint = Color3.FromHexString(color)
      material.diffuseColor = tint
      material.emissiveColor = tint.scale(0.45)

      hexes.forEach((hex, index) => {
        const marker = markerAt(index)
        const world = hexToWorld(layout, hex)
        marker.baseY = elevationOf(hex) + hover
        marker.root.position.x = world.x
        marker.root.position.z = world.z
        marker.root.setEnabled(true)
        pose(marker, index)
      })

      count = hexes.length
      for (const marker of pool.slice(count)) marker.root.setEnabled(false)
    },

    advance(seconds): void {
      time += seconds
      pool.slice(0, count).forEach(pose)
    },

    dispose(): void {
      scene.onBeforeRenderObservable.remove(observer)
      for (const marker of pool) {
        for (const mesh of marker.meshes) {
          if (mesh.material !== material) mesh.material?.dispose(true, true)
          mesh.dispose()
        }
        marker.root.dispose()
      }
      material.dispose()
      pool.length = 0
      count = 0
    },
  }

  const observer = scene.onBeforeRenderObservable.add(() => {
    if (count > 0) markers.advance(scene.getEngine().getDeltaTime() / 1000)
  })

  return markers
}
