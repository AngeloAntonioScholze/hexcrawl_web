import { ref, type Ref } from 'vue'
import type { Seat } from '../engine/stageSeats'

/** Which card the enter screen's camera faces: the title, or one of the forms. */
export type StageMark = 'home' | 'host' | 'join'

/** What the canvas does for the enter screen. HexCanvas provides it while mounted. */
export interface StageDirector {
  /** A ring rolling out through the fog from the hex at the centre of the screen, after any still near it. */
  wave(): void
  /** Swings the map round until the mark's card faces the viewer; resolves once it has settled. */
  turnTo(mark: StageMark): Promise<void>
  /** Eases the camera in over the map for work; resolves once it has settled. */
  zoomIn(): Promise<void>
  /** Eases the camera back out to the title card's view; resolves once it has settled. */
  zoomOut(): Promise<void>
}

const FRONT: Seat = { x: 0, y: 0, facing: 1 }
const AWAY: Seat = { x: 0, y: 0, facing: -1 }

// While veiled the canvas shows every hex buried in fog, whatever the map's own
// fog says, and takes no pointer or key input: the enter screen is up.
const veiled = ref(true)
// Where each card stands as the map turns, written by the canvas every frame it
// draws under the veil. Until it does, the title card simply stands in front.
const seats = ref<Record<StageMark, Seat>>({ home: FRONT, host: AWAY, join: AWAY })
let director: StageDirector | null = null

export function useStage(): {
  veiled: Ref<boolean>
  seats: Ref<Record<StageMark, Seat>>
  direct(next: StageDirector | null): void
  wave(): void
  turnTo(mark: StageMark): Promise<void>
  zoomIn(): Promise<void>
  zoomOut(): Promise<void>
} {
  return {
    veiled,
    seats,
    direct: (next) => {
      director = next
    },
    wave: () => director?.wave(),
    turnTo: (mark) => director?.turnTo(mark) ?? Promise.resolve(),
    zoomIn: () => director?.zoomIn() ?? Promise.resolve(),
    zoomOut: () => director?.zoomOut() ?? Promise.resolve(),
  }
}
