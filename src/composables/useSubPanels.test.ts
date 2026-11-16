import { beforeEach, describe, expect, it } from 'vitest'
import {
  closeAt,
  columnMode,
  firstInvalidLevel,
  openAt,
  subColumns,
  useSubPanels,
  visibleLevels,
  type SubPanel,
  type SubPanelWorld,
} from './useSubPanels'

const a: SubPanel = { kind: 'entity', id: 'a' }
const b: SubPanel = { kind: 'entity', id: 'b' }
const r: SubPanel = { kind: 'entity', id: 'r' }
const m: SubPanel = { kind: 'merchant', id: 'm' }

describe('the sub-panel columns', () => {
  describe('openAt', () => {
    it('opens level 1 on an empty stack', () => {
      expect(openAt([], a, 0)).toEqual([a])
    })
    it('opens level 2 under level 1', () => {
      expect(openAt([a], m, 1)).toEqual([a, m])
    })
    it('replacing level 1 drops level 2', () => {
      expect(openAt([a, m], b, 0)).toEqual([b])
    })
    it('replaces level 2', () => {
      expect(openAt([a, m], r, 1)).toEqual([a, r])
    })
    it('cannot skip a level', () => {
      expect(openAt([], a, 1)).toEqual([])
    })
    it('keeps the stack when the panel is already at that level', () => {
      expect(openAt([a, m], a, 0)).toEqual([a, m])
      expect(openAt([a, m], m, 1)).toEqual([a, m])
    })
    it('tells an entity from a merchant with the same id', () => {
      const same: SubPanel = { kind: 'merchant', id: 'a' }
      expect(openAt([a], same, 0)).toEqual([same])
    })
    it('does not mutate its input', () => {
      const stack = [a]
      openAt(stack, m, 1)
      expect(stack).toEqual([a])
    })
  })

  describe('closeAt', () => {
    it('closing level 2 keeps level 1', () => {
      expect(closeAt([a, m], 2)).toEqual([a])
    })
    it('closing level 1 empties the stack', () => {
      expect(closeAt([a, m], 1)).toEqual([])
    })
    it('is a no-op for a level that is not open', () => {
      expect(closeAt([a], 2)).toEqual([a])
      expect(closeAt([], 1)).toEqual([])
    })
  })

  describe('columnMode', () => {
    it.each([
      [360, 1],
      [768, 1],
      [1024, 1],
      [1279, 1],
      [1280, 2],
      [1599, 2],
      [1600, 3],
      [2560, 3],
    ])('width %i is mode %i', (width, mode) => {
      expect(columnMode(width)).toBe(mode)
    })
  })

  describe('visibleLevels', () => {
    it.each([
      [0, 1, [0]],
      [1, 1, [1]],
      [2, 1, [2]],
      [0, 2, [0]],
      [1, 2, [0, 1]],
      [2, 2, [0, 2]],
      [0, 3, [0]],
      [1, 3, [0, 1]],
      [2, 3, [0, 1, 2]],
    ] as const)('%i open in mode %i shows %j', (length, mode, levels) => {
      expect(visibleLevels(length, mode)).toEqual(levels)
    })
  })

  describe('subColumns', () => {
    it('counts the levels above the dock', () => {
      expect(subColumns([0], 2)).toBe(0)
      expect(subColumns([0, 2], 2)).toBe(1)
      expect(subColumns([0, 1, 2], 3)).toBe(2)
    })
    it('is 0 when stacked', () => {
      expect(subColumns([0], 1)).toBe(0)
      expect(subColumns([1], 1)).toBe(0)
      expect(subColumns([2], 1)).toBe(0)
    })
  })

  describe('firstInvalidLevel', () => {
    const world = (
      over: Partial<{
        ids: string[]
        carriers: Record<string, string>
        merchants: Record<string, string>
      }> = {},
    ): SubPanelWorld => ({
      entityIds: new Set(over.ids ?? ['a', 'b', 'r']),
      carrierOf: (id) => over.carriers?.[id] ?? null,
      merchantCaravan: (id) => over.merchants?.[id] ?? null,
    })

    it('is null for an empty stack', () => {
      expect(firstInvalidLevel([], world())).toBeNull()
    })
    it('is null while everything holds', () => {
      expect(firstInvalidLevel([a], world())).toBeNull()
      expect(firstInvalidLevel([a, r], world({ carriers: { r: 'a' } }))).toBeNull()
      expect(firstInvalidLevel([a, m], world({ merchants: { m: 'a' } }))).toBeNull()
    })
    it('flags a removed level-1 entity', () => {
      expect(firstInvalidLevel([a], world({ ids: ['b'] }))).toBe(1)
      expect(firstInvalidLevel([a, m], world({ ids: [], merchants: { m: 'a' } }))).toBe(1)
    })
    it('flags a merchant at level 1', () => {
      expect(firstInvalidLevel([m], world({ merchants: { m: 'a' } }))).toBe(1)
    })
    it('flags a rider that left the level-1 carrier', () => {
      expect(firstInvalidLevel([a, r], world())).toBe(2)
      expect(firstInvalidLevel([a, r], world({ carriers: { r: 'b' } }))).toBe(2)
    })
    it('flags a merchant gone or of another caravan', () => {
      expect(firstInvalidLevel([a, m], world())).toBe(2)
      expect(firstInvalidLevel([a, m], world({ merchants: { m: 'b' } }))).toBe(2)
    })
  })

  describe('useSubPanels', () => {
    beforeEach(() => useSubPanels().clear())

    it('starts empty', () => {
      expect(useSubPanels().stack.value).toEqual([])
    })
    it('opens, replaces and closes through the shared stack', () => {
      const panels = useSubPanels()
      panels.open(a, 0)
      panels.open(m, 1)
      expect(useSubPanels().stack.value).toEqual([a, m])
      panels.close(2)
      expect(panels.stack.value).toEqual([a])
      panels.open(b, 0)
      expect(panels.stack.value).toEqual([b])
    })
    it('clear empties the stack', () => {
      const panels = useSubPanels()
      panels.open(a, 0)
      panels.clear()
      expect(panels.stack.value).toEqual([])
    })
  })
})
