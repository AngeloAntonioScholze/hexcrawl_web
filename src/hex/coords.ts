export interface Axial {
  q: number
  r: number
}

export interface Cube {
  q: number
  r: number
  s: number
}

export type HexKey = `${number},${number}`

export const toCube = (hex: Axial): Cube => ({ q: hex.q, r: hex.r, s: -hex.q - hex.r })

export const toAxial = (cube: Cube): Axial => ({ q: cube.q, r: cube.r })

export const hexKey = (hex: Axial): HexKey => `${hex.q},${hex.r}`

export function parseKey(key: HexKey): Axial {
  const comma = key.indexOf(',')
  return { q: Number(key.slice(0, comma)), r: Number(key.slice(comma + 1)) }
}

export const equals = (a: Axial, b: Axial): boolean => a.q === b.q && a.r === b.r

export const add = (a: Axial, b: Axial): Axial => ({ q: a.q + b.q, r: a.r + b.r })

export const subtract = (a: Axial, b: Axial): Axial => ({ q: a.q - b.q, r: a.r - b.r })

export const scale = (hex: Axial, factor: number): Axial => ({
  q: hex.q * factor,
  r: hex.r * factor,
})

export const DIRECTIONS: readonly Axial[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
]

export const DIAGONALS: readonly Axial[] = [
  { q: 2, r: -1 },
  { q: 1, r: -2 },
  { q: -1, r: -1 },
  { q: -2, r: 1 },
  { q: -1, r: 2 },
  { q: 1, r: 1 },
]

const wrapDirection = (direction: number): number => ((direction % 6) + 6) % 6

export const neighbor = (hex: Axial, direction: number): Axial =>
  add(hex, DIRECTIONS[wrapDirection(direction)])

export const neighbors = (hex: Axial): Axial[] => DIRECTIONS.map((d) => add(hex, d))

export const diagonalNeighbor = (hex: Axial, direction: number): Axial =>
  add(hex, DIAGONALS[wrapDirection(direction)])

export function distance(a: Axial, b: Axial): number {
  const dq = a.q - b.q
  const dr = a.r - b.r
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2
}

export function round(fractional: Axial): Axial {
  const { q, r, s } = toCube(fractional)
  let rq = Math.round(q)
  let rr = Math.round(r)
  const rs = Math.round(s)

  const dq = Math.abs(rq - q)
  const dr = Math.abs(rr - r)
  const ds = Math.abs(rs - s)

  if (dq > dr && dq > ds) rq = -rr - rs
  else if (dr > ds) rr = -rq - rs

  // Math.round of a small negative yields -0, which compares unequal to 0 under
  // Object.is and leaks into every hex derived from a world-space pick.
  return { q: rq + 0, r: rr + 0 }
}

export const lerp = (a: Axial, b: Axial, t: number): Axial => ({
  q: a.q + (b.q - a.q) * t,
  r: a.r + (b.r - a.r) * t,
})

// Nudged off exact hex boundaries so samples landing on an edge resolve
// consistently instead of flip-flopping between the two adjacent hexes.
const NUDGE = 1e-6

export function line(a: Axial, b: Axial): Axial[] {
  const steps = distance(a, b)
  if (steps === 0) return [{ q: a.q, r: a.r }]

  const from = { q: a.q + NUDGE, r: a.r + NUDGE }
  const to = { q: b.q + NUDGE, r: b.r + NUDGE }

  const result: Axial[] = []
  for (let i = 0; i <= steps; i++) {
    result.push(round(lerp(from, to, i / steps)))
  }
  return result
}

export function ring(center: Axial, radius: number): Axial[] {
  if (radius < 0) throw new RangeError(`ring radius must be >= 0, got ${radius}`)
  if (radius === 0) return [{ q: center.q, r: center.r }]

  const result: Axial[] = []
  let hex = add(center, scale(DIRECTIONS[4], radius))

  for (let direction = 0; direction < 6; direction++) {
    for (let step = 0; step < radius; step++) {
      result.push(hex)
      hex = neighbor(hex, direction)
    }
  }
  return result
}

export function spiral(center: Axial, radius: number): Axial[] {
  const result: Axial[] = [{ q: center.q, r: center.r }]
  for (let k = 1; k <= radius; k++) {
    result.push(...ring(center, k))
  }
  return result
}

// One step advances a hex to the position of the next entry in DIRECTIONS,
// so rotation and direction indices stay in the same order.
export function rotate(hex: Axial, center: Axial, steps: number): Axial {
  const wrapped = wrapDirection(steps)
  let vector = subtract(hex, center)

  for (let i = 0; i < wrapped; i++) {
    vector = { q: -(-vector.q - vector.r), r: -vector.q }
  }
  return add(center, vector)
}

export function range(center: Axial, radius: number): Axial[] {
  const result: Axial[] = []
  for (let q = -radius; q <= radius; q++) {
    const lo = Math.max(-radius, -q - radius)
    const hi = Math.min(radius, -q + radius)
    for (let r = lo; r <= hi; r++) {
      result.push({ q: center.q + q, r: center.r + r })
    }
  }
  return result
}
