import { onBeforeUnmount, watch } from 'vue'
import { useHexMapStore } from '../stores/hexMap'

/** Hexes revealed per second at 1x. */
const BASE_RATE = 3

export function useRouteReveal(): void {
  const store = useHexMapStore()

  let handle = 0
  let last = 0
  let carry = 0

  const cancel = (): void => {
    if (handle) cancelAnimationFrame(handle)
    handle = 0
  }

  const frame = (time: number): void => {
    const elapsed = last === 0 ? 0 : (time - last) / 1000
    last = time

    // Fractional progress is carried between frames so the pace stays even
    // instead of snapping to whole hexes per frame.
    carry += elapsed * BASE_RATE * store.speed
    const steps = Math.floor(carry)
    if (steps > 0) {
      carry -= steps
      store.advanceReveal(steps)
    }

    handle = store.playing ? requestAnimationFrame(frame) : 0
  }

  watch(
    () => store.playing,
    (playing) => {
      cancel()
      if (!playing) return
      last = 0
      carry = 0
      handle = requestAnimationFrame(frame)
    },
  )

  onBeforeUnmount(cancel)
}
