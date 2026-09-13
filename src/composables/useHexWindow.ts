import { onBeforeUnmount, watch, type ShallowRef } from 'vue'
import {
  chunkSpanFor,
  insideSpan,
  rectCorners,
  sameSpan,
  spanCapacity,
  tilesEntering,
  tilesInSpan,
  worldBounds,
  type ChunkSpan,
} from '../engine/hexWindow'
import type { HexScene } from '../engine/scene'
import type { HexKey } from '../hex/coords'
import type { Layout, WorldPoint } from '../hex/layout'
import type { TerrainField } from '../terrain/field'

/** Aspect ratios past this are treated as this wide when sizing the grid. */
const WIDEST = 3

/**
 * The most hexes the grid will ever be asked to hold, whatever the world. Sized
 * so a world too big to see whole reaches FARTHEST_ZOOM at the default hex size;
 * 205 would need 295k.
 */
export const ZOOM_BUDGET = 290_000

/** A world with no more hexes than this may be pulled back until it is seen whole. */
export const WHOLE_WORLD = 80_000

/**
 * How far back a world too big to see whole may be pulled. Past zoom 195 the
 * grid could hold the whole huge world, so frame rate sets this, not the buffers.
 */
export const FARTHEST_ZOOM = 200

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

/** How much narrower each try is when a view has to be squeezed onto the grid. */
const SQUEEZE = 0.9

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

/** Where the camera stands and how it looks: everything that decides what ground is in view. */
export interface View {
  x: number
  z: number
  /** Half the world-space height on screen. */
  zoom: number
  aspect: number
  /** The camera's turn about its target. */
  alpha: number
  /** How far the camera leans from looking straight down. */
  beta: number
}

/**
 * The patch of ground an orthographic view covers, as its four corners. Screen
 * width lies flat on the ground, but screen height is laid along it at the
 * camera's lean and stretches by 1/cos of it, and the whole patch turns with
 * the camera. Terrain standing above the ground shows a little past the far
 * edge, which the margin chunks carry.
 */
export function viewFootprint(view: View): WorldPoint[] {
  const along = view.zoom / Math.cos(view.beta)
  const across = view.zoom * view.aspect
  const cos = Math.cos(view.alpha)
  const sin = Math.sin(view.alpha)

  return [1, -1].flatMap((ahead) =>
    [1, -1].map((side) => ({
      x: view.x + cos * along * ahead - sin * across * side,
      z: view.z + sin * along * ahead + cos * across * side,
    })),
  )
}

/**
 * How many hexes the grid must hold for the widest view the camera allows,
 * sized for the circle around an untilted view of the widest screen. Turning a
 * view sweeps each axial extent out to that circle, so this is the rotation
 * that costs the most rather than any one of them.
 */
export function capacityFor(layout: Layout, maxZoom: number): number {
  const reach = Math.hypot(maxZoom * WIDEST, maxZoom)
  return spanCapacity(
    chunkSpanFor(layout, rectCorners({ minX: -reach, maxX: reach, minZ: -reach, maxZ: reach })),
  )
}

/**
 * The grid every world shares. No world's widest view costs more than the
 * ceiling, but the zoom floor is kept even when a budget cannot pay for it, so
 * the grid holds whichever of the two is bigger. Sized off the named worlds
 * alone, a radius between them could ask for more than the buffers hold.
 */
export const gridCapacity = (layout: Layout): number =>
  Math.max(ZOOM_BUDGET, capacityFor(layout, MIN_MAX_ZOOM))

/**
 * The chunks a view needs, held to what the grid can take. The grid is sized
 * for an untilted view of the widest screen, and a tilted view on a wider one
 * can ask for more; an overflow would throw inside the render loop and stop it
 * for good, so such a view is narrowed until it fits and its sides lose a
 * sliver instead. It is never narrowed past square, which at the map's lean
 * sits well inside the circle the grid was sized for.
 */
export function viewSpan(layout: Layout, view: View, capacity = Infinity): ChunkSpan {
  let aspect = view.aspect
  let span = chunkSpanFor(layout, viewFootprint(view))

  while (spanCapacity(span) > capacity && aspect > 1) {
    aspect = Math.max(1, aspect * SQUEEZE)
    span = chunkSpanFor(layout, viewFootprint({ ...view, aspect }))
  }

  return span
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

  const ceiling = hexCount(radius) <= WHOLE_WORLD ? whole : Math.min(whole, FARTHEST_ZOOM)

  let limit = MIN_MAX_ZOOM
  for (let zoom = MIN_MAX_ZOOM; zoom <= ceiling; zoom += ZOOM_STEP) {
    if (windowCost(layout, zoom, radius) > budget) break
    limit = zoom
  }

  return Math.min(limit, Math.round(ceiling))
}

/**
 * Keeps the grid on the hexes the camera is looking at, with two chunks of
 * ground carried spare on every side. The window only moves when the view
 * crosses a chunk boundary, so a drag moves the map as one piece and costs
 * nothing: the ground it drags into was already built.
 */
export function useHexWindow(
  hexScene: ShallowRef<HexScene | null>,
  layout: Layout,
  field: () => TerrainField,
  onWindow?: (keys: readonly HexKey[]) => void,
): void {
  let span: ChunkSpan | null = null
  let observer: ReturnType<HexScene['scene']['onBeforeRenderObservable']['add']> | null = null

  const rebuild = (next: ChunkSpan): void => {
    const scene = hexScene.value
    if (!scene) return

    const previous = span
    span = next

    // From a span it was already carrying, the grid keeps what is still in view
    // and builds only the chunks coming into it. The first window, or one on a
    // new world, is laid down whole.
    if (previous) {
      scene.moveWindow((q, r) => insideSpan(next, q, r), tilesEntering(field(), previous, next))
    } else {
      scene.setWindow(tilesInSpan(field(), next))
    }
    onWindow?.(scene.grid.keys)
  }

  /** Called on every frame drawn, but it gives up unless the span has moved. */
  const check = (): void => {
    const scene = hexScene.value
    if (!scene) return

    const { camera } = scene.iso
    const next = viewSpan(
      layout,
      {
        x: camera.target.x,
        z: camera.target.z,
        zoom: scene.iso.zoom,
        aspect: scene.engine.getAspectRatio(camera),
        alpha: camera.alpha,
        beta: camera.beta,
      },
      scene.grid.capacity,
    )
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
