# hexcrawl_web-ped.5: player dock without the entities panel

Status: spec, revised 2026-11-16 for the ped.12 layout (landed, main `8cfbca4`) and ped.18 (players get no columns). User answers in decision bead hexcrawl_web-ped.8, summarised at the end. User restated 2026-11-16: **a player must not have access to the entities panel, only their own entity and what belongs to it.**

**Ships together with ped.6, in one change.** No interim shell: players keep today's entities panel until the character panel, with its card, lands. This file specifies the panel and the dock; `design/hexcrawl_web-ped.6.md` specifies the cards, the edit path and the projection change. The build waits on what ped.6 waits on: hexcrawl_web-tdj.4 only (05c.18 is no longer a dependency).

This file **amends** `design/hexcrawl_web-tb0.md` and `design/hexcrawl_web-ped.12.md` for the player role. Where they disagree for a player view, this file wins. The DM dock and columns are unchanged.

Builds on `design/hexcrawl_web-0zz.md` (PanelSection, fold keys) and `design/hexcrawl_web-ped.7.md` (the always-on player caravan info panel, landed).

Not in this spec: the cards (ped.6; component from tdj.4), restyle (q55), motion (17y).

## Goal
For a player at the table, at every window size. The dock holds only their own character and what belongs to it. The one action stays: **click a hex to give your character a route**. The dock supports it with that one character's route, orders, inventory and log.

## Who counts as a player view
`store.dmView === false`. Two cases:
- **local player view**: the DM's browser through the debug ViewToggle. `seatedIds === null`; the viewer owns every player-owned entity.
- **joined player**: `seatedIds` set by the room's `seat` message. A joined browser runs with `dmView === false` only once hexcrawl_web-05c.9 lands; until then test it at store level with `dmView = false` plus `seatedIds`.

## The DM side today (ped.12, for contrast)
DM dock: world, entities (summary, `entities.list` with `›` open buttons, add/remove/played by, `route`, `orders`, `paths`, hint), hex details. A DM entity's sheet (card, details, supplies, inventory, riders, merchants, log) opens in a column. The DM caravan panel is no longer in the dock (ped.17). None of that changes.

## What players lose with the entities panel, and where it goes
On main the player sees the same entities `<aside>` as the DM, plus three player-only sections (`forPlayers` branches in `MapView.vue`). Checked against `MapView.vue` at `8cfbca4`.

| in the entities panel today (player view) | goes to |
|---|---|
| summary `dl`: turn + phase, standing, headed | character panel, top of body, never folds |
| `entities.list`: every visible entity, riders nested; a row click selects (joined: only own rows react, `selectEntity` refuses others; local view: any row) | **dropped.** No roster of other entities (ped.8 Q4); they stay visible as map tokens only. Own-entity selection: see next section |
| `›` open buttons | already absent for players (`v-if="columns"`) |
| add / remove / played by / `players may plan past one turn` | DM only via `may()`; stays in the DM's entities panel |
| `route`: km, hexes left, turns, legs, drop a stop `×` | character panel, `character.route` |
| `orders`: call off the order, make camp, "not yours to order" | character panel, `character.orders` |
| `entities.selected` (player-only): name, colour, pace, sight, darkvision rows | character panel, `character.details` |
| `entities.inventory` (player-only, `ownInventory`) | character panel, `character.inventory` |
| `entities.log` (player-only): hexes walked, journey | character panel, `character.log` |
| `paths`: show path history, show all paths | character panel, `character.paths` |
| hint line | character panel, foot of the body |
| selecting a caravan from the list so the caravan panel shows it (local view only) | gone. The caravan info panel follows the subject (see "What belongs to the player") |

After this change MapView's entities `<aside>` renders for the DM only and keeps no `forPlayers` branches.

## Selecting your own entity
Map tokens are not clickable for selection (`store.click` never selects an entity), so the list was the only selector. Replacements, all limited to own entities:
1. **Auto-select**: the subject watch (below) keeps `selectedId` on one of the player's own characters. With one character, that is all a player needs.
2. **Switcher** `your characters`, shown at 2+ own characters (row 1 of the panel).
3. **Caravan info riders rows** (ped.7, unchanged): rows for riders the player may order are buttons that select that rider; others are plain text. These are own entities by `may('order')`, so the rule holds.

## What belongs to the player
- Their own characters: `candidates` below.
- Each character's inventory, route, orders, paths and log: character panel.
- The caravan their subject is, or rides in: caravan info panel (ped.7), with its supplies, inventory, riders and merchants' catalog, read only.
- Nothing else: no other entity's sheet, inventory, route or log anywhere in the player dock.

