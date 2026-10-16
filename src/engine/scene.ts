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
import { hexToWorld, hexWidth, worldToHex, type Layout } from '../hex/layout'
import { createIsoCamera, type IsoCamera } from './camera'
import { hexUnderRay, type PickRay } from './groundPick'
import { attachIsoControls } from './controls'
import type { TerrainField } from '../terrain/field'
import { FOG_COLOR, createHexGrid, wantsDetail, type HexGrid, type HexTile } from './hexGrid'
import { worldBounds } from './hexWindow'
import { createTokenField, type TokenField } from './tokenField'
import { createPoiMarkers, type PoiMarkers } from './poiMarkers'
import { createResourceMarkers, type ResourceMarkers } from './resourceMarkers'
import { createBridges, type Bridges } from './bridges'
import { createRiverSegments, type RiverSegments } from './riverSegments'
import { createRoadSegments, type RoadSegments } from './roadSegments'
import { createRouteArrows, type RouteArrows } from './routeArrows'
import { createVisionOverlay, type VisionOverlay } from './visionOverlay'
import { createWaypointMarkers, type WaypointMarkers } from './waypointMarkers'
import { wantsFrame } from './renderPacing'
import { createFogLids } from './fogLids'
import { nextWaveStart, waveDone, waveLift } from './fogWave'

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
  /** Whether a left-button drag works the map rather than panning it; a tap is then the stroke's alone. */
  brushing?(): boolean
  onStrokeStart?(hex: Axial | null): void
  onStrokeMove?(hex: Axial | null): void
  onStrokeEnd?(): void
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
  bridges: Bridges
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
  /**
   * Draws nothing but the grid, every hex of it buried, and lets no input
   * through; lifted, the map is back as the fog has it.
   */
  setVeiled(veiled: boolean): void
  /** Where the eyes are that the next fog lifted is seen from; the wind blows it away from there. */
  setRevealOrigin(hex: Axial | null): void
  /** Rolls a ring out through the hexes from the one at the centre of the screen. */
  wave(): void
  resize(): void
  dispose(): void
}

type IsoCameraBounds = { minX: number; maxX: number; minZ: number; maxZ: number }

