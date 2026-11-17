import { onBeforeUnmount, onMounted, shallowRef, type Ref, type ShallowRef } from 'vue'
import { capture } from '../analytics/analytics'
import { createHexScene, type HexScene, type HexSceneOptions } from './scene'

// Babylon's own words when the browser gives it no WebGL context.
const NO_WEBGL = /WebGL not supported/

// Babylon objects are held in shallowRef on purpose: wrapping meshes, cameras
// or the engine in a reactive proxy costs a proxy hop on every property touch
// inside the render loop and breaks Babylon's own identity checks.
export function useHexScene(
  canvas: Ref<HTMLCanvasElement | null>,
  options: HexSceneOptions,
): { hexScene: ShallowRef<HexScene | null> } {
  const hexScene = shallowRef<HexScene | null>(null)
  let resizeObserver: ResizeObserver | null = null

  onMounted(() => {
    if (!canvas.value) throw new Error('useHexScene mounted without a canvas element')

    let created: HexScene
    try {
      created = createHexScene(canvas.value, options)
    } catch (error) {
      const message = error instanceof Error ? error.message : ''
      capture('render_init_failed', { reason: NO_WEBGL.test(message) ? 'no_webgl' : 'other' })
      throw error
    }
    hexScene.value = created
    created.engine.onContextLostObservable.add(() =>
      capture('render_init_failed', { reason: 'context_lost' }),
    )

    resizeObserver = new ResizeObserver(() => created.resize())
    resizeObserver.observe(canvas.value)
  })

  onBeforeUnmount(() => {
    resizeObserver?.disconnect()
    resizeObserver = null
    hexScene.value?.dispose()
    hexScene.value = null
  })

  return { hexScene }
}
