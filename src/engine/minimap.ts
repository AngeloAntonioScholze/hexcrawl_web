import type { ViewRect } from './hexWindow'

/** The whole world squeezed into a square drawing `size` pixels on a side. */
export interface MinimapFrame {
  bounds: ViewRect
  size: number
}

export interface Pixel {
  x: number
  y: number
}

/** A rectangle in minimap pixels, by its centre. */
export interface PixelBox {
  x: number
  y: number
  width: number
  height: number
}

export const minimapScale = ({ bounds, size }: MinimapFrame): number =>
  size / Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ)

/**
 * The camera sits south of its target and looks north, so the far edge of the
 * world is the top of the screen: z grows away from the viewer while canvas y
 * grows toward them, and the drawing is flipped to match what the map shows.
 */
export function worldToMinimap(frame: MinimapFrame, x: number, z: number): Pixel {
  const scale = minimapScale(frame)
  return { x: (x - frame.bounds.minX) * scale, y: (frame.bounds.maxZ - z) * scale }
}

export function minimapToWorld(frame: MinimapFrame, pixel: Pixel): { x: number; z: number } {
  const scale = minimapScale(frame)
  return { x: frame.bounds.minX + pixel.x / scale, z: frame.bounds.maxZ - pixel.y / scale }
}

/** What the main view covers: `zoom` is half its world height. Never thinner than `least`. */
export function viewBox(
  frame: MinimapFrame,
  target: { x: number; z: number },
  zoom: number,
  aspect: number,
  least: number,
): PixelBox {
  const scale = minimapScale(frame)
  const middle = worldToMinimap(frame, target.x, target.z)
  return {
    x: middle.x,
    y: middle.y,
    width: Math.max(least, zoom * aspect * 2 * scale),
    height: Math.max(least, zoom * 2 * scale),
  }
}

export const boxContains = (box: PixelBox, pixel: Pixel): boolean =>
  Math.abs(pixel.x - box.x) <= box.width / 2 && Math.abs(pixel.y - box.y) <= box.height / 2
