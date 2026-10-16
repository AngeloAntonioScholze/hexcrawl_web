/** Where a card stands on screen, relative to the front seat, and how squarely it faces the viewer. */
export interface Seat {
  x: number
  y: number
  /** 1 facing the viewer at the front, -1 behind the map's centre. */
  facing: number
}

export interface SeatView {
  /** The camera's heading round the map, as OrbitCamera reads alpha. */
  alpha: number
  /** Tilt from straight down; a steeper view squashes the circle into a flatter ellipse. */
  beta: number
  /** Screen right laid flat on the ground, unit length. */
  right: { x: number; z: number }
  pixelsPerUnit: number
}

const toward = (heading: number): { x: number; z: number } => ({
  x: Math.cos(heading),
  z: Math.sin(heading),
})

/**
 * The cards sit round the map's centre like seats at a table, each on the
 * heading the camera turns to when that card's turn comes. The front seat is
 * the one between the centre and the viewer; every other seat is placed as the
 * ground under it would be drawn, so the cards ride the map as it turns.
 */
export function seatAt(heading: number, view: SeatView, radius: number): Seat {
  const seat = toward(heading)
  const front = toward(view.alpha)
  const dx = radius * (seat.x - front.x)
  const dz = radius * (seat.z - front.z)
  const across = dx * view.right.x + dz * view.right.z
  // Ground running away from the viewer climbs the screen, foreshortened by the tilt.
  const nearer = dx * front.x + dz * front.z
  return {
    x: across * view.pixelsPerUnit,
    y: nearer * Math.cos(view.beta) * view.pixelsPerUnit,
    facing: seat.x * front.x + seat.z * front.z,
  }
}

/** A third of the way round each way: three seats, evenly spaced. */
export const SEAT_TURN = (2 * Math.PI) / 3

/**
 * The headings of the title, host and join seats. Host takes whichever side
 * shows on the right of the screen from home, so the cards read left to right
 * as the title card's own buttons do.
 */
export function seatHeadings(
  home: number,
  right: { x: number; z: number },
): { home: number; host: number; join: number } {
  const one = toward(home + SEAT_TURN)
  const side = one.x * right.x + one.z * right.z > 0 ? 1 : -1
  return { home, host: home + side * SEAT_TURN, join: home - side * SEAT_TURN }
}
