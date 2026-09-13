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

/**
 * Plays a turn back rather than snapping to the end of it. Each entity that
 * moved is taken in its turn: the view slides over it, its token walks the
 * hexes the record says it entered, and only then does the next one set off, so
 * a turn reads as a sequence of things that happened rather than as everything
 * on the map moving at once.
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
      store.tokens.map(({ id, hex, color }) => ({ id, hex: hex ? parseKey(hex) : null, color })),
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

    const shown = new Set(store.shownEntities.map((one) => one.id))
    const walked = store
      .recordsOn(spent)
      .filter((row) => shown.has(row.entityId) && row.entered.length > 0)

    if (walked.length === 0) return snap()

    const mine = ++run
    playing = true

    // Back to where everybody stood when the turn opened, so each walk starts
    // from the hex the record says it started from.
    for (const [id, hex] of store.positionsAt(spent)) {
      scene.tokens.place(id, hex ? parseKey(hex) : null)
    }

    for (const row of walked) {
      if (row.from) lookAt(row.from)

      for (const hex of row.entered) {
        scene.tokens.hop(row.entityId, parseKey(hex), HOP_MS / 1000)
        lookAt(hex)
        await wait(HOP_MS + LANDING_MS)
        if (mine !== run) return
      }

      await wait(HANDOVER_MS)
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
