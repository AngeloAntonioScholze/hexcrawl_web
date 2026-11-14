# hexcrawl_web-ped.5: player dock without the entities panel

Status: spec, 2026-11-14. Decided (user answers in decision bead hexcrawl_web-ped.8, summarised at the end).

**Ships together with ped.6, in one change.** There is no interim character-panel shell: players keep today's entities panel until the character panel, with its card, lands. ped.5 and ped.6 are one build: this file specifies the panel and the dock; `design/hexcrawl_web-ped.6.md` specifies the card section inside it, the edit path and the projection change. The build therefore waits on what ped.6 waits on (tdj.4 and hexcrawl_web-05c.18).

This file **amends** `design/hexcrawl_web-tb0.md` for the player role. tb0.md itself is left as committed. Where the two disagree for a player view, this file wins. The DM dock is unchanged.

It builds on top of `design/hexcrawl_web-0zz.md` (PanelSection, fold keys) and on `design/hexcrawl_web-ped.7.md` (the always-on caravan panel, which may land earlier).

Not in this spec:
- the card section and its data (ped.6; the card component itself is the cards epic, hexcrawl_web-tdj)
- the always-on caravan info panel (ped.7)
- restyle (q55) and motion (17y)

## Goal
For a player at the table, at every window size. The dock holds only what is about **their own character**. They give orders on the map and read where their character stands, with no list of everyone else in the way. The one action stays the same as today: **click a hex to give your character a route**. The dock supports it with the route, orders and log of that one character.

## Who counts as a player view
"Player view" means `store.dmView === false`. It covers two cases:
- **local player view**: the DM's browser peeking through the debug ViewToggle. `seatedIds === null`, and the viewer owns every player entity.
- **joined player**: `seatedIds` is set by the room's `seat` message.

Note: a joined browser only runs with `dmView === false` once hexcrawl_web-05c.9 (locked player client) lands. Until then, test the joined case at store level with `dmView = false` plus `seatedIds = [...]`, which is the state 05c.9 will produce.

## What players lose with the entities panel, and where it goes
Checked in the 0zz worktree code (`MapView.vue` entities `<aside>`, `stores/hexMap.ts` `selectEntity`/`selectedEntity`, `usePlayerView.ts`, `permissions.ts`).

| today, in the entities panel (player view) | used by players? | goes to |
|---|---|---|
| summary dl: turn + phase, standing, headed | yes | character panel, top of body, never folds |
| `entities.list`: every visible entity, riders nested, pick to select | joined: only their own rows react, because `selectEntity` refuses others. Local view: any row | **dropped**. Replaced by `your characters` (switcher), shown only with 2+ own characters. No roster of other entities: they stay visible as map tokens only (user decision) |
| add / remove / played by / `players may plan past one turn` | no, DM only via `may()` | nothing: stays in the DM's entities panel |
| `entities.route`: km, hexes left, turns, legs, drop a stop `×` | yes, for own orders | character panel, `character.route` |
| `entities.selected`: name, colour, pace, sight, darkvision, call off, make camp, "not yours to order" | yes: rename and recolour are player-allowed (`ownsTarget`), the order buttons too | split in two sections in the character panel: `character.orders` and `character.details` |
| `entities.inventory` | yes: player may edit own inventory and transfer | character panel, `character.inventory` |
| `entities.paths`: show path history, show all paths | yes, view toggles | character panel, `character.paths` |
| `entities.log`: hexes walked, journey | yes, read only (`goToTurn` is DM only) | character panel, `character.log` |
| hint line at the foot | yes | character panel, at the foot of the body |
| selecting a caravan from the list so the caravan panel shows | local view only; a joined player could not select a caravan anyway | ped.7's always-on caravan panel (slot 2) |

Map tokens are not clickable for selection (`store.click` never selects an entity), so the list is the only selector today. With one own character, `selectedEntity` already falls back to it (joined) and needs no selector.

**Projection**: no change from this file. `PlayerProjection.entities` still feeds tokens, riders, carriers, paths and the caravan panel. Nothing in it was there only for the list. (ped.6 strips DM npcs' sheets; that is ped.6's change.)

**No interim home**: the entities panel is removed for players in the same change that adds the character panel, so players never lose route, orders, inventory or log.

## Dock order (amends tb0 "The column")
Order, top to bottom. Fixed; never changes with selection.

| # | DM view (unchanged) | player view (new) |
|---|---|---|
| 1 | world: when `shapesWorld` | **character**: always |
| 2 | entities: always | caravan: always (ped.7) |
| 3 | caravan: while a caravan is shown | hex details: while `store.may('notes') && store.selectedHex`. That is DM-only, so players never see it (decision: unchanged) |
| 4 | hex details: while `may('notes')` and a hex is selected | none |

`--dock-rows` counts the rendered headers. Player view: 2 (ped.7 is expected to land first; if it has not, 1 or 2 by the tb0 caravan rule). DM: 1 to 4. The phone `--dial-top` and SessionBar formulas from tb0 already read it and need no change.

