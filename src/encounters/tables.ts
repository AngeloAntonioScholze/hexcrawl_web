import { mulberry32 } from '../terrain/perlin'
import type { TerrainId } from '../terrain/terrain'
import type { Phase } from '../time/clock'

export type EncounterWhen = 'any' | Phase

export const ENCOUNTER_WHENS: readonly EncounterWhen[] = ['any', 'day', 'night']

/** One line of an encounter table: how likely it is, against the rest of its table. */
export interface EncounterEntry {
  /** Defaults read `terrain.slug`; the DM's own entries get a fresh id. */
  id: string
  terrain: TerrainId
  when: EncounterWhen
  weight: number
  title: string
  description: string
}

export type EncounterChange = Partial<Omit<EncounterEntry, 'id'>>

/**
 * What the DM made of the tables. Only the difference is stored, so a default
 * reworded in a later version still reaches every map that never touched it.
 */
export type EncounterOverride =
  | { kind: 'change'; id: string; change: EncounterChange }
  | { kind: 'remove'; id: string }
  | { kind: 'add'; entry: EncounterEntry }

const entry = (
  terrain: TerrainId,
  slug: string,
  when: EncounterWhen,
  weight: number,
  title: string,
  description: string,
): EncounterEntry => ({ id: `${terrain}.${slug}`, terrain, when, weight, title, description })

