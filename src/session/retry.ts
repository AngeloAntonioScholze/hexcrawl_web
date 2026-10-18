/** How long a guest waits between one try at the room and the next. */
export const RETRY_EVERY_MS = 3000

/** How long a guest keeps trying a room whose DM has gone before it gives up. */
export const RETRY_WITHIN_MS = 10 * 60 * 1000

/** The clock and timers a retry runs on; the browser's own unless a test hands it others. */
export interface RetryClock {
  now: () => number
  setTimeout: (run: () => void, ms: number) => unknown
  clearTimeout: (handle: unknown) => void
}

export const browserClock: RetryClock = {
  now: () => Date.now(),
  setTimeout: (run, ms) => setTimeout(run, ms),
  clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
}

export interface RetryOptions {
  every?: number
  within?: number
  clock?: RetryClock
}

export interface Retry {
  /**
   * Books the next try after the usual wait. False, and nothing booked, once
   * that try would land past the window or the retry was stopped.
   */
  schedule: () => boolean
  /** Calls off any try still booked, for good. */
  stop: () => void
  /** Tries made so far. */
  readonly attempts: number
}

/**
 * Tries something again and again at a steady pace until it is stopped or
 * the window, counted from when the retry was made, runs out. Only one try is
 * ever booked at a time: scheduling again replaces the one waiting.
 */
export const createRetry = (attempt: () => void, options: RetryOptions = {}): Retry => {
  const every = options.every ?? RETRY_EVERY_MS
  const within = options.within ?? RETRY_WITHIN_MS
  const clock = options.clock ?? browserClock
  const startedAt = clock.now()
  let pending: unknown = null
  let stopped = false
  let attempts = 0

  const cancel = (): void => {
    if (pending !== null) clock.clearTimeout(pending)
    pending = null
  }

  return {
    schedule: () => {
      cancel()
      if (stopped || clock.now() + every - startedAt > within) return false
      pending = clock.setTimeout(() => {
        pending = null
        attempts++
        attempt()
      }, every)
      return true
    },
    stop: () => {
      stopped = true
      cancel()
    },
    get attempts() {
      return attempts
    },
  }
}
