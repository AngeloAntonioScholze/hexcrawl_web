import { readonly, ref, type Ref } from 'vue'

export type SubPanel = { kind: 'entity'; id: string } | { kind: 'merchant'; id: string }

// 1 = stacked, 2 = two-up, 3 = three-up: how many levels show side by side.
export type ColumnMode = 1 | 2 | 3

export interface SubPanelWorld {
  entityIds: Set<string>
  carrierOf: (id: string) => string | null
  merchantCaravan: (id: string) => string | null
}

export const columnMode = (width: number): ColumnMode => (width < 1280 ? 1 : width < 1600 ? 2 : 3)

// The dock plus as many of the deepest open levels as fit; stacked shows one level.
export const visibleLevels = (stackLength: number, mode: ColumnMode): number[] => {
  if (mode === 1) return [stackLength]
  if (mode === 3 || stackLength <= 1) return Array.from({ length: stackLength + 1 }, (_, i) => i)
  return [0, stackLength]
}

export const subColumns = (levels: number[], mode: ColumnMode): 0 | 1 | 2 =>
  mode === 1 ? 0 : (levels.filter((level) => level > 0).length as 0 | 1 | 2)

const same = (a: SubPanel, b: SubPanel): boolean => a.kind === b.kind && a.id === b.id

export const openAt = (
  stack: readonly SubPanel[],
  panel: SubPanel,
  parentLevel: 0 | 1,
): readonly SubPanel[] => {
  if (parentLevel > stack.length) return stack
  const current = stack[parentLevel]
  if (current !== undefined && same(current, panel)) return stack
  return [...stack.slice(0, parentLevel), panel]
}

export const closeAt = (stack: readonly SubPanel[], level: 1 | 2): readonly SubPanel[] =>
  stack.slice(0, level - 1)

export const firstInvalidLevel = (
  stack: readonly SubPanel[],
  world: SubPanelWorld,
): 1 | 2 | null => {
  const [first, second] = stack
  if (first === undefined) return null
  if (first.kind !== 'entity' || !world.entityIds.has(first.id)) return 1
  if (second === undefined) return null
  const parent =
    second.kind === 'entity' ? world.carrierOf(second.id) : world.merchantCaravan(second.id)
  return parent === first.id ? null : 2
}

export interface SubPanels {
  stack: Readonly<Ref<readonly SubPanel[]>>
  open: (panel: SubPanel, parentLevel: 0 | 1) => void
  close: (level: 1 | 2) => void
  clear: () => void
}

const stack = ref<readonly SubPanel[]>([])

/** The open sub-panels beside the dock. View state: never saved, never synced. */
export function useSubPanels(): SubPanels {
  return {
    stack: readonly(stack),
    open: (panel, parentLevel) => {
      stack.value = openAt(stack.value, panel, parentLevel)
    },
    close: (level) => {
      stack.value = closeAt(stack.value, level)
    },
    clear: () => {
      stack.value = []
    },
  }
}
