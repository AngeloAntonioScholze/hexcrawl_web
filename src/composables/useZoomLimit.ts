import { computed, ref, type ComputedRef, type Ref } from 'vue'
import { MIN_MAX_ZOOM } from './useHexWindow'

const STORAGE_KEY = 'hexcrawl.zoomLimit'

/**
 * How far back the camera may go: what the viewer chose, held inside what this
 * world allows. Nothing chosen is as far as the world allows, and a choice made
 * on a bigger world is kept rather than cut, so going back to it restores it.
 */
export const zoomLimit = (chosen: number | null, farthest: number): number =>
  chosen === null ? farthest : Math.min(farthest, Math.max(MIN_MAX_ZOOM, chosen))

const read = (): number | null => {
  try {
    const stored = Number(localStorage.getItem(STORAGE_KEY) ?? NaN)
    return Number.isFinite(stored) ? stored : null
  } catch {
    return null
  }
}

// Shared by the canvas, which knows the layout and so what the world allows,
// and the panel, which shows the slider: one setting, not one per component.
const chosen = ref<number | null>(read())
const farthest = ref(MIN_MAX_ZOOM)
const limit = computed(() => zoomLimit(chosen.value, farthest.value))

/**
 * The zoom-out limit, a view setting rather than part of the map: it lives in
 * this browser and is never saved with a map.
 */
export function useZoomLimit(): {
  farthest: Ref<number>
  limit: ComputedRef<number>
  choose(value: number): void
} {
  // The slider pushed to its end means as far as any world allows, not this
  // world's number, so a bigger world opens out to its own end.
  const choose = (value: number): void => {
    chosen.value = value >= farthest.value ? null : value
    try {
      if (chosen.value === null) localStorage.removeItem(STORAGE_KEY)
      else localStorage.setItem(STORAGE_KEY, String(chosen.value))
    } catch {
      // Without storage the choice still holds for this visit.
    }
  }

  return { farthest, limit, choose }
}
