import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { createHistory, slotOf, type Step } from './history'

const setup = (options: { limit?: number } = {}) => {
  const count = ref(0)
  const label = ref('a')
  let clock = 0
  const history = createHistory(
    { count: slotOf(count), label: slotOf(label) },
    { ...options, mergeMs: 100, now: () => clock },
  )
  const tick = (ms: number): void => {
    clock += ms
  }
  const bump = history.track((by: number) => {
    count.value += by
  })
  const rename = history.track(
    (to: string) => {
      label.value = to
    },
    () => 'label',
  )
  return { count, label, history, tick, bump, rename }
}

describe('history', () => {
  it('takes a step back and forward again', () => {
    const { count, history, bump } = setup()
    bump(2)
    bump(3)

    expect(history.undo()).toBe(true)
    expect(count.value).toBe(2)
    expect(history.undo()).toBe(true)
    expect(count.value).toBe(0)
    expect(history.undo()).toBe(false)

    expect(history.redo()).toBe(true)
    expect(count.value).toBe(2)
    expect(history.redo()).toBe(true)
    expect(count.value).toBe(5)
    expect(history.redo()).toBe(false)
  })

  it('leaves no step for an action that changed nothing', () => {
    const { history, bump } = setup()
    bump(0)
    expect(history.canUndo.value).toBe(false)
  })

  it('forgets what could be redone once a new edit is made', () => {
    const { count, history, bump } = setup()
    bump(1)
    history.undo()
    bump(5)

    expect(history.canRedo.value).toBe(false)
    history.undo()
    expect(count.value).toBe(0)
  })

  it('puts back only the slots that differ', () => {
    const { count, label, history, bump, rename } = setup()
    bump(1)
    rename('b')
    count.value = 10

    history.undo()
    expect(label.value).toBe('a')
    expect(count.value).toBe(10)
  })

  it('undoes edits under one key in quick succession as one', () => {
    const { label, history, tick, rename } = setup()
    rename('b')
    tick(50)
    rename('c')
    tick(50)
    rename('d')

    history.undo()
    expect(label.value).toBe('a')
    expect(history.canUndo.value).toBe(false)
  })

  it('keeps edits under one key apart once they are far enough apart', () => {
    const { label, history, tick, rename } = setup()
    rename('b')
    tick(500)
    rename('c')

    history.undo()
    expect(label.value).toBe('b')
  })

  it('does not merge an edit into a step that was undone and redone', () => {
    const { label, history, rename } = setup()
    rename('b')
    history.undo()
    history.redo()
    rename('c')

    history.undo()
    expect(label.value).toBe('b')
  })

  it('records an action called inside another as part of the outer step', () => {
    const { count, history, bump } = setup()
    const twice = history.track(() => {
      bump(1)
      bump(1)
    })
    twice()

    history.undo()
    expect(count.value).toBe(0)
    expect(history.canUndo.value).toBe(false)
  })

  it('records everything between begin and end as one step, however long it runs', () => {
    const { count, history, tick, bump } = setup()
    history.begin()
    bump(1)
    tick(500)
    bump(2)
    history.end()

    expect(count.value).toBe(3)
    history.undo()
    expect(count.value).toBe(0)
    expect(history.canUndo.value).toBe(false)
  })

  it('leaves no step for an open step that changed nothing', () => {
    const { history } = setup()
    history.begin()
    history.end()
    expect(history.canUndo.value).toBe(false)
  })

  it('will not undo or redo while a step is open', () => {
    const { count, history, bump } = setup()
    bump(1)
    history.begin()
    bump(1)

    expect(history.undo()).toBe(false)
    expect(count.value).toBe(2)
    history.end()
    history.undo()
    expect(count.value).toBe(1)
  })

  it('drops the oldest steps past the limit', () => {
    const { count, history, bump } = setup({ limit: 2 })
    bump(1)
    bump(1)
    bump(1)

    history.undo()
    history.undo()
    expect(history.undo()).toBe(false)
    expect(count.value).toBe(1)
  })

  it('forgets everything when cleared', () => {
    const { history, bump } = setup()
    bump(1)
    bump(1)
    history.undo()
    history.clear()

    expect(history.canUndo.value).toBe(false)
    expect(history.canRedo.value).toBe(false)
  })
})

