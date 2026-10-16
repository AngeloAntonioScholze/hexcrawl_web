import { normaliseRoomCode, ROOM_PREFIX } from './roomCode'

/**
 * The room a join link points at, from a URL's query string, as the player
 * would type it: without the prefix, which only keeps ours apart on the broker.
 * Null when there is none worth trying.
 */
export const roomFromLink = (search: string): string | null => {
  const room = new URLSearchParams(search).get('room')
  const code = room === null ? null : normaliseRoomCode(room)
  return code === null ? null : code.slice(ROOM_PREFIX.length)
}
