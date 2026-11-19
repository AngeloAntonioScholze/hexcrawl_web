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

**CI**: `.github/workflows/ci.yml` runs lint, tests and build on every pull request to `main` (ubuntu, setup-bun 1.4.2, `bun install --frozen-lockfile`). No deploy; `pages.yml` is separate. Both workflows default to `contents: read`; only the `pages.yml` deploy job gets `pages: write` and `id-token: write`. Actions are pinned to commit SHAs (tag in a trailing comment), checkout uses `persist-credentials: false`, and Dependabot bumps them weekly (`.github/dependabot.yml`).

**Known noise, not failures**:
- `prettier --check src` flags about 51 CRLF files that predate current work. Only check files you touched: `bunx prettier --check <files>`.
- git "LF will be replaced by CRLF" warnings.
- `src/stores/session.test.ts` wire-sync tests are flaky on Linux: a red CI on that file may need a re-run (projects-0iy).

## Architecture
```
src/
  hex/          coords, layout, pathfind, vision, fog edits (pure)
  terrain/      perlin field, map styles, ranges, rivers, roads, slopes, resources gen, travel cost
  entities/     entity, character, abilities, inventory, merchant, supplies, catalog
  time/         clock (day/night, turns)
  encounters/   random tables, journey log
  engine/       Babylon scene: hexGrid (thin instances), hexWindow, fog (lids/wave/stepper), sky, tokens, markers, minimap, camera/controls
  stores/       Pinia: hexMap (core map state + actions), history (undo/redo), journal (change log), mapLibrary, session
  session/      WebRTC: peer, admission, seats, permissions, projection, snapshot codec/diff, stateSync, messages
  persistence/  SQLite worker: schema (migrations), mapState, mapFile (JSON import/export), mapSession, mapIndex
  composables/  view glue: useHexWindow, usePlayerView, useViewMode, useZoomLimit, useUndoKeys
  components/   panels: Caravan*, HexDetails/*, DmToolbar, MiniMap, SessionBar, Enter/Host/Join
  views/        MapView.vue
  analytics/    the only module that imports posthog-js (consent-gated)
  csp.ts        pure buildCsp: the meta Content-Security-Policy (injected at build only)
docs/reference/ art references
```
- **Windowed world**: the grid draws only a viewport-sized window of a large world (`engine/hexWindow.ts`, `composables/useHexWindow.ts`).
- **Permissions**: every store action is gated by `may()` against `HEX_MAP_RULES` in `src/session/permissions.ts`.
- **Player view**: DM state is projected down to a player view (`session/projection.ts`) before being sent or rendered for players.

## Rules
- **GitHub workflows**: every `uses:` is pinned to a full commit SHA with the tag in a comment (Dependabot updates both). Keep workflow-level permissions at `contents: read` and grant extra scopes per job. Checkout sets `persist-credentials: false`. Pass `${{ }}` values to `run:` through `env:`, never inline.
- **Git**: root policy applies. Agents may commit once the work is validated; ask before `git push`, tags and PRs.
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
- Component tests use `@vue/test-utils` + happy-dom (devDeps), enabled per file with `// @vitest-environment happy-dom`.
- `session.test.ts` runs every fake session through one shared outbox, so every session store a test creates must come from the file's `useSessionStore` wrapper, which the root `beforeEach` teardown leaves. A store left hosting keeps its 100 ms broadcast coalescer (`stateSync.ts` `createCoalescer`) on a real timer, which later drops a stray patch into another test's outbox (seen as flaky "the map over the wire" tests, projects-jww).
- **UI copy and titles are sentence case** ("Usage stats", "Share stats" / "Don't share").
- **Analytics**: capture only through `src/analytics`, never import `posthog-js` elsewhere. Event props are controlled enums: no PII, no free text, no map content. Never add per-frame capture.
- **CSP**: the built page carries a meta CSP from `src/csp.ts` (`buildCsp`), injected by the `hexcrawl-csp` vite plugin at build only, so dev has no CSP. A new external origin (fetch, websocket, script, font or image) must be added in `src/csp.ts` and checked in `bun run build` + `vite preview`, or the browser blocks it in production only.
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

