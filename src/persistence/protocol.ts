import type { MapSnapshot } from './mapState'

export type MapCommand = { type: 'load' } | { type: 'save'; snapshot: MapSnapshot }

export type MapRequest = MapCommand & { id: number }

export type MapResponse =
  { id: number; ok: true; result: MapSnapshot | null } | { id: number; ok: false; error: string }
