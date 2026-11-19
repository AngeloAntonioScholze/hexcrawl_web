import { computed, shallowRef, type ComputedRef, type Ref } from 'vue'

/** One piece of store state the history can read and put back. */
export interface Slot<T> {
  get(): T
  set(value: T): void
}

export const slotOf = <T>(source: Ref<T>): Slot<T> => ({
  get: () => source.value,
  set: (value) => {
    source.value = value
  },
})

interface Entry {
  before: readonly unknown[]
  after: readonly unknown[]
  /** Edits that share a key and follow close on each other undo as one. */
  key: string | null
  at: number
}

export type StepCause = 'action' | 'undo' | 'redo'

/** What one committed step changed, slot by slot, as a listener is told it. */
export interface Step {
  /** The slots whose value is not the one it was, by name. */
  slots: readonly string[]
  /** What each of those slots held before, by name. */
  before: Readonly<Record<string, unknown>>
  after: Readonly<Record<string, unknown>>
  key: string | null
  cause: StepCause
  /**
   * The step folds into the one told before it: before is what the slots held
   * when that one began, so this step stands for both.
   */
  merged: boolean
}

export interface HistoryOptions {
  /** How many steps back are kept; the oldest fall off. */
  limit?: number
  /** How close together two edits under the same key must be to undo as one. */
  mergeMs?: number
  now?: () => number
}

export interface History {
  /**
   * Wraps an action so that whatever it changes in the slots can be taken back.
   * An action that changes nothing leaves no step behind.
   */
  track<A extends unknown[], R>(
    action: (...args: A) => R,
    mergeKey?: (...args: A) => string,
  ): (...args: A) => R
  /**
   * Wraps an action that cannot be taken back, so that what it changes is
   * still told to the listeners. It leaves no step to undo, and the next edit
   * starts a step of its own.
   */
  observe<A extends unknown[], R>(
    action: (...args: A) => R,
    mergeKey?: (...args: A) => string,
  ): (...args: A) => R
  /**
   * Opens a step that stays open across calls until `end`, for an edit spread
   * over many events, such as a drag; tracked actions inside it join it.
   */
  begin(): void
  end(): void
  undo(): boolean
  redo(): boolean
  clear(): void
  /** Hears every committed step: each action, stroke, undo and redo that changed something. */
  onStep(listener: (step: Step) => void): () => void
  canUndo: ComputedRef<boolean>
  canRedo: ComputedRef<boolean>
}

/**
 * Undo by keeping what the slots held before and after each action. The store
 * replaces its state rather than mutating it, so a step costs a few references
 * however big the world is, and putting one back goes through the same refs
 * the actions write, which is what the save and the scene already follow.
 */
export function createHistory(
  slots: Readonly<Record<string, Slot<unknown>>>,
  { limit = 200, mergeMs = 1000, now = Date.now }: HistoryOptions = {},
): History {
  const names = Object.keys(slots)
  const held = Object.values(slots)
  const past = shallowRef<readonly Entry[]>([])
  const future = shallowRef<readonly Entry[]>([])
  let depth = 0
  // Once a step has been undone or redone, the next edit starts a step of its own.
  let sealed = false
  // The last observed step, while the next one under its key could still fold into it.
  let observed: { key: string; at: number; before: unknown[] } | null = null
  const listeners = new Set<(step: Step) => void>()

  const capture = (): unknown[] => held.map((slot) => slot.get())

  // Only what the step itself changed is put back, so state written outside
  // any tracked action since then is left as it stands.
  const apply = ({ before, after }: Entry, side: 'before' | 'after'): void => {
    const values = side === 'before' ? before : after
    held.forEach((slot, index) => {
      if (!Object.is(before[index], after[index])) slot.set(values[index])
    })
  }

  const changed = (a: readonly unknown[], b: readonly unknown[]): boolean =>
    a.some((value, index) => !Object.is(value, b[index]))

  const emit = (
    before: readonly unknown[],
    after: readonly unknown[],
    key: string | null,
    cause: StepCause,
    merged: boolean,
  ): void => {
    if (listeners.size === 0) return
    const step: Step = { slots: [], before: {}, after: {}, key, cause, merged }
    names.forEach((name, index) => {
      if (Object.is(before[index], after[index])) return
      ;(step.slots as string[]).push(name)
      ;(step.before as Record<string, unknown>)[name] = before[index]
      ;(step.after as Record<string, unknown>)[name] = after[index]
    })
    for (const listener of listeners) listener(step)
  }

  const push = (before: unknown[], after: unknown[], key: string | null): void => {
    const at = now()
    const last = past.value[past.value.length - 1]
    observed = null
    if (!sealed && key !== null && last?.key === key && at - last.at <= mergeMs) {
      past.value = [...past.value.slice(0, -1), { before: last.before, after, key, at }]
      emit(last.before, after, key, 'action', true)
    } else {
      past.value = [...past.value, { before, after, key, at }].slice(-limit)
      emit(before, after, key, 'action', false)
    }
    future.value = []
    sealed = false
  }

  const track: History['track'] =
    (action, mergeKey) =>
    (...args) => {
      // An action called from inside another is part of the outer step.
      if (depth > 0) return action(...args)

      const before = capture()
      depth += 1
      const result = action(...args)
      depth -= 1
      const after = capture()
      if (changed(before, after)) push(before, after, mergeKey?.(...args) ?? null)
      return result
    }

  const observe: History['observe'] =
    (action, mergeKey) =>
    (...args) => {
      if (depth > 0) return action(...args)

      // Read before the action runs: the action may clear the history itself.
      const prior = observed
      const before = capture()
      depth += 1
      const result = action(...args)
      depth -= 1
      const after = capture()
      if (!changed(before, after)) return result

      const key = mergeKey?.(...args) ?? null
      const at = now()
      const fold = key !== null && prior?.key === key && at - prior.at <= mergeMs ? prior : null
      const merged = fold !== null
      const from = fold?.before ?? before
      observed = key === null ? null : { key, at, before: from }
      sealed = true
      emit(from, after, key, 'action', merged)
      return result
    }

  let opened: unknown[] | null = null

  const begin = (): void => {
    if (opened) return
    opened = capture()
    depth += 1
  }

  const end = (): void => {
    if (!opened) return
    const before = opened
    opened = null
    depth -= 1
    const after = capture()
    if (changed(before, after)) push(before, after, null)
  }

  // Putting a step back in the middle of an open one would leave the open
  // step's before pointing at state that no longer stands.
  const undo = (): boolean => {
    if (opened) return false
    const last = past.value[past.value.length - 1]
    if (!last) return false
    const before = capture()
    apply(last, 'before')
    past.value = past.value.slice(0, -1)
    future.value = [...future.value, last]
    sealed = true
    observed = null
    emit(before, capture(), last.key, 'undo', false)
    return true
  }

  const redo = (): boolean => {
    if (opened) return false
    const next = future.value[future.value.length - 1]
    if (!next) return false
    const before = capture()
    apply(next, 'after')
    future.value = future.value.slice(0, -1)
    past.value = [...past.value, next]
    sealed = true
    observed = null
    emit(before, capture(), next.key, 'redo', false)
    return true
  }

  const clear = (): void => {
    past.value = []
    future.value = []
    observed = null
  }

  const onStep: History['onStep'] = (listener) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  return {
    track,
    observe,
    begin,
    end,
    undo,
    redo,
    clear,
    onStep,
    canUndo: computed(() => past.value.length > 0),
    canRedo: computed(() => future.value.length > 0),
  }
}
