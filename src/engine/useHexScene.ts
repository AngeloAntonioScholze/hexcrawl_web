import { onBeforeUnmount, onMounted, shallowRef, type Ref, type ShallowRef } from 'vue'
import { createHexScene, type HexScene, type HexSceneOptions } from './scene'

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

    const created = createHexScene(canvas.value, options)
    hexScene.value = created

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
