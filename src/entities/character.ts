import type { EntityKind } from './entity'

/**
 * What a party or an npc has to its own name: the coin in its purse and how
 * seasoned it is. Map-level data like an item: the clock never rewinds it, only
 * a hand edit changes it. The caravan's gold is the company's, not anybody's purse.
 */
export interface Character {
  /** Whole coins, never below none. */
  purse: number
  /** A whole number from 1 to 20. */
  level: number
}

/** Who keeps their own purse and level; the stores a caravan or a ship carries are the company's. */
export type CharacterKind = Extract<EntityKind, 'party' | 'npc'>

/**
 * Every hand edit to a character, entity by entity. An entity missing from it
 * stands at the defaults, so a new party or an old save needs no entry.
 */
export type CharacterSheet = ReadonlyMap<string, Character>

export const PURSE_LIMITS = { min: 0, max: 999999 } as const
export const CHARACTER_LEVELS = { min: 1, max: 20 } as const

export const DEFAULT_CHARACTER: Readonly<Character> = { purse: 0, level: 1 }

export const hasCharacter = (kind: EntityKind): kind is CharacterKind =>
  kind === 'party' || kind === 'npc'

const clampWhole = (value: number, { min, max }: { min: number; max: number }): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : min

export const clampPurse = (value: number): number => clampWhole(value, PURSE_LIMITS)

export const clampCharacterLevel = (value: number): number => clampWhole(value, CHARACTER_LEVELS)

export const characterIn = (sheet: CharacterSheet, id: string): Character =>
  sheet.get(id) ?? DEFAULT_CHARACTER

/** The sheet with one entity's character changed, clamped; the same sheet when nothing changes. */
export function editCharacter(
  sheet: CharacterSheet,
  id: string,
  change: Partial<Character>,
): CharacterSheet {
  const was = characterIn(sheet, id)
  const next: Character = {
    purse: change.purse === undefined ? was.purse : clampPurse(change.purse),
    level: change.level === undefined ? was.level : clampCharacterLevel(change.level),
  }
  if (next.purse === was.purse && next.level === was.level) return sheet
  const edited = new Map(sheet)
  edited.set(id, next)
  return edited
}
