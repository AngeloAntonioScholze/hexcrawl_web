import { ref, watch, type Ref } from 'vue'

const STORAGE_KEY = 'hexcrawl.debug'

const read = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

const enabled = ref(read())

watch(enabled, (on) => {
  try {
    if (on) localStorage.setItem(STORAGE_KEY, '1')
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Without storage the choice still holds for this visit.
  }
})

/**
 * Tools for trying the map out, such as peeking at the players' view. Kept in
 * this browser and never saved with a map.
 */
export function useDebugMode(): Ref<boolean> {
  return enabled
}