**Conflict to settle (open question 1):** `player.infoCaravan` on main falls back to the only caravan on the map when the subject rides none, so a player can read a caravan that is not theirs. Default in this spec: drop the fallback; caravan info shows `shownCaravan` only (the subject is the caravan or rides in it), else the ped.7 empty line `not travelling with a caravan`.

## Dock order (amends tb0 "The column")
Fixed; never changes with selection.

| # | DM view (unchanged, ped.12) | player view (new) |
|---|---|---|
| 1 | world: when `shapesWorld` | **character**: always |
| 2 | entities: always | **caravan** info: always (ped.7) |
| 3 | hex details: `may('notes')` and a hex selected | **hex details**: same rule; `may('notes')` is DM only, so players never see it (ped.8 Q7) |

No columns for players (ped.18): `--sub-columns` stays 0 and the stack empties on every `dmView` change (ped.12, unchanged).

`--dock-rows` counts the rendered headers: player view 2; DM 1 to 3. The phone `--dial-top` and SessionBar formulas already read it.

### The gate
- Add a DM-only `Action` `'entityList'` to `src/session/permissions.ts`, with **no** `PLAYER_RULES` entry. It maps to no store function, so `HEX_MAP_RULES` is unchanged.
- MapView `rendered`: `entities: store.may('entityList')`, `character: forPlayers.value`. Both derive from `dmView` through `viewer`.

## Store change (`src/stores/hexMap.ts`, small addition only)
- `SidePanel` becomes `'world' | 'entities' | 'character' | 'caravan' | 'details'`.
- `panelsOpen` gets `character: false`. Nothing else changes in `setPanelOpen`, `revealPanel` or `panelGone`.
- View state, never saved, no `may()` guard (as tb0).

## Behaviour (amends tb0 "Initial state", "A panel stops rendering", "Focus")
`home = forPlayers ? 'character' : 'entities'`.
- **Initial state**: desktop and tablet open `home`; phone opens none.
- **Fallback** in the `rendered` watch: `store.panelGone(which, phone() ? null : home)` (today hard-coded `'entities'`).
- **Focus fallback** in the same watch: the open panel's header, else `panel-${home}-head`.
- **Role switch** (debug toggle, or a guest becoming a player client): DM to player, entities and world stop rendering and character opens on desktop; player to DM, character stops rendering and entities opens. The sub-panel stack is already cleared (ped.12).
- **Subject**: `candidates` = the player's own characters, in seat order:
  - joined: `store.seatedIds` filtered to ids in `player.scene.entityOf`
  - local: projection entities with `owner === 'player'`

  If `store.selectedEntity?.id` is not in `candidates`, `store.selectEntity(candidates[0]?.id ?? '')`, in a watch on `[forPlayers, candidates]`. Map clicks then order the character the panel shows. After a peek the DM's selection may differ (accepted, ped.8 Q5).

## The character panel
tb0 anatomy: `aside.panel.character`, header `h2.title > button.head#panel-character-head`, body `#panel-character`.

Build: a new `src/components/CharacterPanel.vue` is now the simpler path, since the player-only sections leave MapView and the DM panel keeps only route, orders and paths. Route, orders and paths markup is shared with the DM panel: extract it (for example `RouteSection.vue`, `OrdersSection.vue`, `PathsSection.vue`) rather than copy it. Keeping one `<aside>` in MapView that switches on `forPlayers` is also acceptable. Implementer's call.

### Header
- Pip (character colour, 0.55rem, `aria-hidden`), the character's name (one line, ellipsis), chevron. Reuse CaravanPanel's `.label-row`, `.name`, `.pip` (gap 0.45rem).
- No character: text `character`, no pip.
- States as tb0: default, hover, focus-visible ring `#7aa2c8`, expanded.

### Body, top to bottom
| # | block | foldKey | title | meta | contents | rendered when |
|---|---|---|---|---|---|---|
| 0 | summary `dl` | none | none | none | `turn` (+ phase n/4), `standing`, `headed` | a character exists |
| 1 | switcher | `character.mine` | `your characters` | `{candidates.length}` | `ul.entities` rows: pip, name, kind, `{pace}/turn`. Click `store.selectEntity(id)`; current row does nothing | `candidates.length >= 2` |
| 1b | card | `character.card` | `card` | none | ped.6 | a character exists |
| 2 | orders | `character.orders` | `orders` | none | `call off the order`, `make camp this turn` (existing rules and titles), else `p.dim` "not yours to order" | a character exists |
| 3 | route | `character.route` | `route` | `{km} km` | as the DM's `route` section; drop-stop `×` while orderable | `store.route` |
| 4 | details | `character.details` | `details` | `{kind}` | name and colour inputs (by their `may()`), pace and sight read rows. Pace, sight, darkvision inputs stay DM only (`entitySettings`) | a character exists |
| 5 | inventory | `character.inventory` | `inventory` | as 0zz | `<InventoryList :owner-id="subject.id" fold-key="character.inventory">`, same `ownInventory` rule as today | `ownInventory` |
| 6 | adventure log | `character.log` | `adventure log` | `{km} km` | as today's player `entities.log`; turn rows disabled for players | `adventureLog.length` |
| 7 | paths | `character.paths` | `paths` | none | the two checkboxes | always |
| 8 | hint `p` | none | none | none | existing `hint` | always |