describe('history steps', () => {
  const listen = (history: ReturnType<typeof setup>['history']): Step[] => {
    const steps: Step[] = []
    history.onStep((step) => steps.push(step))
    return steps
  }

  it('tells only the slots a step changed, with what they held before and after', () => {
    const { history, bump } = setup()
    const steps = listen(history)
    bump(2)

    expect(steps).toEqual([
      {
        slots: ['count'],
        before: { count: 0 },
        after: { count: 2 },
        key: null,
        cause: 'action',
        merged: false,
      },
    ])
  })

  it('tells nothing for an action that changed nothing', () => {
    const { history, bump } = setup()
    const steps = listen(history)
    bump(0)
    expect(steps).toEqual([])
  })

  it('tells a merged edit as standing for the whole burst', () => {
    const { history, tick, rename } = setup()
    const steps = listen(history)
    rename('b')
    tick(50)
    rename('c')

    expect(steps[1]).toMatchObject({
      before: { label: 'a' },
      after: { label: 'c' },
      key: 'label',
      merged: true,
    })
  })

  it('tells undo and redo with the state they left', () => {
    const { history, bump } = setup()
    bump(3)
    const steps = listen(history)
    history.undo()
    history.redo()

    expect(steps.map(({ cause, before, after }) => ({ cause, before, after }))).toEqual([
      { cause: 'undo', before: { count: 3 }, after: { count: 0 } },
      { cause: 'redo', before: { count: 0 }, after: { count: 3 } },
    ])
  })

  it('tells a stroke once when it ends', () => {
    const { history, bump } = setup()
    const steps = listen(history)
    history.begin()
    bump(1)
    bump(1)
    expect(steps).toEqual([])
    history.end()

    expect(steps).toHaveLength(1)
    expect(steps[0]).toMatchObject({ before: { count: 0 }, after: { count: 2 } })
  })

  it('stops telling a listener once it unsubscribes', () => {
    const { history, bump } = setup()
    const steps: Step[] = []
    const stop = history.onStep((step) => steps.push(step))
    stop()
    bump(1)
    expect(steps).toEqual([])
  })

  it('tells an observed action without leaving a step to undo', () => {
    const { count, history } = setup()
    const steps = listen(history)
    const advance = history.observe(() => {
      count.value += 1
    })
    advance()

    expect(history.canUndo.value).toBe(false)
    expect(steps).toEqual([
      {
        slots: ['count'],
        before: { count: 0 },
        after: { count: 1 },
        key: null,
        cause: 'action',
        merged: false,
      },
    ])
  })

  it('tells an observed action that changed nothing as nothing', () => {
    const { history } = setup()
    const steps = listen(history)
    history.observe(() => undefined)()
    expect(steps).toEqual([])
  })

  it('takes tracked actions inside an observed one into its step', () => {
    const { history, bump } = setup()
    const steps = listen(history)
    history.observe(() => {
      bump(1)
      bump(1)
    })()

    expect(history.canUndo.value).toBe(false)
    expect(steps).toHaveLength(1)
    expect(steps[0]!.after).toEqual({ count: 2 })
  })

  it('keeps the next edit out of the step before an observed action', () => {
    const { label, history, rename } = setup()
    rename('b')
    history.observe(() => undefined)()
    history.observe((to: number) => {
      label.value = `${label.value}${to}`
    })(1)
    rename('c')

    history.undo()
    expect(label.value).toBe('b1')
  })

  it('folds observed actions under one key in quick succession', () => {
    const { count, history, tick } = setup()
    const steps = listen(history)
    const set = history.observe(
      (to: number) => {
        count.value = to
      },
      () => 'count',
    )
    set(1)
    tick(50)
    set(2)
    tick(500)
    set(3)

    expect(steps.map(({ before, after, merged }) => ({ before, after, merged }))).toEqual([
      { before: { count: 0 }, after: { count: 1 }, merged: false },
      { before: { count: 0 }, after: { count: 2 }, merged: true },
      { before: { count: 2 }, after: { count: 3 }, merged: false },
    ])
  })

  it('does not fold an observed action into one from before an undo', () => {
    const { count, history, bump } = setup()
    const steps = listen(history)
    const set = history.observe(
      (to: number) => {
        count.value = to
      },
      () => 'count',
    )
    set(5)
    bump(1)
    history.undo()
    set(7)

    expect(steps.at(-1)).toMatchObject({ before: { count: 5 }, merged: false })
  })
})
