import { nameKey } from './admission'

/**
 * A player's place at the table: the name they joined under, in the form it
 * was first seated, and the token that is theirs. Names match as the door
 * matches them, so " Mira" coming back finds Mira's token.
 */
export interface Seat {
  name: string
  entityId: string
}

/** The seat a name already has, while its token is still on the map. */
export const seatOf = (
  seats: readonly Seat[],
  name: string,
  exists: (entityId: string) => boolean,
): Seat | undefined => {
  const key = nameKey(name)
  return seats.find((one) => nameKey(one.name) === key && exists(one.entityId))
}

/** Seats a name at a token, in place of any seat the name had before. */
export const withSeat = (seats: readonly Seat[], name: string, entityId: string): Seat[] => {
  const key = nameKey(name)
  return [...seats.filter((one) => nameKey(one.name) !== key), { name: name.trim(), entityId }]
}

/** Every token a name plays that is still on the map, in the order it got them. */
export const seatsOf = (
  seats: readonly Seat[],
  name: string,
  exists: (entityId: string) => boolean,
): string[] => {
  const key = nameKey(name)
  return seats
    .filter((one) => nameKey(one.name) === key && exists(one.entityId))
    .map((one) => one.entityId)
}

/** Who plays a token, if anybody does. */
export const seatAt = (seats: readonly Seat[], entityId: string): Seat | undefined =>
  seats.find((one) => one.entityId === entityId)

/**
 * Hands a token to one player, out of whoever's hands it was in, or to nobody.
 * A name already seated keeps the form it was first seated under.
 */
export const assignSeat = (
  seats: readonly Seat[],
  entityId: string,
  name: string | null,
): Seat[] => {
  const rest = seats.filter((one) => one.entityId !== entityId)
  if (name === null || !name.trim()) return rest
  const key = nameKey(name)
  const known = seats.find((one) => nameKey(one.name) === key)?.name ?? name.trim()
  return [...rest, { name: known, entityId }]
}