### The gate
- Add a DM-only `Action` `'entityList'` to `src/session/permissions.ts`, with **no** `PLAYER_RULES` entry.
- It maps to no store function, so `HEX_MAP_RULES` is unchanged. Visibility already reads permissions the same way: world via `may('terrain' | 'maps' | 'resources')`, and details via `may('notes')`.
- In MapView's `rendered` computed:
  - `entities: store.may('entityList')`
  - `character: forPlayers.value`

Both derive from `dmView` through `viewer`, so they never disagree.

## Store change (`src/stores/hexMap.ts`, small addition only)
- `SidePanel` becomes `'world' | 'entities' | 'character' | 'caravan' | 'details'`.
- `panelsOpen` gets `character: false`. Nothing else changes in `setPanelOpen`, `revealPanel` or `panelGone`.
- View state, never saved, no `may()` guard (as tb0).

## Behaviour (amends tb0 "Initial state", "A panel stops rendering", "Focus")
Define `home = forPlayers ? 'character' : 'entities'`.
- **Initial state**, in MapView setup: desktop and tablet open `home`; phone opens none.
- **Fallback** in the `rendered` watch: `store.panelGone(which, phone() ? null : home)`.
- **Focus fallback** in the same watch: the open panel's header, else `panel-${home}-head` (today it is hard-coded to entities).
- **Role switch**: the debug toggle, or a guest becoming a player client. Nothing new to write; the existing watch covers it:
  - DM to player: entities (and world) stop rendering, so `panelGone` opens character on desktop.
  - Player to DM: character stops rendering, so entities opens.
  - Expected result: desktop never ends with every panel folded after a switch. Phone ends with none open.
- **Subject of the character panel**: `candidates` is the player's own characters, in seat order:
  - joined: `store.seatedIds` filtered to ids present in `player.scene.entityOf`
  - local: projection entities with `owner === 'player'`

  If `store.selectedEntity?.id` is not in `candidates`, call `store.selectEntity(candidates[0]?.id ?? '')`. Run this in a watch on `[forPlayers, candidates]`, so map clicks order the character the panel shows. This changes the shared `selectedId`, which is view state; the DM's own selection may differ after a peek, which is accepted.

## The character panel
Same panel anatomy as tb0: `aside.panel`, header `h2.title > button.head`, scrolling `.body`.

Suggested build: keep it in MapView as the same `<aside>` the entities panel uses. Its key, ids, title and section set switch on `forPlayers`. That way the route, orders, inventory, paths and log markup is not duplicated in a hot-spot file. A separate `CharacterPanel.vue` is fine too, if the shared markup is extracted rather than copied. Implementer's call.

- Ids: body `panel-character`, header button `panel-character-head`.
- `aside` class: `panel character`.

### Header
- Inside the button, left to right:
  - pip: the character's colour, 0.55rem circle, as the caravan header
  - the character's name, one line with ellipsis
  - the chevron
- Reuse CaravanPanel's `.label-row`, `.name` and `.pip` rules (gap 0.45rem).
- With no character: the text is `character`, and there is no pip.
- States as tb0's header table: default, hover, focus-visible ring `#7aa2c8` (`var(--accent)` once q55 lands), expanded.

### Body, top to bottom
| # | block | foldKey | title | meta | contents | rendered when |
|---|---|---|---|---|---|---|
| 0 | summary `dl` | none, never folds | none | none | `turn` (+ phase n/4), `standing`, `headed`. Same markup as the entities summary | a character exists |
| 1 | switcher | `character.mine` | `your characters` | `{candidates.length}` | `ul.entities` rows: pip, name, kind, `{pace}/turn`. Click calls `store.selectEntity(id)`. Clicking the current row does nothing; it never deselects | `candidates.length >= 2` |
| 1b | card | `character.card` | `card` | none | the character card, specified in ped.6 | a character exists |
| 2 | orders | `character.orders` | `orders` | none | `call off the order`, `make camp this turn` (existing buttons, disabled rules and titles), else `p.dim` "not yours to order" | a character exists |
| 3 | route | `character.route` | `route` | `{km} km` | moved from `entities.route` unchanged, drop-stop `×` while orderable | `store.route` |
| 4 | details | `character.details` | `details` | `{kind}` | name input and colour input (shown by their `may()` as today), pace row, sight row. Pace, sight and darkvision inputs stay DM-only through `may('entitySettings')`, so players see read rows | a character exists |
| 5 | inventory | `character.inventory` | `inventory` | as 0zz | `<InventoryList fold-key="character.inventory">`, same `ownInventory` rule | as today |
| 6 | adventure log | `character.log` | `adventure log` | `{km} km` | moved from `entities.log` unchanged; turn rows stay disabled for players | `adventureLog.length` |
| 7 | paths | `character.paths` | `paths` | none | the two checkboxes | always |
| 8 | hint `p` | none | none | none | existing `hint` computed | always |

