import type { Entity } from '../entities/entity'

/**
 * Who is asking. A player is anyone at the table today; `playerId` is room for
 * the day entities belong to one player rather than to the players as a whole.
 */
export type Viewer = { role: 'dm' } | { role: 'player'; playerId?: string }

export const DM: Viewer = { role: 'dm' }
export const PLAYER: Viewer = { role: 'player' }

export type Action =
  | 'order'
  | 'place'
  | 'renameEntity'
  | 'recolorEntity'
  | 'editInventory'
  | 'transferItem'
  | 'abilities'
  | 'addEntity'
  | 'removeEntity'
  | 'entitySettings'
  | 'clock'
  | 'supplies'
  | 'merchants'
  | 'fog'
  | 'terrain'
  | 'roads'
  | 'mapTools'
  | 'resources'
  | 'notes'
  | 'locations'
  | 'events'
  | 'encounters'
  | 'maps'
  | 'clearHistory'
  | 'undo'

export type EntityRef = Pick<Entity, 'owner' | 'hidden'>

/** An item changing hands: the entity giving it and the one taking it. */
export interface Transfer {
  from: EntityRef
  to: EntityRef
}

export type Target = EntityRef | Transfer

// Today every player owns every player entity; with player ids this is where
// one player's party stops being another's.
const owns = (viewer: Viewer, entity: EntityRef): boolean =>
  viewer.role === 'dm' || entity.owner === 'player'

const isTransfer = (target: Target): target is Transfer => 'from' in target

const ownsTarget = (viewer: Viewer, target: Target | undefined): boolean =>
  target !== undefined && !isTransfer(target) && owns(viewer, target)

/**
 * A player hands things across only from or to an entity of their own, and
 * never into or out of one the DM keeps off their map.
 */
const mayTransfer = (viewer: Viewer, target: Target | undefined): boolean => {
  if (target === undefined || !isTransfer(target)) return false
  const { from, to } = target
  const reachable = (one: EntityRef): boolean => owns(viewer, one) || !one.hidden
  return (owns(viewer, from) || owns(viewer, to)) && reachable(from) && reachable(to)
}

/** What a player may do; every action missing here is the DM's alone. */
const PLAYER_RULES: Partial<Record<Action, (viewer: Viewer, target?: Target) => boolean>> = {
  order: ownsTarget,
  place: ownsTarget,
  renameEntity: ownsTarget,
  recolorEntity: ownsTarget,
  editInventory: ownsTarget,
  transferItem: mayTransfer,
  abilities: ownsTarget,
}

/**
 * Whether the viewer may do the action, to the target when it has one. A rule
 * that needs a target is refused without one, since ownership cannot be read
 * off nothing.
 */
export function allowed(viewer: Viewer, action: Action, target?: Target): boolean {
  if (viewer.role === 'dm') return true
  return PLAYER_RULES[action]?.(viewer, target) ?? false
}

/**
 * The rule behind each of the map store's functions that changes something.
 * Entity actions are judged against the entity they name, or the selected one
 * for those that take none (select, click, clear, removeWaypoint);
 * an item's entity is the one holding it. A select that puts an entity down
 * for the first time is judged as 'place' rather than 'order'.
 */
export const HEX_MAP_RULES = {
  queueAction: 'order',
  place: 'place',
  select: 'order',
  click: 'order',
  clear: 'order',
  removeWaypoint: 'order',
  renameEntity: 'renameEntity',
  recolorEntity: 'recolorEntity',
  addItem: 'editInventory',
  editItem: 'editInventory',
  removeItem: 'editInventory',
  transferItem: 'transferItem',
  setAbility: 'abilities',
  addEntity: 'addEntity',
  // Giving a player who joins the session their token is adding an entity.
  seatPlayer: 'addEntity',
  removeEntity: 'removeEntity',
  setPace: 'entitySettings',
  setEntitySight: 'entitySettings',
  setDarkvision: 'entitySettings',
  // Lifting the one-turn cap on players' orders is a rule for the whole table.
  setPlayerReachCapped: 'entitySettings',
  advanceTurn: 'clock',
  rewindTurn: 'clock',
  goToTurn: 'clock',
  skipPhase: 'clock',
  setSupply: 'supplies',
  addMerchant: 'merchants',
  removeMerchant: 'merchants',
  renameMerchant: 'merchants',
  setMerchantLevel: 'merchants',
  editCatalogEntry: 'merchants',
  removeCatalogEntry: 'merchants',
  addCatalogEntry: 'merchants',
  resetCatalogEntry: 'merchants',
  setFogMode: 'fog',
  setRevealed: 'fog',
  setField: 'terrain',
  setTiles: 'terrain',
  setTerrain: 'terrain',
  reseed: 'terrain',
  setWorldRadius: 'terrain',
  setWorldSize: 'terrain',
  setPaintTerrain: 'terrain',
  finishRoad: 'roads',
  setRoadErase: 'roads',
  setDmTool: 'mapTools',
  setBrushSize: 'mapTools',
  startStroke: 'mapTools',
  continueStroke: 'mapTools',
  endStroke: 'mapTools',
  addResource: 'resources',
  removeResource: 'resources',
  generateResources: 'resources',
  setResourceChance: 'resources',
  setResourceSpacing: 'resources',
  setNote: 'notes',
  addLocation: 'locations',
  removeLocation: 'locations',
  addEvent: 'events',
  removeEvent: 'events',
  rollEncounterOn: 'encounters',
  acceptEncounter: 'encounters',
  setEncounter: 'encounters',
  removeEncounter: 'encounters',
  restoreEncounter: 'encounters',
  addEncounter: 'encounters',
  resetEncounters: 'encounters',
  restore: 'maps',
  clearHistory: 'clearHistory',
  // One undo stack serves the whole table, so a player's undo could take back
  // the DM's edit.
  undo: 'undo',
  redo: 'undo',
} as const satisfies Record<string, Action>

/** The same for the map library store; exporting a map is the 'maps' rule too. */
export const MAP_LIBRARY_RULES = {
  open: 'maps',
  create: 'maps',
  importMap: 'maps',
  rename: 'maps',
  remove: 'maps',
} as const satisfies Record<string, Action>
