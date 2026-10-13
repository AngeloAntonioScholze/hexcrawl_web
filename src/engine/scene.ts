import { Engine } from '@babylonjs/core/Engines/engine'
import { PointerEventTypes } from '@babylonjs/core/Events/pointerEvents'
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight'
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial'
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color'
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector'
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder'
import type { PickingInfo } from '@babylonjs/core/Collisions/pickingInfo'
// Importing Ray from here, not ray.core, is what installs scene.pick and
// createPickingRay; without it they are stubs and every pick silently misses.
import { Ray } from '@babylonjs/core/Culling/ray'
import { Scene } from '@babylonjs/core/scene'
import { hexKey, type Axial } from '../hex/coords'
import { TURNS_PER_DAY, TURNS_PER_PHASE, type Phase } from '../time/clock'
import type { Layout } from '../hex/layout'
import { createIsoCamera, type IsoCamera } from './camera'
import { hexUnderRay, type PickRay } from './groundPick'
import { attachIsoControls } from './controls'
import type { TerrainField } from '../terrain/field'
import { createHexGrid, wantsDetail, type HexGrid, type HexTile } from './hexGrid'
import { worldBounds } from './hexWindow'
import { createTokenField, type TokenField } from './tokenField'
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
  onHover?(hex: Axial | null): void
  /** `append` is a shift-click: add the hex to the order rather than replace it. */
  onSelect?(hex: Axial | null, append: boolean): void
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
  /** Draws a different window of the world; everything else rides along. */
  setWindow(tiles: readonly HexTile[]): void
  /** Slides the window: what `keep` turns down leaves, `entering` arrives. */
  moveWindow(keep: (q: number, r: number) => boolean, entering: readonly HexTile[]): void
  /** Hands the scene a new world, which is what a new seed or size is. */
  setField(field: TerrainField): void
  /** How far back the view may be pulled on the world it is now showing. */
  setMaxZoom(limit: number): void
  /** Swings the light to where the clock says the sun is. */
  setDaylight(phase: Phase, index: number): void
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

/**
 * The light over the map, read off the clock. The sun swings from one horizon
 * to the other across the turns of a phase: a bright dawn on the near horizon,
 * white overhead at noon, and a warm twilight on the far one. After dark the
 * same arc is walked by a moon bright enough to read the terrain by, because a
 * map nobody can see is not a night, it is a blank screen.
 */
interface Daylight {
  /** Where the light comes from, as a direction to point the light at. */
  direction: Vector3
  sun: number
  sky: number
  warmth: Color3
  ground: Color3
  clear: Color4
}

const DAY = {
  /** First light: pale and clean rather than orange, so dawn reads bright. */
  dawn: new Color3(1, 0.94, 0.85),
  noon: new Color3(1, 0.99, 0.97),
  /** The far horizon, where the day is allowed to go amber. */
  dusk: new Color3(1, 0.82, 0.6),
  sun: 1.05,
  sky: 0.9,
  ground: new Color3(0.42, 0.45, 0.52),
  clear: new Color4(0.16, 0.18, 0.22, 1),
}

const NIGHT = {
  moon: new Color3(0.62, 0.72, 1),
  sun: 0.21,
  sky: 0.24,
  ground: new Color3(0.2, 0.24, 0.36),
  clear: new Color4(0.07, 0.085, 0.14, 1),
}

/**
 * How far a turn has gone over to the night's cool blue: nearly none in the
 * middle of the day, nearly all of it in the middle of the night, and the turns
 * either side of dusk and dawn caught partway. Read at the middle of the turn,
 * so the eight turns of a day step evenly around the curve.
 */
function coolnessAt(turnOfDay: number): number {
  const position = (turnOfDay + 0.5) / TURNS_PER_DAY
  return 0.5 + 0.5 * Math.cos(2 * Math.PI * (position - 0.75))
}

