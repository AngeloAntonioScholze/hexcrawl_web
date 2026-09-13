import { onBeforeUnmount, watch, type ShallowRef } from 'vue'
import {
  chunkSpanFor,
  sameSpan,
  spanCapacity,
  tilesInSpan,
  worldBounds,
  type ChunkSpan,
  type ViewRect,
} from '../engine/hexWindow'
import type { HexScene } from '../engine/scene'
import type { Layout } from '../hex/layout'
import type { TerrainField } from '../terrain/field'

/** Aspect ratios past this are treated as this wide when sizing the grid. */
const WIDEST = 3

/** The most hexes the grid will ever be asked to hold, whatever the world. */
export const ZOOM_BUDGET = 80_000

/** And the least, so even a tiny world gets a view worth having. */
export const MIN_BUDGET = 20_000

/**
 * Nobody gets a view narrower than this, however small their world or tight
 * their budget: the floor is a promise about the view, and the grid is sized
 * off it, so a budget that cannot pay for it loses rather than the view does.
 */
export const MIN_MAX_ZOOM = 40

/** Zoom steps are coarse, so the search for the limit can be too. */
const ZOOM_STEP = 5

/** Hexes in a world of this radius: the rings around the middle, plus it. */
export const hexCount = (radius: number): number => 3 * radius * (radius + 1) + 1

/**
 * How much grid a world of this size is allowed at its widest view: all of it,
 * within the ceiling. A world small enough to draw whole can be looked at
 * whole; one too big to draw stops where the grid does, and the minimap is
 * what shows the rest of it.
 */
export const budgetFor = (radius: number): number =>
  Math.min(ZOOM_BUDGET, Math.max(MIN_BUDGET, hexCount(radius)))

/**
 * The world-space rectangle a view covers. The camera is orthographic and can
 * be rotated, so the rectangle is the circle around the view: half its diagonal
 * in every direction, which covers the view at any rotation without having to
 * care which way it is turned.
 */
export function viewRect(target: { x: number; z: number }, zoom: number, aspect: number): ViewRect {
  const reach = Math.hypot(zoom * aspect, zoom)
  return {
    minX: target.x - reach,
    maxX: target.x + reach,
    minZ: target.z - reach,
    maxZ: target.z + reach,
  }
}

/**
 * How many hexes the grid must hold for the widest view the camera allows. The
 * rectangle is the circle around the view, so this is generous by about half:
 * the grid is sized for the worst rotation rather than measured at each one.
 */
export function capacityFor(layout: Layout, maxZoom: number): number {
  return spanCapacity(chunkSpanFor(layout, viewRect({ x: 0, z: 0 }, maxZoom, WIDEST)))
}

/**
 * What a view of this width actually costs on a world of this size. A window
 * reaching past the rim holds nothing out there, so a small world is cheap to
 * look at whole however far back the camera stands.
 */
export const windowCost = (layout: Layout, zoom: number, radius: number): number =>
  Math.min(capacityFor(layout, zoom), hexCount(radius))

/**
 * How far back the view may be pulled on a world of this size. A small world
 * can be seen whole; a big one is held to what the grid can hold, so the limit
 * grows with the world and then stops when the buffers would.
 */
export function maxZoomFor(layout: Layout, radius: number, budget = budgetFor(radius)): number {
  const box = worldBounds(layout, radius)

  // Seeing the whole world, and a little of the void around it, is as far out
  // as anybody needs to go: past that the map only gets smaller on screen.
  const whole = Math.max(
    MIN_MAX_ZOOM,
    (Math.max(box.maxX - box.minX, box.maxZ - box.minZ) / 2) * 1.1,
  )

  let limit = MIN_MAX_ZOOM
  for (let zoom = MIN_MAX_ZOOM; zoom <= whole; zoom += ZOOM_STEP) {
    if (windowCost(layout, zoom, radius) > budget) break
    limit = zoom
  }

  return Math.min(limit, Math.round(whole))
}

/**
 * Keeps the grid on the hexes the camera is looking at, with two chunks of
 * ground carried spare on every side. The window is only rebuilt when the view
 * crosses a chunk boundary, so a drag moves the map as one piece and costs
 * nothing: the ground it drags into was already built.
 */
export function useHexWindow(
  hexScene: ShallowRef<HexScene | null>,
  layout: Layout,
  field: () => TerrainField,
  onWindow?: (tiles: ReturnType<typeof tilesInSpan>) => void,
): void {
  let span: ChunkSpan | null = null
  let observer: ReturnType<HexScene['scene']['onBeforeRenderObservable']['add']> | null = null

  const rebuild = (next: ChunkSpan): void => {
    const scene = hexScene.value
    if (!scene) return

    span = next
    const tiles = tilesInSpan(field(), next)
    scene.setWindow(tiles)
    onWindow?.(tiles)
  }

  /** Called every frame, but it only looks at four numbers before giving up. */
  const check = (): void => {
    const scene = hexScene.value
    if (!scene) return

    const { x, z } = scene.iso.camera.target
    const aspect = scene.engine.getAspectRatio(scene.iso.camera)
    const next = chunkSpanFor(layout, viewRect({ x, z }, scene.iso.zoom, aspect))
    if (sameSpan(span, next)) return

    rebuild(next)
  }

  const detach = (): void => {
    const scene = hexScene.value
    if (scene && observer) scene.scene.onBeforeRenderObservable.remove(observer)
    observer = null
  }

  watch(
    hexScene,
    (scene) => {
      detach()
      span = null
      if (!scene) return
      observer = scene.scene.onBeforeRenderObservable.add(check)
      check()
    },
    { immediate: true },
  )

  /** A new world is new ground under the same view, so the window is rebuilt. */
  const refresh = (): void => {
    span = null
    check()
  }

  watch(field, refresh)

  onBeforeUnmount(detach)
}