**Analytics and consent** (`projects-qrk.7`, spec `design/projects-qrk.7.md`)
- 2026-11-17: PostHog analytics behind a consent prompt (awaiting user validation). Single module `src/analytics`; `posthog-js` is dynamically imported only after consent. Decline is kept in localStorage `hexcrawl.analytics=declined` and strips `ph_*`. Session replay and autocapture off. No-op unless `VITE_POSTHOG_PROJECT_TOKEN` and `VITE_POSTHOG_HOST` are set (`.env.local`). Events: `map_created{source}`, `map_loaded{source}`, `map_exported`, `resources_generated`, `view_switched{to}` (user toggle only), `tool_used{tool}` (on selection only), `entity_added{kind}`, `turn_advanced{advance_type}`, `encounter_accepted`, `session_hosted`, `session_joined`, `session_left{role}`, `session_join_decided{decision}`, `render_init_failed{reason}`, `$exception` via `app.config.errorHandler`, one `$pageview`. Super props `app='hexcrawl_web'`, `view` (dm|player). `ConsentPrompt` is a strip at <=1023px wide or <=640px tall, else a 312px (19.5rem) card. "Share usage stats" switch on `EnterScreen`. Shared analytics service doc: bead `projects-qrk.5` (not written yet).

**Session and permissions** (`hexcrawl_web-xp2`, `hexcrawl_web-05c`, `projects-i0t.3.8`)
- 2026-11-19: Guest resync rate limit (`projects-i0t.3.8`, `session/stateSync.ts`). The host serves at most one resync snapshot per guest per `RESYNC_COOLDOWN` (5 s), counted from when the snapshot finishes sending. A resync during an in-flight snapshot or the cooldown is held (one `resyncPending` flag per guest) and served when the snapshot ends or by a per-guest timer at cooldown expiry, so an honest guest always converges. A guest's first resync is served at once. The timer is cleared on remove and on failed delivery.
- 2026-10-18: The player view reads the player projection. Players own entities and are assigned to them. Player snapshots and diffs stream to guests (`session/projection.ts`, `snapshotDiff.ts`, `stateSync.ts`, `composables/usePlayerView.ts`).
- 2026-10-17: Players reconnect when the DM drops. Player orders are capped at one turn of movement, and the DM can lift the cap. Joining players are seated at their own token (`session/seats.ts`, `retry.ts`).
- 2026-10-15:
  - Enter screen with host/join and a session bar.
  - Session protocol: admission and state sync.
  - Player view rules, reveal map, recolour.
  - Permissions, player projection and a PeerJS probe.

**Panel dock** (`hexcrawl_web-ped`)
- 2026-11-14: Caravan info panel always in the player dock, read-only. It shows a summary (standing, headed, pace), supplies, inventory, riders and merchants with prices. It follows the caravan the party rides, or the one caravan it walks with. With two caravans and neither ridden it shows "not travelling with a caravan". Boarding or leaving swaps the content without folding. DM CaravanPanel unchanged (`components/CaravanPanel.vue`, `composables/usePlayerView.ts` `infoCaravan`).
- 2026-11-14: Each panel section (supplies, inventory, riders, merchants, route, journey log, notes, ...) folds on its own, with keyboard support and `aria-expanded`. Fold state persists per browser in localStorage `hexcrawl.sectionFolds` (`components/PanelSection.vue`, `composables/useSectionFolds.ts`).
- 2026-11-13: All panels (world, entities, caravan, hex details) stacked in one left column, one open at a time (`hexcrawl_web-tb0`).

**World generation** (`hexcrawl_web-hx9`)
- 2026-10-18: Mountain ranges from ridged noise. Terraced heights, one per level (`terrain/ranges.ts`, `field.ts`).
- 2026-10-17: Map styles for world generation. Elevation terraces from peaks to coast (`terrain/mapStyles.ts`).

