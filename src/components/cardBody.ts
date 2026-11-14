/** Rows a card's lower box holds before the last one gives way to a "+n more" line. */
export const CREW_ROWS = 6

/** The rows a card shows, and how many it leaves to the panel below. */
export const crewShown = <T>(
  list: readonly T[],
  rows: number = CREW_ROWS,
): { shown: readonly T[]; more: number } =>
  list.length <= rows
    ? { shown: list, more: 0 }
    : { shown: list.slice(0, rows - 1), more: list.length - (rows - 1) }

/** A typed draft the field would accept as it stands: a whole number within the limits. */
export const draftValid = (raw: string, min: number, max: number): boolean => {
  if (raw.trim() === '') return false
  const value = Number(raw)
  return Number.isInteger(value) && value >= min && value <= max
}

/** What a committed draft sends on, if anything; the store does the clamping. */
export const draftCommit = (raw: string): number | null => {
  if (raw.trim() === '') return null
  const value = Number(raw)
  return Number.isFinite(value) ? Math.round(value) : null
}
