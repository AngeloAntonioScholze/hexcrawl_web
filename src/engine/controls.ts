import { editsText } from '../input/editsText'
import type { IsoCamera } from './camera'

const ZOOM_STEP = 1.12

export interface IsoControlOptions {
  /** While this holds, a left-button drag belongs to the brush and the camera pans by the right or middle button. */
  brushing?(): boolean
}

export function attachIsoControls(
  canvas: HTMLCanvasElement,
  iso: IsoCamera,
  { brushing }: IsoControlOptions = {},
): () => void {
  let panPointer: number | null = null
  let lastX = 0
  let lastY = 0

  const onWheel = (event: WheelEvent): void => {
    event.preventDefault()
    iso.zoomBy(event.deltaY > 0 ? ZOOM_STEP : 1 / ZOOM_STEP)
  }

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button === 0 ? brushing?.() : event.button !== 1 && event.button !== 2) return
    panPointer = event.pointerId
    lastX = event.clientX
    lastY = event.clientY
    canvas.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== panPointer) return
    iso.panBy(event.clientX - lastX, event.clientY - lastY)
    lastX = event.clientX
    lastY = event.clientY
  }

  const onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== panPointer) return
    panPointer = null
    canvas.releasePointerCapture(event.pointerId)
  }

  const onContextMenu = (event: MouseEvent): void => {
    event.preventDefault()
  }

  const onKeyDown = (event: KeyboardEvent): void => {
    if (editsText(event.target)) return
    if (event.key === 'q' || event.key === 'Q') iso.rotate(-1)
    else if (event.key === 'e' || event.key === 'E') iso.rotate(1)
    else return
    event.preventDefault()
  }

  canvas.addEventListener('wheel', onWheel, { passive: false })
  canvas.addEventListener('pointerdown', onPointerDown)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('pointercancel', onPointerUp)
  canvas.addEventListener('contextmenu', onContextMenu)
  window.addEventListener('keydown', onKeyDown)

  return () => {
    canvas.removeEventListener('wheel', onWheel)
    canvas.removeEventListener('pointerdown', onPointerDown)
    canvas.removeEventListener('pointermove', onPointerMove)
    canvas.removeEventListener('pointerup', onPointerUp)
    canvas.removeEventListener('pointercancel', onPointerUp)
    canvas.removeEventListener('contextmenu', onContextMenu)
    window.removeEventListener('keydown', onKeyDown)
  }
}