// A table reads better one line to an entry than wrapped six lines deep.
// prettier-ignore
export const DEFAULT_ENCOUNTERS: readonly EncounterEntry[] = [
  entry('grass', 'quiet', 'any', 12, 'Quiet travel', 'Wind in the long grass and nothing else for miles.'),
  entry('grass', 'herd', 'day', 3, 'Grazing herd', 'Wild aurochs cross the way; spooking them would start a stampede.'),
  entry('grass', 'pilgrims', 'day', 2, 'Pilgrims', 'Footsore pilgrims bound for a distant shrine trade news of the road for bread.'),
  entry('grass', 'patrol', 'day', 2, 'Mounted patrol', "Riders in a lord's colours ride up and demand to know the party's business."),
  entry('grass', 'bandits', 'any', 2, 'Bandits', 'Highwaymen lying low in a dry gully spring an ambush.'),
  entry('grass', 'wolves', 'night', 3, 'Wolf pack', 'Eyes glint at the edge of the firelight as a pack circles the camp.'),
  entry('grass', 'storm', 'any', 2, 'Thunderstorm', 'A storm rolls over the open plain and there is nowhere to shelter.'),
  entry('grass', 'standing-stone', 'any', 1, 'Standing stone', 'A lone menhir carved with weathered runes hums faintly to the touch.'),
  entry('grass', 'wisps', 'night', 1, "Will-o'-wisps", 'Pale lights bob across the meadow, beckoning travellers off the path.'),

  entry('forest', 'quiet', 'any', 12, 'Deep quiet', 'Birdsong, dripping leaves, and the creak of old boughs.'),
  entry('forest', 'wolves', 'any', 3, 'Wolves', 'A hungry pack shadows the party between the trunks, waiting for a straggler.'),
  entry('forest', 'woodcutters', 'day', 2, 'Woodcutters', 'Axes ring out from a clearing; the woodcutters know the safe trails and fear something deeper in.'),
  entry('forest', 'hunters', 'day', 2, 'Hunting party', 'Elven hunters watch from the branches and ask why the party walks their wood.'),
  entry('forest', 'spiders', 'night', 2, 'Giant spiders', 'Webs as thick as rope span the trail, and something large is tugging at them.'),
  entry('forest', 'owlbear', 'any', 1, 'Owlbear', 'A shriek and the crash of undergrowth: an owlbear defends its den.'),
  entry('forest', 'lost', 'any', 2, 'Lost the trail', 'Tangled undergrowth swallows the path; finding it again costs hours.'),
  entry('forest', 'fairy-ring', 'night', 1, 'Fairy ring', 'A ring of pale mushrooms glows softly, and faint music plays within it.'),
  entry('forest', 'shrine', 'any', 1, 'Overgrown shrine', 'Moss-covered statues of a forgotten god, with fresh offerings at their feet.'),

  entry('sand', 'quiet', 'any', 12, 'Shifting sands', 'Heat shimmer and the hiss of sand; nothing stirs.'),
  entry('sand', 'sandstorm', 'any', 3, 'Sandstorm', 'A brown wall of wind and grit swallows the horizon and buries the trail.'),
  entry('sand', 'nomads', 'day', 2, 'Nomad caravan', 'Camel riders under bright awnings offer water at a steep price.'),
  entry('sand', 'mirage', 'day', 2, 'Mirage', 'An oasis glitters ahead and recedes with every step taken toward it.'),
  entry('sand', 'vultures', 'day', 2, 'Circling vultures', 'Vultures wheel over a dying traveller who clutches a sealed letter.'),
  entry('sand', 'scorpion', 'night', 2, 'Giant scorpion', 'A scorpion the size of a cart bursts out of the cooling sand.'),
  entry('sand', 'ghouls', 'night', 1, 'Ghouls', 'Hunched figures dig among old graves in the dunes and turn toward the light.'),
  entry('sand', 'wreck', 'any', 1, 'Washed-up wreck', 'The ribs of a ship lie half buried in the sand, its hold not quite empty.'),
  entry('sand', 'buried-ruin', 'any', 1, 'Buried ruin', 'The wind has uncovered the top of a domed tomb, its seal still intact.'),

  entry('mountains', 'quiet', 'any', 10, 'Thin air', 'A hard climb under a wide sky, and no one else on the mountain.'),
  entry('mountains', 'rockslide', 'any', 2, 'Rockslide', 'Loose scree gives way above the path and comes thundering down.'),
  entry('mountains', 'goats', 'day', 2, 'Mountain goats', 'Sure-footed goats pick a way along the cliffs; following them finds a hidden pass.'),
  entry('mountains', 'prospectors', 'day', 2, 'Dwarven prospectors', 'Dwarves with picks and mules, suspicious of anyone near their claim.'),
  entry('mountains', 'orcs', 'any', 2, 'Orc warband', 'War drums echo off the rock as an orc warband marches through the pass.'),
  entry('mountains', 'cave', 'any', 2, 'Cave mouth', 'A dry cave offers shelter, though the bones by the entrance are recent.'),
  entry('mountains', 'eagles', 'day', 1, 'Giant eagles', 'Great eagles circle overhead, watching the party with unsettling intelligence.'),
  entry('mountains', 'cold', 'night', 2, 'Bitter cold', 'The temperature plunges after dark; without a fire, frostbite sets in.'),
  entry('mountains', 'troll', 'night', 1, 'Cave troll', 'A troll lumbers out of the dark, drawn by the smell of cooking meat.'),

  entry('peaks', 'quiet', 'any', 10, 'Wind and ice', 'Only the howl of the wind across bare rock and snow.'),
  entry('peaks', 'blizzard', 'any', 3, 'Blizzard', 'Snow comes in sideways; the party can barely see one another.'),
  entry('peaks', 'avalanche', 'any', 2, 'Avalanche', 'A crack like thunder, and the snowfield above begins to slide.'),
  entry('peaks', 'frozen-climber', 'any', 2, 'Frozen climber', 'A climber frozen in the ice, still clutching a map of the summit.'),
  entry('peaks', 'hermit', 'day', 1, 'Hermit monk', 'A monk meditating in a tiny stone hut offers tea and a cryptic warning.'),
  entry('peaks', 'wyvern', 'day', 1, 'Wyvern', 'A wyvern drops from its eyrie, stinger raised.'),
  entry('peaks', 'yeti', 'any', 1, 'Yeti', 'Huge footprints in fresh snow, and a roar from the white haze.'),
  entry('peaks', 'frost-giant', 'any', 1, 'Frost giant', 'A frost giant hunting mammoth regards the party as smaller game.'),
  entry('peaks', 'aurora', 'night', 1, 'Strange aurora', 'Green and violet lights ripple overhead and form, briefly, the shape of an eye.'),

  entry('water', 'calm', 'any', 12, 'Calm water', 'Gentle swell and a steady breeze.'),
  entry('water', 'fishing-boats', 'day', 3, 'Fishing boats', 'Fishers hauling their nets wave the party over to trade a catch for news.'),
  entry('water', 'squall', 'any', 3, 'Squall', 'A sudden squall tears at the sail and drives the boat off course.'),
  entry('water', 'fog', 'any', 2, 'Fog bank', 'A thick fog rolls in; somewhere close, oars creak.'),
  entry('water', 'shoals', 'any', 2, 'Hidden shoals', 'Rocks lurk just beneath the surface; the hull scrapes and groans.'),
  entry('water', 'pirates', 'day', 2, 'Pirate sloop', 'A fast sloop flying no colours closes in from the shore side.'),
  entry('water', 'merfolk', 'any', 1, 'Merfolk', 'Merfolk surface beside the boat, curious, with a favour to ask.'),
  entry('water', 'drowned-lights', 'night', 1, 'Drowned lights', 'Lanterns glow beneath the water where a village once stood.'),

  entry('deepWater', 'calm', 'any', 12, 'Open sea', 'Endless grey-blue water from horizon to horizon.'),
  entry('deepWater', 'storm', 'any', 3, 'Ocean storm', 'Mountainous waves and screaming wind; the ship fights to stay afloat.'),
  entry('deepWater', 'becalmed', 'day', 2, 'Becalmed', 'The wind dies completely; the sails hang limp and the water casks run low.'),
  entry('deepWater', 'whales', 'day', 2, 'Whale pod', 'A pod of whales breaches alongside, close enough to rock the ship.'),
  entry('deepWater', 'merchantman', 'day', 2, 'Merchant galley', 'A heavily laden galley hails the party, wary of pirates.'),
  entry('deepWater', 'flotsam', 'any', 2, 'Flotsam', 'Wreckage drifts past with a lone survivor clinging to a spar.'),
  entry('deepWater', 'serpent', 'any', 1, 'Sea serpent', 'A long scaled back rises from the water and circles the ship.'),
  entry('deepWater', 'ghost-ship', 'night', 1, 'Ghost ship', 'A ship with tattered sails glides past against the wind, its deck lit by cold fire.'),
  entry('deepWater', 'kraken', 'night', 1, 'Kraken', 'Tentacles thick as masts slide up over the rail in the dark.'),
]

