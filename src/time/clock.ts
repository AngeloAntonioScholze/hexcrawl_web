/**
 * The turn is the atom of the crawl: nothing on the map happens except by one
 * passing. Four turns of light, then four of dark.
 */
export const TURNS_PER_PHASE = 4

export const TURNS_PER_DAY = TURNS_PER_PHASE * 2

export type Phase = 'day' | 'night'

export interface Clock {
  /** Whole turns since the crawl began; everything else is read off this. */
  turn: number
  phase: Phase
  /** Turns of this phase already spent, 0 at first light and at nightfall. */
  index: number
  /** Counted from one: the day the party is living through. */
  day: number
}

export function clockAt(turn: number): Clock {
  const whole = Math.max(0, Math.floor(turn))
  const phases = Math.floor(whole / TURNS_PER_PHASE)

  return {
    turn: whole,
    phase: phases % 2 === 0 ? 'day' : 'night',
    index: whole % TURNS_PER_PHASE,
    day: Math.floor(whole / TURNS_PER_DAY) + 1,
  }
}

export const isNight = (turn: number): boolean => clockAt(turn).phase === 'night'

/** Where the skip control lands: the opening of the phase after this one. */
export function nextPhaseTurn(turn: number): number {
  const whole = Math.max(0, Math.floor(turn))
  return whole + (TURNS_PER_PHASE - (whole % TURNS_PER_PHASE))
}
