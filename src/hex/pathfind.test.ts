import { describe, expect, it } from 'vitest'
import { distance, hexKey, neighbors, range, type Axial, type HexKey } from './coords'
import { findPath } from './pathfind'

const hex = (q: number, r: number): Axial => ({ q, r })
const uniform = { cost: () => 1 }

describe('findPath', () => {
  it('returns the single hex when start is the goal', () => {
    const result = findPath(hex(2, -3), hex(2, -3), uniform)
    expect(result).toEqual({ path: [hex(2, -3)], cost: 0 })
  })

  it('walks a straight run at one cost per step', () => {
    const goal = hex(5, 0)
    const result = findPath(hex(0, 0), goal, uniform)!
    expect(result.cost).toBe(5)
    expect(result.path).toHaveLength(6)
    expect(result.path[0]).toEqual(hex(0, 0))
    expect(result.path[5]).toEqual(goal)
  })

  it('produces a connected path of single steps', () => {
    const result = findPath(hex(-4, 2), hex(3, -1), uniform)!
    for (let i = 1; i < result.path.length; i++) {
      expect(distance(result.path[i - 1], result.path[i])).toBe(1)
    }
  })

  it('matches hex distance on open ground', () => {
    for (const goal of [hex(7, -3), hex(-2, 6), hex(0, -9)]) {
      expect(findPath(hex(0, 0), goal, uniform)!.cost).toBe(distance(hex(0, 0), goal))
    }
  })

  it('detours around impassable hexes', () => {
    // A wall across q = 1 with one gap at r = 3.
    const blocked = (h: Axial): boolean => h.q === 1 && h.r !== 3
    const result = findPath(hex(0, 0), hex(3, 0), {
      cost: (_, to) => (blocked(to) ? null : 1),
    })!

    expect(result.path.some((h) => blocked(h))).toBe(false)
    expect(result.path.some((h) => h.q === 1 && h.r === 3)).toBe(true)
    expect(result.cost).toBeGreaterThan(distance(hex(0, 0), hex(3, 0)))
  })

  it('returns null when the goal is walled off', () => {
    const inside = new Set(range(hex(0, 0), 6).map(hexKey))
    const result = findPath(hex(0, 0), hex(4, 0), {
      cost: (_, to) => (to.q === 2 || !inside.has(hexKey(to)) ? null : 1),
    })
    expect(result).toBeNull()
  })

  // The grid is infinite, so an endless wall has no far side to search.
  it('gives up rather than searching an unbounded grid forever', () => {
    const result = findPath(hex(0, 0), hex(4, 0), {
      cost: (_, to) => (to.q === 2 ? null : 1),
      maxNodes: 2000,
    })
    expect(result).toBeNull()
  })

  it('prefers a longer cheap route over a short expensive one', () => {
    // Crossing r = 0 between the endpoints is expensive; going around is not.
    const result = findPath(hex(0, -2), hex(0, 2), {
      cost: (_, to) => (to.r === 0 && to.q === 0 ? 50 : 1),
    })!
    expect(result.path.some((h) => h.q === 0 && h.r === 0)).toBe(false)
    expect(result.cost).toBeLessThan(50)
  })

  it('honours maxCost', () => {
    expect(findPath(hex(0, 0), hex(9, 0), { ...uniform, maxCost: 4 })).toBeNull()
    expect(findPath(hex(0, 0), hex(3, 0), { ...uniform, maxCost: 4 })).not.toBeNull()
  })

  it('respects a restricted neighbour set', () => {
    const bounded = range(hex(0, 0), 3).map(hexKey)
    const inside = new Set<HexKey>(bounded)
    const result = findPath(hex(-3, 0), hex(3, 0), {
      cost: () => 1,
      neighborsOf: (h) => neighbors(h).filter((n) => inside.has(hexKey(n))),
    })!
    for (const step of result.path) expect(inside.has(hexKey(step))).toBe(true)
  })

  // A heuristic that overestimates would make A* return a cheap-looking but
  // suboptimal route, so its cost is checked against plain Dijkstra.
  it('finds the same cost as an unguided search on rough ground', () => {
    const roughness = (h: Axial): number => 1 + ((Math.abs(h.q * 7 + h.r * 13) % 5) as number)
    const cost = (_: Axial, to: Axial): number => roughness(to)

    for (const goal of [hex(6, -2), hex(-5, 3), hex(2, 7)]) {
      const guided = findPath(hex(0, 0), goal, {
        cost,
        heuristic: (from, to) => distance(from, to),
      })!
      const dijkstra = findPath(hex(0, 0), goal, { cost })!
      expect(guided.cost).toBe(dijkstra.cost)
    }
  })

  it('is deterministic', () => {
    const once = findPath(hex(-3, 1), hex(4, -2), uniform)!
    const twice = findPath(hex(-3, 1), hex(4, -2), uniform)!
    expect(once).toEqual(twice)
  })
})
