import type { MapEntry } from './mapIndex'
import type { MapSnapshot } from './mapState'

export type MapCommand =
  | { type: 'start' }
  | { type: 'save'; snapshot: MapSnapshot }
  | { type: 'open'; mapId: string }
  | { type: 'create'; name: string; snapshot: MapSnapshot | null }
  | { type: 'rename'; mapId: string; name: string }
  | { type: 'delete'; mapId: string }

export interface MapList {
  maps: MapEntry[]
  currentId: string
}

/** A map that is now the one being written to; null when its file is still empty. */
export interface OpenedMap extends MapList {
  snapshot: MapSnapshot | null
}

export interface MapResults {
  start: OpenedMap
  open: OpenedMap
  create: OpenedMap
  save: null
  rename: MapList
  delete: MapList
}

export type MapResult = MapResults[MapCommand['type']]

export type MapRequest = MapCommand & { id: number }

export type MapResponse =
  { id: number; ok: true; result: MapResult } | { id: number; ok: false; error: string }
