import type { Entity } from '../entities/entity'

export const hexes = (count: number): string => `${count} ${count === 1 ? 'hex' : 'hexes'}`

export interface PlateFacts {
  dmView: boolean
  owner: Entity['owner']
  player: string | null
  /** The carrier's name while it rides in one. */
  riding: string | null
  ahead: number
}

/** The card's lower plate: who plays it (DM only), then what it is doing. */
export const plateLines = (facts: PlateFacts): string[] => {
  const doing = facts.riding
    ? `riding ${facts.riding}`
    : facts.ahead > 0
      ? `${hexes(facts.ahead)} to go`
      : 'standing'
  if (!facts.dmView) return [doing]
  const who = facts.owner === 'dm' ? 'dm' : facts.player ? `played by ${facts.player}` : 'no player'
  return [who, doing]
}
