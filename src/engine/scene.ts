import { Engine } from '@babylonjs/core/Engines/engine'
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents'
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color'
import { Vector3 } from '@babylonjs/core/Maths/math.vector'
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder'
import '@babylonjs/core/Meshes/Builders/groundBuilder'
import type { PickingInfo } from '@babylonjs/core/Collisions/pickingInfo'
// Without this side-effect import scene.pick is a stub that warns once and
// returns an empty PickingInfo, so every pick silently misses.
import '@babylonjs/core/Culling/ray'
import { Scene } from '@babylonjs/core/scene'
import { hexKey, type Axial } from '../hex/coords'
import { hexToWorld, type Layout } from '../hex/layout'
import { createIsoCamera, type IsoCamera } from './camera'
import { attachIsoControls } from './controls'
import { createHexGrid, type HexGrid, type HexTile } from './hexGrid'
import { createPartyToken, type PartyToken } from './partyToken'
import { createRouteArrows, type RouteArrows } from './routeArrows'
import { createVisionOverlay, type VisionOverlay } from './visionOverlay'

export interface HexSceneOptions {
  layout: Layout
  tiles: HexTile[]
  gap?: number
  bevel?: number
  onHover?(hex: Axial | null): void
  onSelect?(hex: Axial | null): void
}

export interface HexScene {
  engine: Engine
  scene: Scene
  iso: IsoCamera
  grid: HexGrid
  arrows: RouteArrows
  party: PartyToken
  vision: VisionOverlay
  resize(): void
  dispose(): void
}

function panBoundsFor(layout: Layout, tiles: HexTile[]): IsoCameraBounds | undefined {
  if (tiles.length === 0) return undefined
  const points = tiles.map((tile) => hexToWorld(layout, tile.hex))
  const xs = points.map((p) => p.x)
  const zs = points.map((p) => p.z)
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  }
}

type IsoCameraBounds = { minX: number; maxX: number; minZ: number; maxZ: number }

// PickingInfo reports "no instance" as -1, never undefined, so a truthiness or
// undefined check silently swallows every hit on instance 0 and every miss.
export function hexFromPick(grid: HexGrid, pick: PickingInfo | null): Axial | null {
  if (!pick?.hit || pick.thinInstanceIndex < 0) return null
  return grid.hexAt(pick.thinInstanceIndex) ?? null
}

// A dark slab under the tiles: the inset gap between hexes reads as a border
// against it, and it keeps the void from showing through at low elevations.
function addGroundSlab(scene: Scene, bounds: IsoCameraBounds | undefined, margin: number): void {
  if (!bounds) return
  const ground = MeshBuilder.CreateGround(
    'slab',
    {
      width: bounds.maxX - bounds.minX + margin * 2,
      height: bounds.maxZ - bounds.minZ + margin * 2,
    },
    scene,
  )
  ground.position.set((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2)
  ground.isPickable = false

  const material = new StandardMaterial('slab', scene)
  material.diffuseColor = new Color3(0.04, 0.05, 0.07)
  material.specularColor = Color3.Black()
  material.emissiveColor = new Color3(0.012, 0.014, 0.018)
  ground.material = material
}

export function createHexScene(canvas: HTMLCanvasElement, options: HexSceneOptions): HexScene {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true })
  const scene = new Scene(engine)
  scene.clearColor = new Color4(0.078, 0.086, 0.102, 1)

  const sky = new HemisphericLight('sky', new Vector3(0, 1, 0), scene)
  sky.intensity = 0.65
  sky.groundColor = new Color3(0.22, 0.24, 0.3)

  const sun = new DirectionalLight('sun', new Vector3(-0.6, -1, 0.4), scene)
  sun.intensity = 0.7

  const bounds = panBoundsFor(options.layout, options.tiles)
  const iso = createIsoCamera(scene, canvas, { zoom: 40, panBounds: bounds })
  const detachControls = attachIsoControls(canvas, iso)

  const grid = createHexGrid(scene, options.layout, options.tiles, {
    gap: options.gap,
    bevel: options.bevel,
  })

  const elevations = new Map(options.tiles.map((tile) => [hexKey(tile.hex), tile.elevation]))
  const elevationOf = (hex: Axial): number => elevations.get(hexKey(hex)) ?? 0
  const arrows = createRouteArrows(scene, options.layout, elevationOf)
  const party = createPartyToken(scene, options.layout, elevationOf)
  const vision = createVisionOverlay(scene, options.layout, elevationOf, { gap: options.gap })
  addGroundSlab(scene, bounds, options.layout.size * 2)

  // Plain axial coordinates cross this boundary, never Babylon objects, so
  // nothing engine-owned ends up inside Vue's reactivity.
  const pickHex = (): Axial | null =>
    hexFromPick(grid, scene.pick(scene.pointerX, scene.pointerY, (mesh) => mesh === grid.mesh))

  const pointerObserver = scene.onPointerObservable.add((info) => {
    if (info.type === PointerEventTypes.POINTERMOVE) options.onHover?.(pickHex())
    else if (info.type === PointerEventTypes.POINTERTAP) options.onSelect?.(pickHex())
  })

  engine.runRenderLoop(() => scene.render())

  const resize = (): void => {
    engine.resize()
    iso.updateProjection(engine.getAspectRatio(iso.camera))
  }
  resize()

  return {
    engine,
    scene,
    iso,
    grid,
    arrows,
    party,
    vision,
    resize,
    dispose(): void {
      scene.onPointerObservable.remove(pointerObserver)
      detachControls()
      engine.stopRenderLoop()
      vision.dispose()
      party.dispose()
      arrows.dispose()
      grid.dispose()
      iso.dispose()
      scene.dispose()
      engine.dispose()
    },
  }
}
