import coastRoad from '../assets/portraits/caravan-coast-road.svg'
import desertDawn from '../assets/portraits/caravan-desert-dawn.svg'
import duskRoad from '../assets/portraits/caravan-dusk-road.svg'
import forestTrack from '../assets/portraits/caravan-forest-track.svg'
import nightCamp from '../assets/portraits/caravan-night-camp.svg'
import winterPass from '../assets/portraits/caravan-winter-pass.svg'
import alchemist from '../assets/professions/alchemist.svg'
import apothecary from '../assets/professions/apothecary.svg'
import cartographer from '../assets/professions/cartographer.svg'
import cook from '../assets/professions/cook.svg'
import curio from '../assets/professions/curio.svg'
import doctor from '../assets/professions/doctor.svg'
import enchanter from '../assets/professions/enchanter.svg'
import herbalist from '../assets/professions/herbalist.svg'
import hunter from '../assets/professions/hunter.svg'
import leatherworker from '../assets/professions/leatherworker.svg'
import mage from '../assets/professions/mage.svg'
import priest from '../assets/professions/priest.svg'
import smith from '../assets/professions/smith.svg'
import stablemaster from '../assets/professions/stablemaster.svg'
import woodworker from '../assets/professions/woodworker.svg'
import type { MerchantType } from './merchant'

export interface Portrait {
  /** What a caravan stores and a map file carries; never reused for other art. */
  id: string
  label: string
  url: string
}

// Placeholder art. Real paintings replace the files under the same names, so
// the ids saved in maps keep pointing at the right picture.
export const CARAVAN_PORTRAITS: readonly Portrait[] = [
  { id: 'dusk-road', label: 'Dusk road', url: duskRoad },
  { id: 'desert-dawn', label: 'Desert dawn', url: desertDawn },
  { id: 'forest-track', label: 'Forest track', url: forestTrack },
  { id: 'winter-pass', label: 'Winter pass', url: winterPass },
  { id: 'night-camp', label: 'Night camp', url: nightCamp },
  { id: 'coast-road', label: 'Coast road', url: coastRoad },
]

/**
 * The bundled portrait an id names. A map can name one this build no longer
 * ships, and that caravan simply goes without a picture.
 */
export const caravanPortrait = (id: string | undefined): Portrait | undefined =>
  CARAVAN_PORTRAITS.find((one) => one.id === id)

export const PROFESSION_ICONS: Readonly<Record<MerchantType, string>> = {
  smith,
  woodworker,
  hunter,
  apothecary,
  doctor,
  leatherworker,
  cook,
  cartographer,
  herbalist,
  alchemist,
  enchanter,
  stablemaster,
  curio,
  priest,
  mage,
}
