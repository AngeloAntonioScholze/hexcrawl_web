export interface HexEvent {
  id: string
  title: string
  description: string
  /** The turn an accepted encounter was met on; an event the DM wrote has none. */
  turn?: number
}

export interface HexLocation {
  id: string
  name: string
  kind: string
  description: string
}
