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
