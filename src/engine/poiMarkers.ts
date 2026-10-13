import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture'
import type { Material } from '@babylonjs/core/Materials/material'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { CreatePlane } from '@babylonjs/core/Meshes/Builders/planeBuilder'
import { Mesh } from '@babylonjs/core/Meshes/mesh'
import type { Scene } from '@babylonjs/core/scene'
import { parseKey, type Axial, type HexKey } from '../hex/coords'
import { hexToWorld, type Layout } from '../hex/layout'
import { MIN_ELEVATION } from './hexGrid'

export type PoiKind = 'location' | 'event'

/** One hex worth marking, and what is on it, location first. */
export interface PoiEntry {
  hex: HexKey
  kinds: readonly PoiKind[]
  /** Under the fog, where the grid lays the hex flat. */
  buried: boolean
}

export interface PoiView {
  dmView: boolean
  fog: boolean
  explored: ReadonlySet<HexKey>
}

/** The DM sees every location and event; a player only those on ground the crawl has laid eyes on. */
export function visiblePois(
  locations: ReadonlyMap<HexKey, readonly unknown[]>,
  events: ReadonlyMap<HexKey, readonly unknown[]>,
  view: PoiView,
): PoiEntry[] {
  const kinds = new Map<HexKey, PoiKind[]>()
  const note = (content: ReadonlyMap<HexKey, readonly unknown[]>, kind: PoiKind): void => {
    for (const [hex, list] of content) {
      if (list.length === 0 || (!view.dmView && !view.explored.has(hex))) continue
      const known = kinds.get(hex)
      if (known) known.push(kind)
      else kinds.set(hex, [kind])
    }
  }

  note(locations, 'location')
  note(events, 'event')
  return [...kinds].map(([hex, on]) => ({
    hex,
    kinds: on,
    buried: view.fog && !view.explored.has(hex),
  }))
}

/** Builds the face an icon of one kind wears; shared by every icon of it. */
export type IconMaker = (scene: Scene, kind: PoiKind) => Material

export interface PoiMarkerOptions {
  /** Width of an icon, as a fraction of the hex size. */
  size?: number
  /** How far above its tile the lowest icon sits, as a fraction of the hex size. */
  hover?: number
  icon?: IconMaker
}

export interface PoiMarkers {
  /** The icons standing right now, in the order they were handed in. */
  readonly shown: readonly Mesh[]
  setPois(entries: readonly PoiEntry[]): void
  dispose(): void
}

const DEFAULTS = { size: 1.1, hover: 0.9 } as const

const ICON_PIXELS = 128

const drawnIcons: IconMaker = (scene, kind) => {
  const texture = new DynamicTexture(
    `poi-${kind}`,
    { width: ICON_PIXELS, height: ICON_PIXELS },
    scene,
    true,
  )
  texture.hasAlpha = true
  const ink = texture.getContext()
  const middle = ICON_PIXELS / 2
  ink.clearRect(0, 0, ICON_PIXELS, ICON_PIXELS)
  ink.lineWidth = 8
  ink.strokeStyle = '#15171c'

  if (kind === 'location') {
    // A map pin: a round head drawn down to a point at the bottom edge.
    ink.beginPath()
    ink.arc(middle, 50, 40, Math.PI * 0.8, Math.PI * 2.2)
    ink.lineTo(middle, 120)
    ink.closePath()
    ink.fillStyle = '#e0b25a'
    ink.fill()
    ink.stroke()
    ink.beginPath()
    ink.arc(middle, 50, 15, 0, Math.PI * 2)
    ink.fillStyle = '#15171c'
    ink.fill()
  } else {
    ink.beginPath()
    ink.arc(middle, middle, 54, 0, Math.PI * 2)
    ink.fillStyle = '#c8473f'
    ink.fill()
    ink.stroke()
    ink.fillStyle = '#ffffff'
    ink.fillRect(middle - 9, 26, 18, 50)
    ink.beginPath()
    ink.arc(middle, 94, 10, 0, Math.PI * 2)
    ink.fill()
  }
  texture.update()

  const material = new StandardMaterial(`poi-${kind}`, scene)
  material.diffuseTexture = texture
  material.useAlphaFromDiffuseTexture = true
  material.emissiveColor = Color3.White()
  material.disableLighting = true
  material.backFaceCulling = false
  return material
}

/**
 * An icon over every hex with something on it, turned to face the camera. A hex
 * with both a location and an event stacks the two, so neither hides the other
 * from whichever way the view has been turned.
 */
export function createPoiMarkers(
  scene: Scene,
  layout: Layout,
  elevationOf: (hex: Axial) => number,
  options: PoiMarkerOptions = {},
): PoiMarkers {
  const size = layout.size * (options.size ?? DEFAULTS.size)
  const hover = layout.size * (options.hover ?? DEFAULTS.hover)
  const icon = options.icon ?? drawnIcons

  const materials = new Map<PoiKind, Material>()
  const materialFor = (kind: PoiKind): Material => {
    const known = materials.get(kind)
    if (known) return known
    const made = icon(scene, kind)
    materials.set(kind, made)
    return made
  }

  const pool: Mesh[] = []
  let count = 0

  const iconAt = (index: number): Mesh => {
    const known = pool[index]
    if (known) return known
    const plane = CreatePlane(`poi${index}`, { size }, scene)
    plane.billboardMode = Mesh.BILLBOARDMODE_ALL
    plane.isPickable = false
    pool[index] = plane
    return plane
  }

  return {
    get shown() {
      return pool.slice(0, count)
    },

    setPois(entries): void {
      count = 0
      for (const { hex: key, kinds, buried } of entries) {
        const hex = parseKey(key)
        const world = hexToWorld(layout, hex)
        const top = buried ? MIN_ELEVATION : Math.max(MIN_ELEVATION, elevationOf(hex))
        const ground = top + hover + size / 2
        kinds.forEach((kind, stacked) => {
          const plane = iconAt(count++)
          plane.material = materialFor(kind)
          plane.position.set(world.x, ground + stacked * size * 1.05, world.z)
          plane.setEnabled(true)
        })
      }
      for (const plane of pool.slice(count)) plane.setEnabled(false)
    },

    dispose(): void {
      for (const plane of pool) plane.dispose()
      for (const material of materials.values()) material.dispose(true, true)
      pool.length = 0
      materials.clear()
      count = 0
    },
  }
}