- Fold keys are new and start open; they share nothing with `entities.*`.
- Spacing and section look from 0zz; no new values.

### Switcher row states
default and hover as `.entities` rows; current: `.here` plus `aria-current="true"`; focus-visible: the existing ring; no disabled state.

### Empty state (no own character)
A seated player whose token the DM removed, or a local view on a map with no player entities.
- Header `character`, no pip. The panel still renders.
- Body: only `p.dim` `no character of yours on this map · the DM can hand you one`, `padding-top: 0.75rem`.

## Breakpoints
tb0: phone up to 720px (360x740), tablet 721 to 1023 (768x1024), desktop from 1024 (1280x800). The ped.12 column modes (1280, 1600) do not apply to players. Phone with no panel open: 2 header rows; the dial sits under them.

## Tokens
None new.

## Copy (English, lowercase)
- Section titles `your characters`, `orders`, `details` (`card` from ped.6).
- Empty line `no character of yours on this map · the DM can hand you one`.
- Fallback header `character`.
- Other titles reuse existing words (`route`, `inventory`, `adventure log`, `paths`); hint copy unchanged.

## Accessibility
- Panel: tb0 APG disclosure, named by the header text. Sections: 0zz disclosures.
- Tab order, player view: character header, its body in table order, then the caravan header and body.
- Switcher marks the current row with `aria-current="true"`; colour is not the only cue. Pip is `aria-hidden`.
- Contrast: existing inks only. Targets: headers 40/44px, section rows 32/40px.
- Reduced motion: no motion added. No images in this file.

## Tests
- `permissions.test.ts`: `allowed(DM, 'entityList')` true; `PLAYER` false; `{ role: 'player', plays: ['a'] }` false.
- `hexMap.test.ts` side panels: `setPanelOpen('character', true)` with entities open leaves only character open; `panelGone('entities', 'character')` opens character; `panelGone('character', 'entities')` opens entities.
- Dock rows: a pure helper (e.g. `dockPanels({ shapesWorld, forPlayers, details })`) returns the ordered list; DM full 3, DM minimal 1, player 2. `--dock-rows` is its length.
- MapView (happy-dom), player view: no `#panel-entities-head`, no `.entities` list, no `forPlayers` section inside the DM aside; `#panel-character-head` present; no `.subpanels`.
- Subject rule: `dmView = false`, `seatedIds = ['b', 'c']`, `selectedId = 'a'` gives `selectedEntity` `b` (add only if missing).
- If open question 1 keeps the default: `usePlayerView` test that `infoCaravan` is null when the subject neither is nor rides a caravan, even with one caravan on the map.

## UI review checklist
At 360, 768 and 1280:
- **DM**: dock and columns exactly as ped.12.
- **Local player view**: character open on desktop and tablet, none on phone; no entities panel; no columns; toggling back to DM opens entities.
- **One character**: no switcher; header pip and name; route, orders, details, inventory, log, paths work; map clicks order it.
- **Two characters**: switcher shows both; picking one switches header, card and every section; map clicks order the picked one.
- **Riding a caravan**: caravan info shows it; its rider rows select only own riders.
- **Not riding a caravan** (one caravan on the map): caravan info shows the empty line (default of open question 1).
- **Empty state**: DM removes the player's only entity.
- **Phone**: dial right under the 2 headers; `--dock-rows` matches.
- ped.6's checklist runs in the same review.

## Assets
None.

## Decisions (user, 2026-11-14, bead hexcrawl_web-ped.8; restated 2026-11-16)
1. Ship together with ped.6; no interim shell.
2. Gate: DM-only `'entityList'` permission through `may()`.
3. Several characters: `your characters` switcher at 2+.
4. No roster of other entities for players; map tokens only. Restated 2026-11-16: only their own entity and what belongs to it.
5. Local player view: the DM's selection jumps to the first player-owned entity, not restored.
6. Panel title: pip and character name, `character` when none.
7. Hex details for players: never shown.
8. Empty copy: `no character of yours on this map · the DM can hand you one`.

## Open question
1. **Caravan info for a caravan the player does not ride.** `infoCaravan` falls back to the map's only visible caravan (ped.7 step 3, user default in ped.10 Q2). Default here: drop that step (only the caravan the subject is or rides in), per the 2026-11-16 restatement. Alternative: keep it (ped.7 as built).