// Babylon's default masks: a camera sees every mesh on the low 28 bits.
const EVERY_LAYER = 0x0fffffff
// Only the ground and the grid sit on this one, so a camera looking at it alone
// sees the bare fogged plain with nothing standing on it.
const VEIL_LAYER = 0x10000000

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
  ground.layerMask = EVERY_LAYER | VEIL_LAYER
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
  let veiled = false
  let revealOrigin: { x: number; z: number } | null = null
  const detachControls = attachIsoControls(canvas, iso, {
    brushing: options.brushing,
    held: () => veiled,
  })

  const grid = createHexGrid(scene, options.layout, {
    capacity: options.capacity,
    gap: options.gap,
    bevel: options.bevel,
    layerMask: EVERY_LAYER | VEIL_LAYER,
    onReveal: (x, top, z) =>
      lids.lift(
        x,
        top,
        z,
        revealOrigin ? x - revealOrigin.x : 0,
        revealOrigin ? z - revealOrigin.z : 0,
      ),
  })
  const lids = createFogLids(scene, grid.tileSize, FOG_COLOR, { layerMask: EVERY_LAYER })

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
  const rivers = createRiverSegments(scene, options.layout, elevationOf, {
    tileSize: grid.tileSize,
    bevel: options.bevel,
  })
  const bridges = createBridges(scene, options.layout, elevationOf, {
    tileSize: grid.tileSize,
    bevel: options.bevel,
    onGaps: (gaps) => roads.setGaps(gaps),
  })
  addGroundSlab(scene, bounds, options.layout.size * 2)

  // Plain axial coordinates cross this boundary, never Babylon objects, so
  // nothing engine-owned ends up inside Vue's reactivity.
  const pointerRay = new Ray(Vector3.Zero(), Vector3.Down())
  const identity = Matrix.Identity()
  const pickHex = (): Axial | null => {
    scene.createPickingRayToRef(scene.pointerX, scene.pointerY, identity, pointerRay, iso.camera)
    return hexUnderPointer(grid, options.layout, pointerRay)
  }

  let stroking = false
  const pointerObserver = scene.onPointerObservable.add((info) => {
    if (veiled) return
    if (info.type === PointerEventTypes.POINTERMOVE) {
      const hex = pickHex()
      options.onHover?.(hex)
      if (stroking) options.onStrokeMove?.(hex)
    } else if (info.type === PointerEventTypes.POINTERDOWN) {
      if (info.event.button !== 0 || !options.brushing?.()) return
      stroking = true
      options.onStrokeStart?.(pickHex())
    } else if (info.type === PointerEventTypes.POINTERUP) {
      if (!stroking || info.event.button !== 0) return
      stroking = false
      options.onStrokeEnd?.()
    } else if (info.type === PointerEventTypes.POINTERTAP && !options.brushing?.()) {
      options.onSelect?.(pickHex(), info.event.shiftKey)
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

  // A jump that only changes the zoom moves no target the loop would notice.
  redrawOnCall(iso, ['jumpTo'])
  redrawOnCall(grid, [
    'setOverlay',
    'setFog',
    'updateFog',
    'setWindow',
    'moveWindow',
    'setSeeThrough',
  ])
  redrawOnCall(arrows, ['setPath', 'setPaths'])
  redrawOnCall(tokens, ['setEntries', 'place', 'hop', 'board', 'alight'])
  redrawOnCall(vision, ['setField', 'setShown'])
  redrawOnCall(stops, ['setStops'])
  redrawOnCall(resources, ['setMarks'])
  redrawOnCall(pois, ['setPois'])
  redrawOnCall(roads, ['setSpans', 'setGaps'])
  redrawOnCall(rivers, ['setSpans'])
  redrawOnCall(bridges, ['setRoads', 'setRivers'])

  // The rounded edge is dropped once it shrinks to about a pixel on screen,
  // which at the widest zooms is two thirds of the grid's triangles. Worked out
  // before each frame is drawn, so the switch lands on the frame that needs it.
  const detailObserver = scene.onBeforeRenderObservable.add(() => {
    const pixels = (grid.bevelRadius * engine.getRenderHeight()) / (2 * iso.zoom)
    grid.setDetail(wantsDetail(pixels, grid.detailed))
    roads.setDetail(grid.detailed)
    rivers.setDetail(grid.detailed)
    bridges.setDetail(grid.detailed)
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

  // The rings rolling out from where the screen was centred when each set off,
  // out to the farthest corner of the screen in hexes. A ring asked for while
  // one is still near the centre waits a band behind it, so each hover adds a
  // swell rather than starting the last one over.
  const waves: { start: number; x: number; z: number; reach: number }[] = []
  const spacing = hexWidth(options.layout)

  const liftWave = (now: number): void => {
    if (waves.length === 0) return
    for (let i = waves.length - 1; i >= 0; i--) {
      if (waveDone(now - waves[i].start, waves[i].reach)) waves.splice(i, 1)
    }
    if (waves.length === 0) {
      grid.lift(() => 0)
      return
    }
    grid.lift((hexX, hexZ) => {
      let height = 0
      for (const wave of waves) {
        const distance = Math.hypot(hexX - wave.x, hexZ - wave.z) / spacing
        height = Math.max(height, waveLift(distance, now - wave.start))
      }
      return height
    })
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

    const changed =
      targetMoved() ||
      dirty ||
      warming ||
      iso.settling ||
      tokens.hopping ||
      waves.length > 0 ||
      lids.active
    const animating = tokens.bobbing || arrows.count > 0 || stops.count > 0
    if (!wantsFrame({ changed, animating, sinceLastFrame: now - lastFrame })) return

    dirty = false
    lastFrame = now
    liftWave(now)
    if (lids.active) lids.step(now)
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
    bridges,

    setDaylight,

    setVeiled(next): void {
      if (next === veiled) return
      veiled = next
      grid.setVeil(next)
      iso.camera.layerMask = next ? VEIL_LAYER : EVERY_LAYER
      if (next) {
        stroking = false
        options.onHover?.(null)
      }
      dirty = true
    },

    setRevealOrigin(hex): void {
      revealOrigin = hex ? hexToWorld(options.layout, hex) : null
    },

    wave(): void {
      const centre = hexToWorld(
        options.layout,
        worldToHex(options.layout, { x: iso.camera.target.x, z: iso.camera.target.z }),
      )
      const aspect = engine.getAspectRatio(iso.camera)
      const halfDiagonal = Math.hypot(iso.zoom * aspect, iso.zoom / Math.cos(iso.camera.beta))
      const start = nextWaveStart(
        waves.map((wave) => wave.start),
        performance.now(),
      )
      if (start !== null) waves.push({ start, ...centre, reach: halfDiagonal / spacing })
    },

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
      bridges.dispose()
      rivers.dispose()
      roads.dispose()
      pois.dispose()
      resources.dispose()
      stops.dispose()
      vision.dispose()
      tokens.dispose()
      arrows.dispose()
      lids.dispose()
      grid.dispose()
      iso.dispose()
      scene.dispose()
      engine.dispose()
    },
  }
}
