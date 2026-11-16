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
import bronzeFrame from '../assets/frames/bronze-frame.webp'
import bronzeWindow from '../assets/frames/bronze-window.png'
import crimsonFrame from '../assets/frames/crimson-frame.webp'
import crimsonWindow from '../assets/frames/crimson-window.png'
import steelFrame from '../assets/frames/steel-frame.webp'
import steelWindow from '../assets/frames/steel-window.png'
import type { Entity } from './entity'

export type FrameVariant = 'steel' | 'bronze' | 'crimson'

/** A region of the frame art, in % of the frame box. */
export interface FrameBox {
  left: number
  top: number
  width: number
  height: number
}

interface FrameArt {
  frame: string
  /** White on alpha: the exact shape of the art's portrait window. */
  window: string
  regions: {
    window: FrameBox
    pick: FrameBox
    banner: FrameBox
    slots: readonly [FrameBox, FrameBox, FrameBox]
    plate: FrameBox
  }
}

interface Bust {
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
 * Hidden DM entities are crimson (there is no hostile flag); carriers are the
 * company's wagons and hulls whoever drives them; everyone else wears the
 * colours of whoever gives them orders. The seat is left out on purpose: it
 * changes per session, and the frame should not.
 */
export const frameVariant = (entity: Pick<Entity, 'kind' | 'owner' | 'hidden'>): FrameVariant => {
  if (entity.hidden) return 'crimson'
  if (entity.kind === 'caravan' || entity.kind === 'ship') return 'bronze'
  return entity.owner === 'player' ? 'steel' : 'bronze'
}

const box = (left: number, top: number, width: number, height: number): FrameBox => ({
  left,
  top,
  width,
  height,
})

// Measured on the 340×438 crops by design/tools/card-frames.mjs; the three
// drawings differ, so each variant has its own map.
export const FRAME_ART: Readonly<Record<FrameVariant, FrameArt>> = {
  steel: {
    frame: steelFrame,
    window: steelWindow,
    regions: {
      window: box(16.18, 16.44, 67.65, 47.95),
      pick: box(16.18, 16.44, 67.65, 43.61),
      banner: box(16.47, 60.96, 31.47, 3.42),
      slots: [
        box(19.71, 67.12, 19.12, 3.42),
        box(40.59, 67.12, 19.12, 3.42),
        box(61.47, 67.12, 19.12, 3.42),
      ],
      plate: box(24.12, 72.37, 51.47, 11.42),
    },
  },
  bronze: {
    frame: bronzeFrame,
    window: bronzeWindow,
    regions: {
      window: box(18.53, 14.61, 63.24, 52.28),
      pick: box(18.53, 14.61, 63.24, 48.17),
      banner: box(18.82, 63.7, 29.41, 3.2),
      slots: [
        box(21.76, 69.41, 17.94, 3.42),
        box(41.18, 69.41, 18.24, 3.42),
        box(60.88, 69.41, 17.94, 3.42),
      ],
      plate: box(26.18, 74.43, 47.94, 10.73),
    },
  },
  crimson: {
    frame: crimsonFrame,
    window: crimsonWindow,
    regions: {
      window: box(15, 14.16, 70.29, 50.23),
      pick: box(15, 14.16, 70.29, 45.89),
      banner: box(15, 60.96, 32.94, 3.42),
      slots: [
        box(18.53, 67.35, 20, 3.65),
        box(40.29, 67.35, 20, 3.65),
        box(62.06, 67.35, 19.71, 3.65),
      ],
      plate: box(23.53, 72.83, 52.94, 11.87),
    },
  },
}