function daylightFor(phase: Phase, index: number): Daylight {
  // Zero at the near horizon, one at the far one: the same sweep the dial's
  // emblem takes, so the shadows agree with the icon over the map.
  const across = TURNS_PER_PHASE > 1 ? Math.min(1, Math.max(0, index / (TURNS_PER_PHASE - 1))) : 0
  const angle = Math.PI - across * Math.PI
  const height = Math.sin(angle)

  // The light swings across the sky but never drops toward the horizon: a
  // grazing sun lit the tops of the tiles at a quarter of a high one, and the
  // map flashed bright and dim from one turn to the next.
  const direction = new Vector3(-Math.cos(angle) * 0.8, -0.9, 0.4)

  // By day the tint drifts from the pale dawn to the amber dusk, and the higher
  // the sun the more of it noon washes out. By night the same arc runs from
  // the last of the dusk to the first of the dawn, under the moon's blue.
  const hue =
    phase === 'day'
      ? Color3.Lerp(Color3.Lerp(DAY.dawn, DAY.dusk, across), DAY.noon, height)
      : Color3.Lerp(DAY.dusk, DAY.dawn, across)

  const cool = coolnessAt((phase === 'night' ? TURNS_PER_PHASE : 0) + index)
  const mix = (day: number, night: number): number => day + (night - day) * cool

  return {
    direction,
    sun: mix(DAY.sun, NIGHT.sun),
    sky: mix(DAY.sky, NIGHT.sky),
    warmth: Color3.Lerp(hue, NIGHT.moon, cool),
    ground: Color3.Lerp(DAY.ground, NIGHT.ground, cool),
    clear: Color4.Lerp(DAY.clear, NIGHT.clear, cool),
  }
}

export function createHexScene(canvas: HTMLCanvasElement, options: HexSceneOptions): HexScene {
  const engine = new Engine(canvas, true, { preserveDrawingBuffer: true, stencil: true })
  const scene = new Scene(engine)
  scene.clearColor = DAY.clear
  // Hover runs its own pick against the grid alone; Babylon's pick of every
  // mesh on each pointer move would be the same work done twice.
  scene.skipPointerMovePicking = true

  // Set by anything that changes what is drawn. Between changes the render loop
  // sits idle instead of redrawing a still map at the display's rate.
  let dirty = true

  const sky = new HemisphericLight('sky', new Vector3(0, 1, 0), scene)
  const sun = new DirectionalLight('sun', new Vector3(-0.6, -1, 0.4), scene)

  const setDaylight = (phase: Phase, index: number): void => {
    const light = daylightFor(phase, index)
    sun.direction = light.direction
    sun.intensity = light.sun
    sun.diffuse = light.warmth
    sky.intensity = light.sky
    sky.groundColor = light.ground
    scene.clearColor = light.clear
    dirty = true
  }

  setDaylight('day', 1)

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
  addGroundSlab(scene, bounds, options.layout.size * 2)

  // Plain axial coordinates cross this boundary, never Babylon objects, so
  // nothing engine-owned ends up inside Vue's reactivity.
  const pointerRay = new Ray(Vector3.Zero(), Vector3.Down())
  const identity = Matrix.Identity()
  const pickHex = (): Axial | null => {
    scene.createPickingRayToRef(scene.pointerX, scene.pointerY, identity, pointerRay, iso.camera)
    return hexUnderPointer(grid, options.layout, pointerRay)
  }

  const pointerObserver = scene.onPointerObservable.add((info) => {
    if (info.type === PointerEventTypes.POINTERMOVE) options.onHover?.(pickHex())
    else if (info.type === PointerEventTypes.POINTERTAP)
      options.onSelect?.(pickHex(), info.event.shiftKey)
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

  // The rounded edge is dropped once it shrinks to about a pixel on screen,
  // which at the widest zooms is two thirds of the grid's triangles. Worked out
  // before each frame is drawn, so the switch lands on the frame that needs it.
  const detailObserver = scene.onBeforeRenderObservable.add(() => {
    const pixels = (grid.bevelRadius * engine.getRenderHeight()) / (2 * iso.zoom)
    grid.setDetail(wantsDetail(pixels, grid.detailed))
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
      detachControls()
      cancelAnimationFrame(frameRequest)
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
