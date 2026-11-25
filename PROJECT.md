# hexcrawl_web

Project definition and rules for agents. Features, decisions and ideas live in the root vault: `vault/hexcrawl_web/Hexcrawl Web.md` (`/feature-doc`). Tasks live in the root beads DB under label `repo:hexcrawl_web`.

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
- **UI**: dialogs and panels take gameuidatabase.com as the base guide (`vault/_shared/Game UI Reference.md`).
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
- **Analytics**: capture only through `src/analytics`, never import `posthog-js` elsewhere. Event props are controlled enums: no PII, no free text, no map content. Never add per-frame capture. Every event passes `scrubEvent` (`before_send`): no room code in URLs, no exception text; keep it wired.
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
