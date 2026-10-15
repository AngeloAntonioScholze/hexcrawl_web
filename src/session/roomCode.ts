// The broker's id namespace is shared by every PeerJS app, so the prefix keeps
// ours apart and the suffix is what a player actually reads out and types.
export const ROOM_PREFIX = 'hexcrawl-'
export const SUFFIX_LENGTH = 6

/** No 0/o, 1/l/i: a code gets read aloud and copied by hand. */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

const SUFFIX = new RegExp(`^[${ALPHABET}]{${SUFFIX_LENGTH}}$`)

const randomBytes = (count: number): Uint8Array => crypto.getRandomValues(new Uint8Array(count))

export const makeRoomCode = (bytes: (count: number) => Uint8Array = randomBytes): string => {
  const suffix = Array.from(bytes(SUFFIX_LENGTH), (byte) => ALPHABET[byte % ALPHABET.length])
  return ROOM_PREFIX + suffix.join('')
}

/** Accepts the full code or just its suffix, in any case and with stray spaces. */
export const normaliseRoomCode = (input: string): string | null => {
  const lowered = input.trim().toLowerCase()
  const suffix = lowered.startsWith(ROOM_PREFIX) ? lowered.slice(ROOM_PREFIX.length) : lowered
  return SUFFIX.test(suffix) ? ROOM_PREFIX + suffix : null
}
