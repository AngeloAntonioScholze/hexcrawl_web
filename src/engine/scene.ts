import { Engine } from '@babylonjs/core/Engines/engine'
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents'
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3 } from '@babylonjs/core/Maths/math.color'
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector'
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder'
import type { PickingInfo } from '@babylonjs/core/Collisions/pickingInfo'
// Importing Ray from here, not ray.core, is what installs scene.pick and
// createPickingRay; without it they are stubs and every pick silently misses.
import { Ray } from '@babylonjs/core/Culling/ray'
import { Scene } from '@babylonjs/core/scene'
import { hexKey, type Axial } from '../hex/coords'
import type { TimeOfDay } from '../time/clock'
import { daylightFor, skyGlow, type SkyGlow } from './sky'
import type { Layout } from '../hex/layout'
import { createIsoCamera, type IsoCamera } from './camera'
import { hexUnderRay, neighborUnderRay, type PickRay } from './groundPick'
import { attachIsoControls } from './controls'
import type { TerrainField } from '../terrain/field'
import { createHexGrid, wantsDetail, type HexGrid, type HexTile } from './hexGrid'
import { worldBounds } from './hexWindow'
import { createTokenField, type TokenField } from './tokenField'
import { createPoiMarkers, type PoiMarkers } from './poiMarkers'
import { createResourceMarkers, type ResourceMarkers } from './resourceMarkers'
import { createRiverSegments, type RiverSegments } from './riverSegments'
import { createRoadSegments, type RoadSegments } from './roadSegments'
import { createRouteArrows, type RouteArrows } from './routeArrows'
import { createVisionOverlay, type VisionOverlay } from './visionOverlay'
import { createWaypointMarkers, type WaypointMarkers } from './waypointMarkers'
import { wantsFrame } from './renderPacing'

export interface HexSceneOptions {
  layout: Layout
  /** The world the scene reads its ground out of, a window at a time. */
  field: TerrainField
  /** The most hexes the grid will hold at once. */
  capacity: number
  maxZoom?: number
  gap?: number
  bevel?: number
  /** `across` is the neighbour beyond the side of the hex nearest the pointer. */
  onHover?(hex: Axial | null, across: Axial | null): void
  /** `append` is a shift-click: add the hex to the order rather than replace it. */
  onSelect?(hex: Axial | null, append: boolean, across: Axial | null): void
  /** Where the sun or moon glows over the view; called again whenever the time or the camera moves it. */
  onGlow?(glow: SkyGlow): void
}

export interface HexScene {
  engine: Engine
  scene: Scene
  iso: IsoCamera
  grid: HexGrid
  arrows: RouteArrows
  tokens: TokenField
  vision: VisionOverlay
  stops: WaypointMarkers
  resources: ResourceMarkers
  pois: PoiMarkers
  roads: RoadSegments
  rivers: RiverSegments
  /** Draws a different window of the world; everything else rides along. */
  setWindow(tiles: readonly HexTile[]): void
  /** Slides the window: what `keep` turns down leaves, `entering` arrives. */
  moveWindow(keep: (q: number, r: number) => boolean, entering: readonly HexTile[]): void
  /** Hands the scene a new world, which is what a new seed or size is. */
  setField(field: TerrainField): void
  /** How far back the view may be pulled on the world it is now showing. */
  setMaxZoom(limit: number): void
  /** Swings the light to where the clock says the sun is. */
  setDaylight(time: TimeOfDay): void
  resize(): void
  dispose(): void
}

type IsoCameraBounds = { minX: number; maxX: number; minZ: number; maxZ: number }

// PickingInfo reports "no instance" as -1, never undefined, so a truthiness or
// undefined check silently swallows every hit on instance 0 and every miss.
export function hexFromPick(grid: HexGrid, pick: PickingInfo | null): Axial | null {
  if (!pick?.hit || pick.thinInstanceIndex < 0) return null
  return grid.hexAt(pick.thinInstanceIndex) ?? null
}

// Walks the ray down through the drawn prism heights instead of testing it
// against every instance in the window: scene.pick measured about 2ms a move
// at the opening zoom and 20ms at the widest (scripts/bench-pick.ts).
export function hexUnderPointer(grid: HexGrid, layout: Layout, ray: PickRay): Axial | null {
  if (grid.count === 0) return null
  const tallest = grid.mesh.getBoundingInfo().boundingBox.maximum.y
  return hexUnderRay(
    layout,
    ray,
    (hex) => {
      const index = grid.indexOf(hexKey(hex))
      return index === undefined ? undefined : grid.heightAt(index)
    },
    tallest,
    grid.tileSize,
  )
}