- Fold keys are new, so they start open (0zz rule). They do not share fold state with `entities.*`.
- Spacing and the section look come from 0zz now and q55 later. This bead adds no new spacing values.
- Order rationale: the card (the panel's subject, foldable) comes first after the switcher, then the actions (orders, route). Reference data (details, inventory, log) comes after. Paths and the hint sit at the foot, as in the entities panel.

### Switcher row states
| state | rule |
|---|---|
| default | as `.entities` rows today |
| hover | as `.entities` rows today |
| current | `.here` style plus `aria-current="true"` |
| focus-visible | the existing button focus ring |
| disabled | none |

### Empty state (no own character)
Happens to a seated player whose token the DM removed, and to a local player view on a map with no player entities.
- Header: `character`, no pip. The panel still renders (row count unchanged).
- Body: only the `p.dim` line `no character of yours on this map · the DM can hand you one`, with `padding-top: 0.75rem`.
- No summary, no sections, no hint.

## Breakpoints
As tb0: phone at most 720px (sample 360x740), tablet 721 to 1023px (768x1024), desktop from 1024px (1280x800). Geometry is unchanged. On phone with no panel open, a player sees 2 header rows (character, caravan), and the dial sits under them through `--dial-top`.

## Tokens
None new. The existing tb0 and 0zz tokens (`--dock-row`, `--dock-gap`, `--section-row`) and the colours in `design/tokens.md` apply.

## Copy (English only, lowercase voice)
New visible text:
- section titles `your characters`, `orders`, `details` (and `card`, from ped.6)
- the empty-state line `no character of yours on this map · the DM can hand you one`
- the fallback header `character`

Other titles reuse 0zz words (`route`, `inventory`, `adventure log`, `paths`). The hint copy is unchanged ("click a hex to put the entity there" and so on).

## Accessibility
- The panel is the tb0 APG disclosure. Its accessible name is the header text: the character's name, or `character`. Sections use the 0zz disclosure.
- Tab order, player view: character header, then its body in the table order above (the switcher rows, then the card section per ped.6, then the order buttons, and so on), then the caravan header.
- The switcher marks the current row with `aria-current="true"`; colour is not the only cue.
- The pip is `aria-hidden` decoration. The name carries the meaning.
- Contrast: existing inks only (see tokens.md).
- Target sizes: unchanged. Headers 40/44px; section rows 32/40px.
- Reduced motion: no motion added.
- No images.

## Tests
- `permissions.test.ts`: `allowed(DM, 'entityList')` is true. `PLAYER` is false. `{ role: 'player', plays: ['a'] }` is false.
- `hexMap.test.ts`, in the side-panels describe:
  1. `setPanelOpen('character', true)` with entities open leaves only character open.
  2. `panelGone('entities', 'character')` with entities open and nothing remembered opens character.
  3. `panelGone('character', 'entities')` opens entities.
- Dock row count: a pure helper, for example `dockPanels({ shapesWorld, forPlayers, caravan, details })` returning the ordered list, tested for:
  - DM full: 4 rows
  - DM view with no world rights, no caravan and no hex: entities only, 1 row
  - player, with and without a caravan: 2 rows (ped.7 renders the caravan header always)

  `--dock-rows` is its length. This covers the "matches rendered headers" check. Suggested only: any test that pins the count per role is fine.
- Store test for the subject rule: with `dmView = false`, `seatedIds = ['b', 'c']` and `selectedId = 'a'`, `selectedEntity` is `b`. This already holds today; add it only if missing. For the local view, MapView's watch selects the first player-owned entity. That is UI-review territory, not a store test.

## UI review checklist
At 360, 768 and 1280:
- **DM**: dock exactly as tb0 and 0zz (world, entities, caravan, details).
- **Local player view** (debug toggle):
  - The dock starts with character open on desktop and tablet, and none on phone.
  - No entities panel.
  - Toggling back to DM opens entities.
- **Player with one character**: no switcher. Header shows pip and name. Route, orders, details, inventory, log and paths all work.
- **Player with two characters** (DM assigns a second): the switcher shows both, picking one switches the header and every section, and map clicks order the picked one.
- **Caravan**: the caravan header is always in slot 2, collapsed at start (ped.7).
- **Card**: the ped.6 checklist runs in the same review.
- **Empty state**: DM removes the player's only entity.
- **Phone**: the dial sits right under the 2 headers; `--dock-rows` matches what is drawn.

## Assets
None.

## Decisions (user, 2026-11-14, bead hexcrawl_web-ped.8)
1. Ship together with ped.6: no interim character-panel shell. Players keep the entities panel until the character panel with the card lands.
2. Gate: a DM-only `'entityList'` permission read through `may()` (default).
3. Several characters: a `your characters` list section, shown at 2+ (default).
4. No roster of other entities for players; map tokens only.
5. Local player view: the DM's selection jumps to the first player-owned entity, not restored on the way back (default).
6. Panel title: pip and character name, `character` when there is none (default).
7. Hex details for players: unchanged, never shown (default). A read-only player hex details panel would be a new bead if wanted.
8. Empty copy: `no character of yours on this map · the DM can hand you one` (default).
