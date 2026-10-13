/**
 * What laying the resources down costs on the huge world: once on a fresh
 * field, where the terrain of every hex that rolls a hit still has to be worked
 * out, and again on a field whose memo is already warm. Run with
 * `bun bench:resources`.
 */
import { range } from '../src/hex/coords'
import { createLayout } from '../src/hex/layout'
import { WORLD_SIZES } from '../src/stores/hexMap'
import { createTerrainField } from '../src/terrain/field'
import { scatterResources } from '../src/terrain/resourceGen'
import { DEFAULT_RESOURCE_SPACING, defaultResourceChances } from '../src/terrain/resources'

const RADIUS = WORLD_SIZES.huge
const RUNS = 10

const layout = createLayout(2)
const options = { chances: defaultResourceChances(), spacing: DEFAULT_RESOURCE_SPACING }
const freshField = () => createTerrainField(layout, { octaves: 4, radius: RADIUS })

const time = (label: string, run: (seed: number) => number): void => {
  const times: number[] = []
  let count = 0
  for (let seed = 0; seed < RUNS; seed++) {
    const started = performance.now()
    count = run(seed)
    times.push(performance.now() - started)
  }
  times.sort((a, b) => a - b)
  const median = times[Math.floor(times.length / 2)]
  const worst = times[times.length - 1]
  console.log(
    `  ${label.padEnd(24)} median ${median.toFixed(1).padStart(6)} ms, ` +
      `worst ${worst.toFixed(1).padStart(6)} ms, ${count} resources`,
  )
}

console.log(`radius ${RADIUS}, spacing ${options.spacing}, ${RUNS} seeds each`)

time('fresh field', (seed) => scatterResources(freshField(), { ...options, seed }).length)

const warm = freshField()
for (const hex of range({ q: 0, r: 0 }, RADIUS)) warm.at(hex)
time('warm field', (seed) => scatterResources(warm, { ...options, seed }).length)

time(
  'fresh field, spacing 0',
  (seed) => scatterResources(freshField(), { ...options, spacing: 0, seed }).length,
)
