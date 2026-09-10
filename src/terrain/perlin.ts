export type Noise2D = (x: number, y: number) => number

export interface FbmOptions {
  octaves?: number
  lacunarity?: number
  persistence?: number
}

const mulberry32 = (seed: number): (() => number) => {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10)

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

// Eight unit gradients: enough directional variety for 2D without the axis
// clumping a smaller set produces.
const GRADIENTS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [Math.SQRT1_2, Math.SQRT1_2],
  [-Math.SQRT1_2, Math.SQRT1_2],
  [Math.SQRT1_2, -Math.SQRT1_2],
  [-Math.SQRT1_2, -Math.SQRT1_2],
]

// Unit-gradient 2D Perlin peaks near 1/sqrt(2), so the raw value is scaled to
// span roughly [-1, 1].
const AMPLITUDE = Math.SQRT2

export function createPerlin(seed: number): Noise2D {
  const permutation = new Uint8Array(256)
  for (let i = 0; i < 256; i++) permutation[i] = i

  const random = mulberry32(seed)
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const swap = permutation[i]
    permutation[i] = permutation[j]
    permutation[j] = swap
  }

  const perm = new Uint8Array(512)
  for (let i = 0; i < 512; i++) perm[i] = permutation[i & 255]

  const dot = (hash: number, x: number, y: number): number => {
    const gradient = GRADIENTS[hash & 7]
    return gradient[0] * x + gradient[1] * y
  }

  return (x: number, y: number): number => {
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const xf = x - xi
    const yf = y - yi

    const cx = xi & 255
    const cy = yi & 255

    const topLeft = perm[perm[cx] + cy]
    const topRight = perm[perm[(cx + 1) & 255] + cy]
    const bottomLeft = perm[perm[cx] + ((cy + 1) & 255)]
    const bottomRight = perm[perm[(cx + 1) & 255] + ((cy + 1) & 255)]

    const u = fade(xf)
    const v = fade(yf)

    const top = lerp(dot(topLeft, xf, yf), dot(topRight, xf - 1, yf), u)
    const bottom = lerp(dot(bottomLeft, xf, yf - 1), dot(bottomRight, xf - 1, yf - 1), u)

    return lerp(top, bottom, v) * AMPLITUDE
  }
}

// Fractal Brownian motion: octaves of the same noise at doubling frequency and
// halving amplitude, which is what turns smooth blobs into coastlines.
export function createFbm(seed: number, options: FbmOptions = {}): Noise2D {
  const octaves = Math.max(1, options.octaves ?? 4)
  const lacunarity = options.lacunarity ?? 2
  const persistence = options.persistence ?? 0.5

  const layers = Array.from({ length: octaves }, (_, i) => createPerlin(seed + i * 1013))

  let total = 0
  let amplitude = 1
  for (let i = 0; i < octaves; i++) {
    total += amplitude
    amplitude *= persistence
  }
  const normalise = 1 / total

  return (x: number, y: number): number => {
    let sum = 0
    let frequency = 1
    let weight = 1

    for (const layer of layers) {
      sum += layer(x * frequency, y * frequency) * weight
      frequency *= lacunarity
      weight *= persistence
    }

    return sum * normalise
  }
}
