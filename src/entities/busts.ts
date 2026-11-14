import bard from '../assets/busts/bard.svg'
import brute from '../assets/busts/brute.svg'
import captain from '../assets/busts/captain.svg'
import cleric from '../assets/busts/cleric.svg'
import crone from '../assets/busts/crone.svg'
import dwarf from '../assets/busts/dwarf.svg'
import elf from '../assets/busts/elf.svg'
import knight from '../assets/busts/knight.svg'
import merchant from '../assets/busts/merchant.svg'
import ranger from '../assets/busts/ranger.svg'
import rogue from '../assets/busts/rogue.svg'
import ship from '../assets/busts/ship.svg'
import wagon from '../assets/busts/wagon.svg'
import wizard from '../assets/busts/wizard.svg'
import bronzeCrest from '../assets/frames/bronze-crest.svg'
import bronzeFoot from '../assets/frames/bronze-foot.svg'
import bronzeFrame from '../assets/frames/bronze-frame.svg'
import crimsonCrest from '../assets/frames/crimson-crest.svg'
import crimsonFoot from '../assets/frames/crimson-foot.svg'
import crimsonFrame from '../assets/frames/crimson-frame.svg'
import steelCrest from '../assets/frames/steel-crest.svg'
import steelFoot from '../assets/frames/steel-foot.svg'
import steelFrame from '../assets/frames/steel-frame.svg'
import type { Entity } from './entity'

export type FrameVariant = 'steel' | 'bronze' | 'crimson'

export interface Bust {
  /** What an entity stores and a map file carries; never reused for other art. */
  id: string
  label: string
  url: string
}

// Placeholder art. Real art replaces the files under the same names, so the
// ids saved in maps keep pointing at the right figure.
export const BUSTS: readonly Bust[] = [
  { id: 'knight', label: 'Knight', url: knight },
  { id: 'ranger', label: 'Ranger', url: ranger },
  { id: 'rogue', label: 'Rogue', url: rogue },
  { id: 'wizard', label: 'Wizard', url: wizard },
  { id: 'cleric', label: 'Cleric', url: cleric },
  { id: 'bard', label: 'Bard', url: bard },
  { id: 'dwarf', label: 'Dwarf', url: dwarf },
  { id: 'elf', label: 'Elf', url: elf },
  { id: 'crone', label: 'Crone', url: crone },
  { id: 'brute', label: 'Brute', url: brute },
  { id: 'merchant', label: 'Merchant', url: merchant },
  { id: 'captain', label: 'Captain', url: captain },
  { id: 'wagon', label: 'Wagon', url: wagon },
  { id: 'ship', label: 'Ship', url: ship },
]

/**
 * The bundled bust an id names. A map can name one this build no longer ships
 * (an old scenic portrait, say), and that entity simply goes without a figure.
 */
export const bustOf = (id: string | undefined): Bust | undefined =>
  BUSTS.find((one) => one.id === id)

/**
 * Carriers are the company's wagons and hulls whoever drives them; everyone
 * else wears the colours of whoever gives them orders. The seat is left out on
 * purpose: it changes per session, and the frame should not.
 */
export const frameVariant = (entity: Pick<Entity, 'kind' | 'owner'>): FrameVariant => {
  if (entity.kind === 'caravan' || entity.kind === 'ship') return 'bronze'
  return entity.owner === 'player' ? 'steel' : 'crimson'
}

export const FRAME_ART: Readonly<
  Record<FrameVariant, { frame: string; crest: string; foot: string }>
> = {
  steel: { frame: steelFrame, crest: steelCrest, foot: steelFoot },
  bronze: { frame: bronzeFrame, crest: bronzeCrest, foot: bronzeFoot },
  crimson: { frame: crimsonFrame, crest: crimsonCrest, foot: crimsonFoot },
}
