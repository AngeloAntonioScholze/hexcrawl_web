import { watch } from 'vue'
import type { useHexMapStore } from '../stores/hexMap'
import type { useSessionStore } from '../stores/session'

const STORAGE_KEY = 'hexcrawl.playerView'

export const readPlayerView = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export const writePlayerView = (on: boolean): void => {
  try {
    if (on) localStorage.setItem(STORAGE_KEY, '1')
    else localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Without storage the choice still holds for this visit.
  }
}

/**
 * Whether the DM is peeking at the players' view, kept in this browser and
 * never saved with a map. A guest's view is the room's to say, so nothing
 * stored here is handed to one, nor taken from one.
 */
export function useViewMode(
  store: ReturnType<typeof useHexMapStore>,
  session: ReturnType<typeof useSessionStore>,
): void {
  if (session.role !== 'guest' && readPlayerView()) store.dmView = false
  watch(
    () => store.dmView,
    (dm) => {
      if (session.role !== 'guest') writePlayerView(!dm)
    },
  )
}
