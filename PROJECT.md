# hexcrawl_web

Living project doc for agents and feature lookups. Update `## Features` and `## Decisions` in the same commit as the feature (`/feature-doc`). Tasks live in the root beads DB under label `repo:hexcrawl_web`.

## Purpose
3D hexcrawl sandbox in the browser. A DM and players run hexcrawl-style tabletop RPG maps together: 3D hex terrain, party movement, fog of war, day/night clock, caravans and merchants, encounters, live sessions over WebRTC.

## Stack
TypeScript (strict), Vue 3, Pinia, Vue Router, Babylon.js (thin instances), SQLite WASM on OPFS SAH pool VFS in a Web Worker, PeerJS/WebRTC, Vite, Vitest, ESLint + Prettier, Bun 1.4+. AGPL-3.0-or-later.

## Commands
- `bun install`, then `bun dev` (http://localhost:5173)
- `bun run build`, then `bun preview`
- Benchmarks: `bun bench`, `bun bench:pick`, `bun bench:resources`, `bun bench:window`

## Gates
Run from `hexcrawl_web/`. Run lint and tests in parallel, then the build.
1. **lint**: `bunx eslint src`. Use `bun run lint` (`eslint .`) only when no agent worktrees are nested inside the repo.
2. **tests**: `bunx vitest run`. Never `bun test`: that's Bun's own runner, not Vitest.
3. **typecheck + build**: `bun run build` (`vue-tsc --noEmit && vite build`). The chunk-size warning is expected.

**Typecheck alone**: `bunx vue-tsc --noEmit`.

**Known noise, not failures**:
- `prettier --check src` flags about 51 CRLF files that predate current work. Only check files you touched: `bunx prettier --check <files>`.
- git "LF will be replaced by CRLF" warnings.

## Architecture
```
src/
  hex/          coords, layout, pathfind, vision, fog edits (pure)
  terrain/      perlin field, map styles, ranges, rivers, roads, slopes, resources gen, travel cost
  entities/     entity, character, abilities, inventory, merchant, supplies, catalog
  time/         clock (day/night, turns)
  encounters/   random tables, journey log
  engine/       Babylon scene: hexGrid (thin instances), hexWindow, fog (lids/wave/stepper), sky, tokens, markers, minimap, camera/controls
  stores/       Pinia: hexMap (core map state + actions), history (undo/redo), mapLibrary, session
  session/      WebRTC: peer, admission, seats, permissions, projection, snapshot codec/diff, stateSync, messages
  persistence/  SQLite worker: schema (migrations), mapState, mapFile (JSON import/export), mapSession, mapIndex
  composables/  view glue: useHexWindow, usePlayerView, useViewMode, useZoomLimit, useUndoKeys
  components/   panels: Caravan*, HexDetails/*, DmToolbar, MiniMap, SessionBar, Enter/Host/Join
  views/        MapView.vue
docs/reference/ art references
```
- **Windowed world**: the grid draws only a viewport-sized window of a large world (`engine/hexWindow.ts`, `composables/useHexWindow.ts`).
- **Permissions**: every store action is gated by `may()` against `HEX_MAP_RULES` in `src/session/permissions.ts`.
- **Player view**: DM state is projected down to a player view (`session/projection.ts`) before being sent or rendered for players.

## Rules
- **Git: the user makes all commits and pushes in this repo.** Don't run `git commit`, `git push`, `git tag` or `gh pr create` here. Report the changed files and a suggested Conventional Commits message instead. This overrides the root commit-after-gates policy.
- Every new store action needs:
  - a `may()` guard
  - an entry in `HEX_MAP_RULES` (`src/session/permissions.ts`)
  - a forbidden-for-players test case
- **A new field saved with the map** must touch every one of these places:
  - `schema.ts` migration
  - `MapSnapshot` + SAVE_MAP/load in `mapState.ts`
  - the `mapFile.ts` guard + `ADDED_FIELD_DEFAULTS`
  - `mapSession.ts` `plain()`
  - `hexMap.ts` snapshot/restore, plus history slots if the change is undoable
  - fixtures in the mapFile/mapState/projection tests
  - a projection test that DM view state isn't sent

  List these places in the bead description.
- **Babylon render loop**: anything that throws inside `scene.onBeforeRenderObservable` kills rendering for good. Keep window/grid capacity in sync with the zoom limit (see bead `hexcrawl_web-z5s`).
- Test files live next to their source. Match the surrounding code and comment style.
- More gotchas are in bd memories with the `hexcrawl-web-` prefix (thin instances, Vite on Windows, scoped styles, perf tools).

## Hot spots
Files that parallel agents must not both rewrite:
- `src/stores/hexMap.ts`
- `src/views/MapView.vue`
- `src/components/HexCanvas.vue`
- `src/engine/scene.ts`
- `src/session/messages.ts`

Small, separate additions to these files (a new action, a new message type) are fine if each agent's prompt says so.

## Features
Grouped by area, newest first within each group. Bead IDs are in the root beads DB.

**Session and permissions** (`hexcrawl_web-xp2`, `hexcrawl_web-05c`)
- 2026-10-18: The player view reads the player projection. Players own entities and are assigned to them. Player snapshots and diffs stream to guests (`session/projection.ts`, `snapshotDiff.ts`, `stateSync.ts`, `composables/usePlayerView.ts`).
- 2026-10-17: Players reconnect when the DM drops. Player orders are capped at one turn of movement, and the DM can lift the cap. Joining players are seated at their own token (`session/seats.ts`, `retry.ts`).
- 2026-10-15:
  - Enter screen with host/join and a session bar.
  - Session protocol: admission and state sync.
  - Player view rules, reveal map, recolour.
  - Permissions, player projection and a PeerJS probe.

**World generation** (`hexcrawl_web-hx9`)
- 2026-10-18: Mountain ranges from ridged noise. Terraced heights, one per level (`terrain/ranges.ts`, `field.ts`).
- 2026-10-17: Map styles for world generation. Elevation terraces from peaks to coast (`terrain/mapStyles.ts`).

**Entities, characters, caravan** (`hexcrawl_web-t3p`, `hexcrawl_web-1a1`, `hexcrawl_web-tdj`)
- 2026-10-18: Caravan portraits (`entities/portraits.ts`).
- 2026-10-17: Purse and level for parties and NPCs. Ability scores. Darkvision (`entities/abilities.ts`).
- 2026-10-14: Inventories, merchant UI, zoom limit (`entities/inventory.ts`, `components/CaravanMerchants.vue`, `useZoomLimit.ts`).
- 2026-10-13/14: Caravan panel. Food and gold, set per turn. Default merchant services catalog with DM overrides. Merchant types table.
- 2026-10-12: Riders, ships, hex details and DM view. Merchant model on caravans.

**DM authoring** (`hexcrawl_web-fxh`)
- 2026-10-13:
  - DM tool mode with toolbar and brush. Paint terrain. Show the brush footprint on hover.
  - Reveal and hide fog by hand.
  - Draw rivers along hex sides, with stone bridges.
  - Roads drawn as dirt paths that speed up travel.
  - Location and event icons on the map.

**Resources** (`hexcrawl_web-l7t`)
- 2026-10-12/13:
  - Resource model and per-terrain table.
  - Seeded generator with a spacing slider (default 5 hexes) and odds sliders.
  - A 3D model per type that fills its hex.
  - Markers on the map and minimap.
  - Shown in the hex details panel.

**Encounters** (`hexcrawl_web-e1m`)
- 2026-10-13: Encounter tables with defaults and overrides, plus a table editor. Roll an encounter from hex details. Accepted encounters are logged in the journey (`encounters/`).

**Fog, time, rendering** (`hexcrawl_web-p79`, `hexcrawl_web-mw8`, `hexcrawl_web-4bl`)
- 2026-10-15: Fog wave, fog lift, see-through fog (`engine/fogWave.ts`, `fogLids.ts`).
- 2026-10-13: Sun and moon light the map by time of day (`engine/sky.ts`, `time/clock.ts`).
- 2026-09-12: Windowed huge worlds, day/night time control, multiple entities with stats, travel log, longer routes with the whole path shown.
- 2026-09-10: First fog of war, player token, sight bonus for mountains and peaks.

**Persistence and maps** (`hexcrawl_web-9tn`)
- 2026-10-13: Keep several maps and switch between them (`stores/mapLibrary.ts`, `persistence/mapIndex.ts`).
- 2026-10-12: Undo/redo for orders and edits (`stores/history.ts`). Export and import maps as JSON (`persistence/mapFile.ts`).

## Decisions
- 2026-11-06: Tasks and memories moved to the root beads DB (`repo:hexcrawl_web`). This file replaces the per-repo CLAUDE.md/AGENTS.md and the local skills.
- Beads stays local-only: no Dolt remote.
