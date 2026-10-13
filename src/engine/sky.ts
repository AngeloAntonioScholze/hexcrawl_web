import { Color3, Color4 } from '@babylonjs/core/Maths/math.color'
import { Vector3, type Matrix } from '@babylonjs/core/Maths/math.vector'
import type { TimeOfDay } from '../time/clock'

type Triple = readonly [number, number, number]

/** What lights the map: the sun by day and through the dawn, the moon after dark. */
export type Body = 'sun' | 'moon'

interface Sky {
  body: Body
  /** How far along its arc the body has come, in degrees: 0 on the eastern horizon, 180 on the western. */
  arc: number
  sun: number
  sky: number
  ground: Triple
  clear: Triple
}

/**
 * One setting for every turn of the day. The sun rises in the east and sets in
 * the west through the four turns of light, and the moon walks the same arc
 * through the night. After dark the light stays bright enough to read the
 * terrain by, because a map nobody can see is not a night, it is a blank screen.
 */
const SKIES: Readonly<Record<TimeOfDay, Sky>> = {
  morning: {
    body: 'sun',
    arc: 25,
    sun: 0.98,
    sky: 0.86,
    ground: [0.42, 0.44, 0.5],
    clear: [0.16, 0.18, 0.22],
  },
  /** Short of overhead, so the hex walls on either side still shade apart. */
  noon: {
    body: 'sun',
    arc: 68,
    sun: 1.05,
    sky: 0.9,
    ground: [0.42, 0.45, 0.52],
    clear: [0.16, 0.18, 0.22],
  },
  afternoon: {
    body: 'sun',
    arc: 140,
    sun: 1,
    sky: 0.88,
    ground: [0.42, 0.44, 0.5],
    clear: [0.16, 0.18, 0.22],
  },
  twilight: {
    body: 'sun',
    arc: 172,
    sun: 0.8,
    sky: 0.68,
    ground: [0.4, 0.36, 0.42],
    clear: [0.17, 0.14, 0.16],
  },
  dusk: {
    body: 'moon',
    arc: 15,
    sun: 0.42,
    sky: 0.42,
    ground: [0.28, 0.27, 0.4],
    clear: [0.1, 0.09, 0.15],
  },
  midnight: {
    body: 'moon',
    arc: 90,
    sun: 0.21,
    sky: 0.24,
    ground: [0.2, 0.24, 0.36],
    clear: [0.07, 0.085, 0.14],
  },
  'late night': {
    body: 'moon',
    arc: 145,
    sun: 0.24,
    sky: 0.27,
    ground: [0.21, 0.25, 0.37],
    clear: [0.075, 0.09, 0.15],
  },
  /** The sun still under the eastern horizon, already colouring the sky. */
  dawn: {
    body: 'sun',
    arc: 4,
    sun: 0.62,
    sky: 0.6,
    ground: [0.34, 0.34, 0.44],
    clear: [0.13, 0.13, 0.18],
  },
}

/** Each body's light high in the sky, and down by the horizon where it glows. */
const TINTS: Readonly<Record<Body, { high: Triple; low: Triple }>> = {
  sun: { high: [1, 0.98, 0.94], low: [1, 0.58, 0.26] },
  moon: { high: [0.66, 0.74, 1], low: [0.42, 0.56, 1] },
}

const UP = new Vector3(0, 1, 0)

/** The arc leans south, toward the camera, so the faces the player sees are the lit ones. */
const ARC_LEAN = (35 * Math.PI) / 180

/**
 * The lowest the light itself comes from. The body and its glow go right down
 * to the horizon, but a grazing light lit the tile tops at a quarter of a high
 * one and the map went dark at every sunrise.
 */
const LIGHT_FLOOR = (25 * Math.PI) / 180

/** Where the body stands, as a unit vector from the ground toward it. East is +x: screen right in the camera's resting view, which looks north. */
export function bodyDirection(time: TimeOfDay): Vector3 {
  const arc = (SKIES[time].arc * Math.PI) / 180
  return new Vector3(
    Math.cos(arc),
    Math.sin(arc) * Math.cos(ARC_LEAN),
    -Math.sin(arc) * Math.sin(ARC_LEAN),
  )
}

/** 1 with the body on the horizon, 0 straight overhead. */
export const lowness = (toward: Vector3): number => 1 - Math.max(0, toward.y)

export interface Daylight {
  /** Where the light comes from, as a direction to point the light at. */
  direction: Vector3
  sun: number
  sky: number
  warmth: Color3
  ground: Color3
  clear: Color4
}

export function daylightFor(time: TimeOfDay): Daylight {
  const sky = SKIES[time]
  const toward = bodyDirection(time)
  const flat = new Vector3(toward.x, 0, toward.z).normalize()
  const elevation = Math.max(LIGHT_FLOOR, Math.asin(Math.max(0, toward.y)))
  const from = flat.scale(Math.cos(elevation)).add(UP.scale(Math.sin(elevation)))
  const tint = TINTS[sky.body]
  return {
    direction: from.negate(),
    sun: sky.sun,
    sky: sky.sky,
    warmth: Color3.Lerp(new Color3(...tint.high), new Color3(...tint.low), lowness(toward)),
    ground: new Color3(...sky.ground),
    clear: new Color4(...sky.clear, 1),
  }
}

/** The glow the body throws over the view, laid on the screen edge nearest it. */
export interface SkyGlow {
  /** Centre of the glow across the view, 0 at the left edge and 1 at the right. */
  x: number
  /** Centre of the glow down the view, 0 at the top edge and 1 at the bottom. */
  y: number
  color: Triple
  /** How strongly it shows, 0 to 1: strongest with the body down by the horizon. */
  strength: number
}

/** Just past the edge, so the brightest part of the glow sits off screen and only its spill shows. */
const EDGE_REACH = 0.62

/**
 * Where the body's glow lands for a camera, read through its view matrix: the
 * body's bearing over the ground turned into a direction across the screen.
 */
export function skyGlow(time: TimeOfDay, view: Matrix): SkyGlow {
  const sky = SKIES[time]
  const toward = bodyDirection(time)
  const onScreen = Vector3.TransformNormal(new Vector3(toward.x, 0, toward.z), view)
  const length = Math.hypot(onScreen.x, onScreen.y) || 1
  const low = lowness(toward)
  return {
    x: 0.5 + (EDGE_REACH * onScreen.x) / length,
    y: 0.5 - (EDGE_REACH * onScreen.y) / length,
    color: sky.body === 'sun' ? TINTS.sun.low : TINTS.moon.low,
    strength: 0.25 + 0.75 * low,
  }
}
