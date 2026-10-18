import type { EntityKind } from './entity'

/** The six scores a character is measured by. */
export interface Abilities {
  strength: number
  dexterity: number
  constitution: number
  intelligence: number
  wisdom: number
  charisma: number
}

export type Ability = keyof Abilities

/** In the order a character sheet lists them. */
export const ABILITIES: readonly Ability[] = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
]

export const ABILITY_LIMITS = { min: 1, max: 20 } as const

/** Nobody has been looked at closely yet: every score sits at the average. */
export const DEFAULT_ABILITY = 10

export const defaultAbilities = (): Abilities => ({
  strength: DEFAULT_ABILITY,
  dexterity: DEFAULT_ABILITY,
  constitution: DEFAULT_ABILITY,
  intelligence: DEFAULT_ABILITY,
  wisdom: DEFAULT_ABILITY,
  charisma: DEFAULT_ABILITY,
})

/** People have scores; a wagon train or a hull does not. */
export const hasAbilities = (kind: EntityKind): boolean => kind === 'party' || kind === 'npc'

export const isAbilityScore = (value: unknown): value is number =>
  Number.isInteger(value) &&
  (value as number) >= ABILITY_LIMITS.min &&
  (value as number) <= ABILITY_LIMITS.max

export const clampAbility = (value: number): number =>
  Number.isFinite(value)
    ? Math.min(ABILITY_LIMITS.max, Math.max(ABILITY_LIMITS.min, Math.round(value)))
    : DEFAULT_ABILITY

/** What a score adds to a roll: every two points past ten is one more. */
export const abilityModifier = (score: number): number => Math.floor((score - 10) / 2)