/** What a terrain's table holds at one phase of the day. */
export const tableFor = (
  terrain: TerrainId,
  phase: Phase,
  entries: readonly EncounterEntry[],
): EncounterEntry[] =>
  entries.filter((one) => one.terrain === terrain && (one.when === 'any' || one.when === phase))

/** A weighted pick; the same seed always draws the same line. */
export function rollEncounter(
  entries: readonly EncounterEntry[],
  random: (() => number) | number,
): EncounterEntry | null {
  const draw = typeof random === 'number' ? mulberry32(random) : random
  const live = entries.filter((one) => one.weight > 0)
  const total = live.reduce((sum, one) => sum + one.weight, 0)
  if (total <= 0) return null

  let left = draw() * total
  for (const one of live) {
    left -= one.weight
    if (left < 0) return one
  }
  return live[live.length - 1]
}

/** A line drawn for a hex, with the odds it had against the rest of its table. */
export interface EncounterRoll {
  entry: EncounterEntry
  /** Out of the table's whole weight: the line came up `weight` in `total`. */
  total: number
}

export function rollFor(
  terrain: TerrainId,
  phase: Phase,
  entries: readonly EncounterEntry[],
  random: () => number,
): EncounterRoll | null {
  const table = tableFor(terrain, phase, entries)
  const entry = rollEncounter(table, random)
  if (!entry) return null
  const total = table.reduce((sum, one) => sum + Math.max(0, one.weight), 0)
  return { entry, total }
}

/** The defaults with the DM's changes laid over them, then the DM's own lines. */
export function mergeTables(
  defaults: readonly EncounterEntry[],
  overrides: readonly EncounterOverride[],
): EncounterEntry[] {
  const changes = new Map<string, EncounterChange>()
  const removed = new Set<string>()
  const added: EncounterEntry[] = []
  for (const one of overrides) {
    if (one.kind === 'change') changes.set(one.id, one.change)
    else if (one.kind === 'remove') removed.add(one.id)
    else added.push(one.entry)
  }

  return [
    ...defaults
      .filter((one) => !removed.has(one.id))
      .map((one) => ({ ...one, ...changes.get(one.id) })),
    ...added,
  ]
}

const idOf = (override: EncounterOverride): string =>
  override.kind === 'add' ? override.entry.id : override.id

const without = (overrides: readonly EncounterOverride[], id: string): EncounterOverride[] =>
  overrides.filter((one) => idOf(one) !== id)

/**
 * Lays a change over an entry. Fields put back to the default are dropped, so
 * an entry edited back to where it started carries no override at all.
 */
export function changeEncounter(
  defaults: readonly EncounterEntry[],
  overrides: readonly EncounterOverride[],
  id: string,
  change: EncounterChange,
): EncounterOverride[] {
  const added = overrides.find((one) => one.kind === 'add' && one.entry.id === id)
  if (added?.kind === 'add') {
    return overrides.map((one) =>
      one === added ? { kind: 'add', entry: { ...added.entry, ...change } } : one,
    )
  }

  const base = defaults.find((one) => one.id === id)
  if (!base) return [...overrides]

  const earlier = overrides.find((one) => one.kind === 'change' && one.id === id)
  const merged: EncounterChange = {
    ...(earlier?.kind === 'change' ? earlier.change : {}),
    ...change,
  }
  const differs = Object.fromEntries(
    Object.entries(merged).filter(([key, value]) => base[key as keyof EncounterChange] !== value),
  ) as EncounterChange

  const rest = without(overrides, id)
  return Object.keys(differs).length > 0 ? [...rest, { kind: 'change', id, change: differs }] : rest
}

/** A default is struck off by an override; the DM's own line simply goes. */
export function removeEncounter(
  defaults: readonly EncounterEntry[],
  overrides: readonly EncounterOverride[],
  id: string,
): EncounterOverride[] {
  const rest = without(overrides, id)
  return defaults.some((one) => one.id === id) ? [...rest, { kind: 'remove', id }] : rest
}

/** Puts one default line back as it shipped. */
export const restoreEncounter = (
  overrides: readonly EncounterOverride[],
  id: string,
): EncounterOverride[] => overrides.filter((one) => one.kind === 'add' || one.id !== id)

/** Clears every override touching one terrain, the DM's own lines on it included. */
export function resetTerrain(
  defaults: readonly EncounterEntry[],
  overrides: readonly EncounterOverride[],
  terrain: TerrainId,
): EncounterOverride[] {
  const native = new Set(defaults.filter((one) => one.terrain === terrain).map((one) => one.id))
  return overrides.filter((one) => {
    if (one.kind === 'add') return one.entry.terrain !== terrain
    if (native.has(one.id)) return false
    return one.kind !== 'change' || one.change.terrain !== terrain
  })
}
