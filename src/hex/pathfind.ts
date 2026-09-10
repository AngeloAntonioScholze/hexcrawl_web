import { hexKey, neighbors, type Axial, type HexKey } from './coords'

export interface PathResult {
  path: Axial[]
  cost: number
}

export interface PathOptions {
  /** Cost of stepping between two adjacent hexes, or null when impassable. */
  cost(from: Axial, to: Axial): number | null
  /** Must never overestimate the remaining cost, or the route stops being optimal. */
  heuristic?(from: Axial, goal: Axial): number
  neighborsOf?(hex: Axial): Axial[]
  /** Abandons the search once the cheapest route exceeds this. */
  maxCost?: number
  /**
   * Safety net for unbounded neighbour functions: the hex grid is infinite, so
   * an unreachable goal behind an endless wall would otherwise search forever.
   * Callers that return null off-map are already bounded by their own map.
   */
  maxNodes?: number
}

interface Node {
  key: HexKey
  hex: Axial
  priority: number
}

// A pairing of cost and hex ordered by priority; a plain sorted array turns the
// open set into the bottleneck once maps reach a few thousand tiles.
class MinHeap {
  private items: Node[] = []

  get size(): number {
    return this.items.length
  }

  push(node: Node): void {
    this.items.push(node)
    let index = this.items.length - 1
    while (index > 0) {
      const parent = (index - 1) >> 1
      if (this.items[parent].priority <= this.items[index].priority) break
      ;[this.items[parent], this.items[index]] = [this.items[index], this.items[parent]]
      index = parent
    }
  }

  pop(): Node | undefined {
    const top = this.items[0]
    const last = this.items.pop()
    if (last !== undefined && this.items.length > 0) {
      this.items[0] = last
      let index = 0
      for (;;) {
        const left = index * 2 + 1
        const right = left + 1
        let smallest = index
        if (left < this.items.length && this.items[left].priority < this.items[smallest].priority) {
          smallest = left
        }
        if (
          right < this.items.length &&
          this.items[right].priority < this.items[smallest].priority
        ) {
          smallest = right
        }
        if (smallest === index) break
        ;[this.items[smallest], this.items[index]] = [this.items[index], this.items[smallest]]
        index = smallest
      }
    }
    return top
  }
}

export function findPath(start: Axial, goal: Axial, options: PathOptions): PathResult | null {
  const step = options.neighborsOf ?? neighbors
  const heuristic = options.heuristic ?? (() => 0)
  const maxCost = options.maxCost ?? Infinity
  const maxNodes = options.maxNodes ?? 200_000

  const startKey = hexKey(start)
  const goalKey = hexKey(goal)

  if (startKey === goalKey) return { path: [{ q: start.q, r: start.r }], cost: 0 }

  const cameFrom = new Map<HexKey, HexKey>()
  const hexes = new Map<HexKey, Axial>([[startKey, start]])
  const bestCost = new Map<HexKey, number>([[startKey, 0]])
  const settled = new Set<HexKey>()

  const open = new MinHeap()
  open.push({ key: startKey, hex: start, priority: heuristic(start, goal) })

  while (open.size > 0) {
    const current = open.pop()!
    if (settled.has(current.key)) continue
    settled.add(current.key)
    if (settled.size > maxNodes) return null

    const costSoFar = bestCost.get(current.key)!

    if (current.key === goalKey) {
      const path: Axial[] = []
      let key: HexKey | undefined = goalKey
      while (key !== undefined) {
        path.push(hexes.get(key)!)
        key = cameFrom.get(key)
      }
      return { path: path.reverse(), cost: costSoFar }
    }

    for (const next of step(current.hex)) {
      const stepCost = options.cost(current.hex, next)
      if (stepCost === null) continue

      const nextKey = hexKey(next)
      if (settled.has(nextKey)) continue

      const total = costSoFar + stepCost
      if (total > maxCost) continue

      const known = bestCost.get(nextKey)
      if (known !== undefined && known <= total) continue

      bestCost.set(nextKey, total)
      cameFrom.set(nextKey, current.key)
      hexes.set(nextKey, next)
      open.push({ key: nextKey, hex: next, priority: total + heuristic(next, goal) })
    }
  }

  return null
}