// A dark slab under the tiles: the inset gap between hexes reads as a border
// against it, and it keeps the void from showing through at low elevations.
function addGroundSlab(scene: Scene, bounds: IsoCameraBounds | undefined, margin: number): void {
  if (!bounds) return
  const ground = CreateGround(
    'slab',
    {
      width: bounds.maxX - bounds.minX + margin * 2,
      height: bounds.maxZ - bounds.minZ + margin * 2,
    },
    scene,
  )
  ground.position.set((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2)
  ground.isPickable = false
  // Laid once for the world and never moved.
  ground.freezeWorldMatrix()
  ground.doNotSyncBoundingInfo = true

  const material = new StandardMaterial('slab', scene)
  material.diffuseColor = new Color3(0.12, 0.14, 0.18)
  material.specularColor = Color3.Black()
  material.emissiveColor = new Color3(0.04, 0.045, 0.06)
  ground.material = material
}

export function createHexScene(canvas: HTMLCanvasElement, options: HexSceneOptions): HexScene {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true })
  const scene = new Scene(engine)
  scene.clearColor = daylightFor('noon').clear
  // Hover runs its own pick against the grid alone; Babylon's pick of every
  // mesh on each pointer move would be the same work done twice.
  scene.skipPointerMovePicking = true

  // Set by anything that changes what is drawn. Between changes the render loop
  // sits idle instead of redrawing a still map at the display's rate.
  let dirty = true

  const sky = new HemisphericLight('sky', new Vector3(0, 1, 0), scene)
  const sun = new DirectionalLight('sun', new Vector3(-0.6, -1, 0.4), scene)

  let time: TimeOfDay = 'noon'

  const setDaylight = (next: TimeOfDay): void => {
    time = next
    const light = daylightFor(time)
    sun.direction = light.direction
    sun.intensity = light.sun
    sun.diffuse = light.warmth
    sky.intensity = light.sky
    sky.groundColor = light.ground
    scene.clearColor = light.clear
    dirty = true
  }

  setDaylight('noon')

  let field = options.field
  const bounds = worldBounds(options.layout, field.radius)
  const iso = createIsoCamera(scene, canvas, {
    zoom: 40,
    maxZoom: options.maxZoom,
    panBounds: bounds,
  })
  const detachControls = attachIsoControls(canvas, iso)

  const grid = createHexGrid(scene, options.layout, {
    capacity: options.capacity,
    gap: options.gap,
    bevel: options.bevel,
  })

  // Read straight out of the world rather than out of a copy of it, so the
  // arrows, the pawns and the sight plates cannot drift from the ground: they
  // ask the same field the grid draws.
  const elevationOf = (hex: Axial): number => field.at(hex)?.elevation ?? 0
  const arrows = createRouteArrows(scene, options.layout, elevationOf)
  const tokens = createTokenField(scene, options.layout, elevationOf)
  const vision = createVisionOverlay(scene, options.layout, elevationOf, { gap: options.gap })
  const stops = createWaypointMarkers(scene, options.layout, elevationOf)
  const resources = createResourceMarkers(scene, options.layout, elevationOf)
  const pois = createPoiMarkers(scene, options.layout, elevationOf)
  const roads = createRoadSegments(scene, options.layout, elevationOf, {
    tileSize: grid.tileSize,
    bevel: options.bevel,
  })
  const rivers = createRiverSegments(scene, options.layout, elevationOf)
  addGroundSlab(scene, bounds, options.layout.size * 2)

  // Plain axial coordinates cross this boundary, never Babylon objects, so
  // nothing engine-owned ends up inside Vue's reactivity.
  const pointerRay = new Ray(Vector3.Zero(), Vector3.Down())
  const identity = Matrix.Identity()
  const pickHex = (): Axial | null => {
    scene.createPickingRayToRef(scene.pointerX, scene.pointerY, identity, pointerRay, iso.camera)
    return hexUnderPointer(grid, options.layout, pointerRay)
  }

  const pickSide = (hex: Axial | null): Axial | null => {
    if (!hex) return null
    const index = grid.indexOf(hexKey(hex))
    const top = index === undefined ? 0 : grid.heightAt(index)
    return neighborUnderRay(options.layout, pointerRay, hex, top)
  }

  const pointerObserver = scene.onPointerObservable.add((info) => {
    if (info.type === PointerEventTypes.POINTERMOVE) {
      const hex = pickHex()
      options.onHover?.(hex, pickSide(hex))
    } else if (info.type === PointerEventTypes.POINTERTAP) {
      const hex = pickHex()
      options.onSelect?.(hex, info.event.shiftKey, pickSide(hex))
    }
  })

  const redrawOnCall = <T extends object>(target: T, methods: readonly (keyof T)[]): void => {
    for (const name of methods) {
      const method = target[name]
      if (typeof method !== 'function') continue
      target[name] = ((...args: unknown[]) => {
        dirty = true
        return method.apply(target, args)
      }) as T[keyof T]
    }
  }

  redrawOnCall(grid, ['setOverlay', 'setFog', 'updateFog', 'setWindow', 'moveWindow'])
  redrawOnCall(arrows, ['setPath', 'setPaths'])
  redrawOnCall(tokens, ['setEntries', 'place', 'hop', 'board', 'alight'])
  redrawOnCall(vision, ['setField', 'setShown'])
  redrawOnCall(stops, ['setStops'])
  redrawOnCall(resources, ['setMarks'])
  redrawOnCall(pois, ['setPois'])
  redrawOnCall(roads, ['setSpans'])
  redrawOnCall(rivers, ['setSpans'])

  // The rounded edge is dropped once it shrinks to about a pixel on screen,
  // which at the widest zooms is two thirds of the grid's triangles. Worked out
  // before each frame is drawn, so the switch lands on the frame that needs it.
  const detailObserver = scene.onBeforeRenderObservable.add(() => {
    const pixels = (grid.bevelRadius * engine.getRenderHeight()) / (2 * iso.zoom)
    grid.setDetail(wantsDetail(pixels, grid.detailed))
    roads.setDetail(grid.detailed)
  })

  // Only the camera's turn and tilt move the glow, never a pan, so it is
  // worked out on every drawn frame but handed on only when it has shifted.
  let glowSeen: SkyGlow | null = null
  const glowObserver = scene.onBeforeRenderObservable.add(() => {
    if (!options.onGlow) return
    const glow = skyGlow(time, iso.camera.getViewMatrix())
    if (
      glowSeen &&
      glowSeen.color === glow.color &&
      Math.abs(glowSeen.x - glow.x) < 1e-3 &&
      Math.abs(glowSeen.y - glow.y) < 1e-3 &&
      glowSeen.strength === glow.strength
    ) {
      return
    }
    glowSeen = glow
    options.onGlow(glow)
  })

  // A drag or a jump moves the target directly rather than through the easing,
  // so the loop watches the target itself for those.
  let seenX = NaN
  let seenZ = NaN
  const targetMoved = (): boolean => {
    const { x, z } = iso.camera.target
    if (x === seenX && z === seenZ) return false
    seenX = x
    seenZ = z
    return true
  }

  // A material still compiling draws nothing on its frame and needs another
  // once it is ready, which nothing else would ask for.
  let warming = true

  // Driven by hand rather than by runRenderLoop, so a skipped frame is not begun
  // either: the engine's delta time then spans the frames actually drawn, and a
  // bob drawn at the ambient rate still moves at its real speed.
  let frameRequest = 0
  let lastFrame = -Infinity
  const tick = (now: number): void => {
    frameRequest = requestAnimationFrame(tick)

    const changed = targetMoved() || dirty || warming || iso.settling || tokens.hopping
    const animating = tokens.bobbing || arrows.count > 0 || stops.count > 0
    if (!wantsFrame({ changed, animating, sinceLastFrame: now - lastFrame })) return

    dirty = false
    lastFrame = now
    engine.beginFrame()
    scene.render()
    engine.endFrame()
    warming = !scene.isReady(false)
  }
  frameRequest = requestAnimationFrame(tick)

  const resize = (): void => {
    engine.resize()
    iso.updateProjection(engine.getAspectRatio(iso.camera))
    dirty = true
  }
  resize()

  return {
    engine,
    scene,
    iso,
    grid,
    arrows,
    tokens,
    vision,
    stops,
    resources,
    pois,
    roads,
    rivers,

    setDaylight,

    setWindow(next): void {
      grid.setWindow(next)
    },

    moveWindow(keep, entering): void {
      grid.moveWindow(keep, entering)
    },

    setField(next): void {
      field = next
      iso.setPanBounds(worldBounds(options.layout, next.radius))
      dirty = true
    },

    setMaxZoom(limit): void {
      iso.setMaxZoom(limit)
      dirty = true
    },

    resize,
    dispose(): void {
      scene.onPointerObservable.remove(pointerObserver)
      scene.onBeforeRenderObservable.remove(detailObserver)
      scene.onBeforeRenderObservable.remove(glowObserver)
      detachControls()
      cancelAnimationFrame(frameRequest)
      rivers.dispose()
      roads.dispose()
      pois.dispose()
      resources.dispose()
      stops.dispose()
      vision.dispose()
      tokens.dispose()
      arrows.dispose()
      grid.dispose()
      iso.dispose()
      scene.dispose()
      engine.dispose()
    },
  }
}