**Entities, characters, caravan** (`hexcrawl_web-t3p`, `hexcrawl_web-1a1`, `hexcrawl_web-tdj`)
- 2026-11-17: Character card in sub-panel columns, DM view (tdj.4, awaiting user validation). `components/EntityCard.vue` mounts through `components/cardMount.ts` in the `#card` slot of `EntitySubPanel` for each column (levels 1 and 2), own card per column keyed on entity id, heading level 3. Parties and npcs show stat hexagon, gold and level; caravans and ships show portrait, name and tallies. The caravan bust row left the sub-panel (ped.27a). No card in the dock, none in player view (player card is ped.6). `usePlayerView.ts` `orderOf`/`routeOwner` take a narrower `Orders` type; `routeOwner` treats a rider of a removed carrier as its own (checks `scene.entityOf.has(riding)`). Spec `design/hexcrawl_web-tdj.4.md`. Open decision tdj.46 (card-body min-height).
- 2026-11-16: DM controls for owner, hidden and hostile (tdj.27, merged 01857a7, awaiting user validation). `components/EntityDmControls.vue`, mounted in `EntitySubPanel.vue` details after darkvision behind `store.may('assignEntity')`. Uses `setEntityOwner`, `setEntityHidden`, `setEntityHostile`. Switching a seated entity to dm asks first in a dialog ("take it" unseats the player). Styles carry literal fallbacks for `--accent`, `--danger`, `--control-h` until q55 defines them. Spec `design/hexcrawl_web-tdj.27.md`.
- 2026-11-16: Default entity name follows its kind (`npc N`, `caravan N`, `ship N`; was always `party N`) (tdj.42).
- 2026-11-16: DM entity actions that change nothing (unknown id, unchanged value) push no undo step. `restore()` forces hidden and hostile false on player-owned entities, covering load and import (players never restore; their view is the DM store's projection). A real previous-version DB migration test covers hostile (tdj.40).
- 2026-11-15: Character card rebuilt on the supplied art frame, not mounted at the time (mounted in sub-panel columns 2026-11-17, tdj.4). Frames are cropped from `docs/reference/character-card-frame.jpg` into `src/assets/frames/{steel,bronze,crimson}-frame.webp` plus a `*-window.png` mask per tone (`design/tools/card-frames.mjs`); the hand-built SVG crest/foot/frame files are gone. Bust sits in the art's rounded-rect window (not an oval), name in the banner (Inter Tight, long names ellipsis), three small slots (level, gold, and sight for parties and npcs; the mounting code passes slot content, decision tdj.25), lower plate text per tdj.26 (`design/hexcrawl_web-1a1.10.md`). New `CardTally.vue` renders slot values: compact read-only (12.5K, 1M), full number editable. `entities/busts.ts` holds `FRAME_ART` (per-tone region map) and `frameVariant` (colour rule tdj.19: crimson = hidden only per tdj.22, hostile comes with tdj.30). `StatHexagon.vue` sits below the frame in the art's colours; level and gold moved to the slots. `CaravanCardBody`/`ShipCardBody` slimmed to the merchant/aboard lists (pace, sight, level, gold moved to the slots). Provenance: `docs/ASSETS.md`, `src/assets/frames/SOURCE.md` (art is user-supplied; tdj.28 tracks the two other reference images). Beads 1a1.10, tdj.3.
- 2026-11-14: Character card components first cut (superseded 2026-11-15): bust registry (`entities/busts.ts`), `components/CharacterCard.vue`, `BustPicker.vue`, `assets/busts`, `cardBody.ts`, `setPortrait` for every entity kind (DM only).
- 2026-10-18: Caravan portraits (`entities/portraits.ts`). Superseded by busts: scenic caravan portraits removed 2026-11-14; the module is now `professions.ts` and holds only `PROFESSION_ICONS`.
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
- 2026-11-18: Change journal of game-state changes (`projects-8y3.1`, awaiting user validation). `stores/journal.ts` (pure) records one entry per committed change: `id`, `who {role, plays?}`, `cause` (action|undo|redo), `turn` (before the step), `at`, `changes {target, key?, field?, at?, old, new}`. A map change with `at` is a splice, without it a whole value. World changes record the full old values of wiped slots, including dropped frames (big but rare; needed for rewind, `projects-8y3.2`). Hooked at `stores/history.ts` `onStep`/`observe`. `hexMap` exposes the journal as a read-only `shallowRef`. A merged history step replaces the last entry; undo and redo append inverse entries (append-only). Excluded: selection, roadTail, camera, panels, hover. Saved with the map and in the map JSON: schema migration (journal table), `MapSnapshot.journal`, `mapFile` guard plus `ADDED_FIELD_DEFAULTS` `journal: []`, `mapSession` `plain()`. Old maps load with an empty journal. Players never get it: the projection uses a fixed field list (test in `session/projection.test.ts`). Size, bounded by tests in `stores/hexMap.journal.test.ts`: orders plus turns 62,082 bytes per 100 turns (201 entries, ~310 B each); supply-heavy 45,519 bytes per 100 turns (~245 B per supply entry, constant). Autosave posts the full journal until `projects-8y3.3`.
- 2026-10-13: Keep several maps and switch between them (`stores/mapLibrary.ts`, `persistence/mapIndex.ts`).
- 2026-10-12: Undo/redo for orders and edits (`stores/history.ts`). Export and import maps as JSON (`persistence/mapFile.ts`).

**Security** (`projects-i0t.3.11`)
- 2026-11-19: Meta Content-Security-Policy on the built page. Vite plugin `hexcrawl-csp` (`apply: 'build'`, `transformIndexHtml`) injects it as the first child of `<head>`; the dev server has none, so HMR works. `src/csp.ts` `buildCsp` (pure, tested in `src/csp.test.ts`) gives: `default-src 'self'`; `script-src 'self' 'wasm-unsafe-eval'`; `worker-src 'self' blob:`; `connect-src 'self'` plus PeerJS (`https://0.peerjs.com`, `wss://0.peerjs.com`) and the PostHog origin from `VITE_POSTHOG_HOST`; `img-src 'self' data: blob:`; `font-src 'self' data:`; `style-src 'self' 'unsafe-inline'`; `object-src 'none'`; `base-uri 'self'`. `VITE_POSTHOG_HOST` must be a plain http(s) origin or the build fails naming the variable; unset adds no PostHog source. `frame-ancestors` cannot be set in a meta tag. WebRTC data channels are not governed by `connect-src`. Checked in `vite preview`: enter screen, map render (Babylon, SQLite worker), PostHog consent, PeerJS signalling, no violations. The live Pages build gets the PostHog source only once `projects-qrk.22` adds `VITE_POSTHOG_HOST` to its variables.

**CI** (`projects-cox.4`)
- 2026-11-18: Pull-request CI (`.github/workflows/ci.yml`): `bunx eslint src`, `bunx vitest run`, `bun run build` on every PR to `main`. No deploy step.
- 2026-11-19: Workflows hardened (`projects-i0t.3.10`). Workflow-level `contents: read`; `pages: write` and `id-token: write` on the `pages.yml` deploy job only. Actions pinned to SHAs (checkout v4.4.0, setup-bun v2.2.0, configure-pages v5.0.0, upload-pages-artifact v3.0.1, deploy-pages v4.0.5), `persist-credentials: false`, `bun-version: 1.4.2`, Pages `base_path` passed via env `BASE_PATH`. Dependabot `github-actions` weekly.

## Decisions
- 2026-11-06: Tasks and memories moved to the root beads DB (`repo:hexcrawl_web`). This file replaces the per-repo CLAUDE.md/AGENTS.md and the local skills.
- 2026-11-14: Player caravan panel is read-only, and its dock slot is always present. It shows player-allowed fields only. The tdj.4 caravan card repeating gold and the merchants is deliberate (tdj.11/12): the card lists merchant name, type and level, and the priced catalog stays in the section.
- 2026-11-14: Player dock specs are in `design/hexcrawl_web-ped.5.md`, `.6.md` and `.7.md`, with the sketch at `docs/reference/player-card-sketch-2026-11-14.png`. ped.5 (no entities panel for players) ships together with ped.6 (my character panel).
- 2026-11-14: Card shape comes from the user's sketch (`docs/reference/player-card-sketch-2026-11-14.png`): the same tall card for every entity kind. Card names use Inter Tight 600 (SIL OFL 1.1), self-hosted woff2 in `src/assets/fonts/inter-tight` with `OFL.txt`, `@font-face` in `style.css`, no CDN. The caravan card shows caravan gold (its own purse) and a merchant summary. Entity cards will open in sub-panel columns right of the dock (ped.12); the in-dock mount was dropped by the user (branch deleted); cards mount in the sub-panel columns (tdj.4, 2026-11-17).
- 2026-11-16: Hostile rules (tdj.35 b, tdj.37 a, tdj.38 b, tdj.41): players see hostile (the projection sends it; hidden entities are still not sent); hostile is available on all four kinds; only dm-owned entities can be hidden or hostile, and handing an entity to a player (`setEntityOwner`, `assignEntity`) clears both. `restore()` enforces the same on load and import (tdj.40).
- 2026-11-17: Consent decisions qrk.11, qrk.12, qrk.13 are open; built on the defaults: a decline is remembered, the switch lives only on the enter screen, prompt copy as shipped (sentence case).
- 2026-11-15: Card frame is the supplied raster art (webp frame + png window mask per tone), not generated SVG. Why: the user rejected the hand-built SVG look (2026-11-14). Consequence: fixed aspect, 1x resolution (soft on HiDPI); window mask coordinates are coupled to `CharacterCard.vue` CSS and `FRAME_ART` regions; record provenance in `src/assets/frames/SOURCE.md` and `docs/ASSETS.md` when a frame changes.
- Known gap: the default entity name can repeat after a delete (tdj.44).
- Beads stays local-only: no Dolt remote.
- 2026-11-18: Merge flow is one PR per bead; CI is the pre-merge check and the user merges.
- 2026-11-18: The journal and `stores/history.ts` share one capture point (history `onStep`/`observe`); no duplicate tracking. Undo stays a ref-swap and session-only; the journal is append-only and not the undo source. Non-undoable game actions (turn clock, assign/owner, terrain/world) go through `observe()`, which emits without pushing an undo step.
