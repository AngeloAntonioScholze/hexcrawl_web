import { onBeforeUnmount, watch, type ShallowRef } from 'vue'
import type { HexScene } from '../engine/scene'
import { parseKey, type HexKey } from '../hex/coords'
import { hexToWorld, type Layout } from '../hex/layout'
import { useHexMapStore } from '../stores/hexMap'

/** How long a token spends in the air between two hexes. */
const HOP_MS = 300

/** A beat on the landing hex before the next leap. */
const LANDING_MS = 90

/** A breath between one entity finishing and the next setting off. */
const HANDOVER_MS = 220

/** How long climbing into or out of a caravan takes. */
const BOARD_MS = 450

/**
 * Plays a turn back rather than snapping to the end of it. Each entity that
 * moved is taken in its turn: the view slides over it, its token walks the
 * hexes the record says it entered, and only then does the next one set off, so
 * a turn reads as a sequence of things that happened rather than as everything
 * on the map moving at once.
 *
 * A party climbing out of a caravan grows out of it before it sets off, and
 * one ending the turn aboard shrinks into it once everybody has moved, so it
 * goes in wherever the caravan finally stopped.
 *
 * Only a step forward is played. Winding the crawl back, jumping down the log
 * or laying out a new world all put every token where it belongs at once: a
 * rewind is not a journey, and animating one backwards would say it was.
 */
export function useTurnPlayback(hexScene: ShallowRef<HexScene | null>, layout: Layout): void {
  const store = useHexMapStore()

  let run = 0
  let playing = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const cancel = (): void => {
    run += 1
    playing = false
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  const wait = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      timer = setTimeout(resolve, ms)
    })

  /** Everybody where the store says they are: the end state of any turn. */
  const snap = (): void => {
    hexScene.value?.tokens.setEntries(
      store.tokens.map((token) => ({ ...token, hex: token.hex ? parseKey(token.hex) : null })),
    )
  }

  // The positions change on the same flush as the turn does, so a walk being
  // played has to be left alone or it would be snapped to its own ending.
  const settle = (): void => {
    if (!playing) snap()
  }

  const lookAt = (hex: HexKey): void => {
    const world = hexToWorld(layout, parseKey(hex))
    hexScene.value?.iso.focusOn(world.x, world.z)
  }

  const play = async (spent: number): Promise<void> => {
    const scene = hexScene.value
    if (!scene) return snap()

    const opening = store.positionsAt(spent)
    const closing = store.positionsAt(spent + 1)
    const insideAt = (id: string): string | null => opening.get(id)?.inside ?? null

    const shown = new Set(store.shownEntities.map((one) => one.id))
    const rows = store.recordsOn(spent).filter((row) => shown.has(row.entityId))

    // A rider carried along spends nothing and is never seen; one that spent
    // something walked a route of its own, so it climbed out first.
    const alighted = new Set(
      rows.filter((row) => insideAt(row.entityId) && row.spent > 0).map((row) => row.entityId),
    )
    const walked = rows
      .filter(
        (row) => row.entered.length > 0 && (!insideAt(row.entityId) || alighted.has(row.entityId)),
      )
      // Climbing out happens where the caravan stood when the turn opened, so it
      // is played before any caravan moves off.
      .sort((a, b) => Number(alighted.has(b.entityId)) - Number(alighted.has(a.entityId)))
    const boarded = rows.filter((row) => {
      const after = closing.get(row.entityId)?.inside
      return after && (!insideAt(row.entityId) || alighted.has(row.entityId))
    })

    if (walked.length === 0 && boarded.length === 0) return snap()

    const mine = ++run
    playing = true

    // Back to where everybody stood when the turn opened, so each walk starts
    // from the hex the record says it started from.
    for (const [id, { hex, inside }] of opening) {
      scene.tokens.place(id, hex && !inside ? parseKey(hex) : null)
    }

    for (const row of walked) {
      if (row.from) lookAt(row.from)

      const carrier = insideAt(row.entityId)
      if (carrier && row.from) {
        scene.tokens.alight(row.entityId, carrier, parseKey(row.from), BOARD_MS / 1000)
        await wait(BOARD_MS + LANDING_MS)
        if (mine !== run) return
      }

      for (const hex of row.entered) {
        scene.tokens.hop(row.entityId, parseKey(hex), HOP_MS / 1000)
        lookAt(hex)
        await wait(HOP_MS + LANDING_MS)
        if (mine !== run) return
      }

      await wait(HANDOVER_MS)
      if (mine !== run) return
    }

    for (const row of boarded) {
      const caravan = closing.get(row.entityId)?.inside
      if (!caravan) continue
      if (row.to) lookAt(row.to)
      scene.tokens.board(row.entityId, caravan, BOARD_MS / 1000)
      await wait(BOARD_MS + LANDING_MS)
      if (mine !== run) return
    }

    playing = false
    snap()
  }

  watch(
    () => store.turn,
    (now, before) => {
      cancel()
      // One turn forward is a turn being played; anything else is the crawl
      // being moved about, and that lands where it lands.
      if (now === before + 1) void play(before)
      else snap()
    },
  )

  watch(() => store.tokens, settle)

  onBeforeUnmount(cancel)
}
