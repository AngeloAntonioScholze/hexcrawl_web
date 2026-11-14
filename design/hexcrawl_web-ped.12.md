# hexcrawl_web-ped.12: sub-panel columns (entity panels open to the right of the dock)

Status: spec, 2026-11-14. **Spec only.** Defaults that wait on the user are marked `PENDING Qn`; the questions are at the end.

Reference: the user's sketch `docs/reference/sub-panel-columns-sketch-2026-11-14.png`. Three columns, all aligned at the top. Column 1 is the full-height dock (tb0). Columns 2 and 3 are as tall as their content.

Written against main `e6419b2`, with the card components as built on main `342a1ec`:
- `CharacterCard.vue` (props `entity`, `pickable`, `headingLevel`; emit `bust`; `--card-width: 18rem`)
- `StatHexagon.vue`, `CaravanCardBody.vue`, `ShipCardBody.vue`, `BustPicker.vue`
- the DM-only `.bust-row` in `CaravanPanel.vue`

The specs it builds on:
- `design/hexcrawl_web-tb0.md`: the dock column, its geometry and the overlay offsets
- `design/hexcrawl_web-0zz.md`: `PanelSection`, fold keys
- `design/hexcrawl_web-ped.7.md`: the player caravan info panel (built)
- `design/hexcrawl_web-ped.5.md`, `design/hexcrawl_web-ped.6.md`: the player dock (not built)
- `design/hexcrawl_web-1a1.10.md`, `design/hexcrawl_web-tdj.4.md`: the card and its mounts. This bead **moves the DM card mounts out of the dock and into the columns** (see "Card mounts: tdj.4 amendment").

Not in this spec: the restyle (q55), motion (17y; columns open and close instantly here), and new store actions.

## Goal
For the DM at a desktop. The DM picks an entity in the dock's list and gets its whole sheet beside the dock: card, details, inventory, log. Something inside that entity (a rider, a merchant) opens one column further right. The list, route and orders stay in view in the dock the whole time. The one action: **open an entity from the list and read or edit its sheet without losing the list**.

## Terms
- **Level 0**: the dock (tb0 column, `.panels`).
- **Level 1**: column 2. An **entity sub-panel** for a party, npc, caravan or ship.
- **Level 2**: column 3. Something inside the level-1 entity:
  - a **rider** of a caravan or ship (itself an entity sub-panel)
  - a **merchant** of a caravan (a merchant sub-panel)
- **Stack**: the open sub-panels in order, `[]`, `[level 1]` or `[level 1, level 2]`. Opening something at a level drops everything deeper.

## Column modes (by window width)
How many levels show side by side. One rule covers every width: **show the dock plus as many of the deepest open levels as fit**. A hidden parent is reached through a back control (see Header).

| mode | width | what shows | sample |
|---|---|---|---|
| three-up | `min-width: 1600px` | dock, level 1, level 2 side by side | 1600 x 900 |
| two-up | 1280 to 1599px | dock and the **deepest** open level. With level 2 open, level 1 is hidden behind back (PENDING Q2) | 1280 x 800 |
| stacked | up to 1279px: phone 360, tablet 768, small desktop 1024 | only one level: the deepest open one, **in the dock's own box**. The dock is hidden while a sub-panel is open (PENDING Q1) | 360 x 740, 768 x 1024 |

Why these widths: each column needs 21rem plus a 0.75rem gap (348px). The DM toolbar needs about 320px of free band between the columns and the minimap reserve (204px):
- two-up: 728 + 320 + 204 = 1252px, so 1280 works
- three-up: 1076 + 320 + 204 = 1600px

Below 1280 a column beside the dock would leave the toolbar under 100px of band. Put the mode in a pure helper `columnMode(width): 1 | 2 | 3` and a `visibleLevels(stackLength, mode)` that returns the levels to render (for example `[0, 2]` in two-up with 2 open). MapView reads `innerWidth` on `resize`, as `phone()` does today.

## Layout

### Tokens (add to `design/tokens.md` "Layout" and `:root` in `src/style.css` in the build change)
| token | value | use |
|---|---|---|
| `--subpanel-width` | `21rem` (336px) | width of columns 2 and 3. Content is 304px after the `0 1rem` body padding, and 296px with the thin scrollbar, so the 288px card never shrinks |
| `--column-gap` | `0.75rem` | gap between dock and column 2, and between column 2 and column 3. It is the same value as the gap already in `--dock-reserve` |
| `--sub-columns` | `0` | how many sub-panels show **beside** the dock (0, 1 or 2). MapView sets it inline on `<main>` from `visibleLevels`. It is always 0 in stacked mode |
| `--dock-reserve` (changed) | `calc(1rem + min(var(--panel-width), 100vw - 2rem) + var(--column-gap) + var(--sub-columns) * (var(--subpanel-width) + var(--column-gap)))` | the free map area's left edge, now after the open columns |

`--dock-reserve` is 380px with no column open (as today), 728px with one and 1076px with two.

### Columns 2 and 3 (`.subpanels` in MapView.vue, after `.panels` in the DOM)
| | two-up / three-up | stacked |
|---|---|---|
| container | `position: absolute; top: 1rem; left: calc(1rem + min(var(--panel-width), 100vw - 2rem) + var(--column-gap)); bottom: 1rem; display: flex; gap: var(--column-gap); align-items: flex-start; pointer-events: none; z-index: 2` | takes the dock's box: tb0 geometry for `.panels` (desktop/tablet `top/left/bottom: 1rem`, width `min(var(--panel-width), 100vw - 2rem)`; phone `0.5rem` inset, `calc(100vw - 1rem)` wide, z-index 11) |
| one sub-panel | `width: var(--subpanel-width); max-height: 100%; pointer-events: auto` | full box width, `max-height: 100%` |
| height | content height, top-aligned (sketch). Never taller than the window minus 2rem; then its body scrolls | same |
| dock | stays as tb0 | `.panels` gets `visibility: hidden` and `inert` while a sub-panel shows; it comes back when the stack empties |
| phone fill | n/a | opaque `var(--surface-raised)`, as tb0's open phone panel |

A sub-panel uses the tb0 panel anatomy: `aside`, `display: flex; flex-direction: column; min-height: 0; overflow: hidden`, the panel's border, radius, background and shadow. Its header is `flex: none; min-height: var(--dock-row)`. Its body is `flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 0 1rem 0.75rem`.

### Overlays (desktop, two-up and three-up)
Everything still reads `--dock-reserve`, so the dial and toolbar formulas from tb0 stay **unchanged**. Only the value moves.

| | 1280, one column (reserve 728) | 1600, two columns (reserve 1076) |
|---|---|---|
| column(s) | 380 to 716 | 380 to 716, 728 to 1064 |
| dial (`left: min(max(50%, reserve + 0.75rem + 8.1rem), 100% - 15.1rem)`) | 740 to 1000 | 1088 to 1348 |
| toolbar band (reserve to `100% - --minimap-reserve`) | 728 to 1076 (348px) | 1076 to 1396 (320px) |
| minimap | 1088 to 1264 | 1408 to 1584 |
| SessionBar | **lowered**: `top: 9.5rem` (the tablet rule), below the dial's foot at 143px | lowered |

- **SessionBar**: MapView adds a class `lowered` while `--sub-columns >= 1`. With a column open, the dial moves right into the bar's top-right spot, so the bar steps down under it, as it already does on tablet. Its left edge (at least `100% - 12px - 22rem`) clears the last column at both samples.
- **Toolbar**: `.tools` already wraps (tb0). At 320px the five tools fit on one row; the paint swatches wrap.
- **Stacked mode**: `--sub-columns` is 0, so every overlay sits exactly as tb0 places it today. On phone the sub-panel covers the dial, session bar and toolbar, as an open tb0 panel does.

## What lives where (DM)

### Dock (level 0), DM, after this bead
| # | panel | change |
|---|---|---|
| 1 | world | unchanged |
| 2 | entities | slimmed, see below |
| 3 | caravan | **removed from the DM dock**: a caravan opens as a level-1 sub-panel (PENDING Q4). `rendered.caravan` becomes `forPlayers` (ped.7 stays for players) |
| 4 | hex details | unchanged |

Entities panel body, top to bottom:
| block | foldKey | contents |
|---|---|---|
| summary `dl` | none | turn, standing, headed (unchanged) |
| list | `entities.list` | unchanged rows plus the open control (see "Opening"), add row, remove, played by, `players may plan past one turn` |
| route | `entities.route` | unchanged |
| orders | `entities.orders` (new key) | `call off the order`, `make camp this turn`, else `p.dim` "not yours to order". These were the buttons at the foot of `entities.selected`. They stay in the dock because they act on map orders, like route |
| paths | `entities.paths` | unchanged (view toggles for the whole map) |
| hint `p` | none | unchanged |

Moved out of the dock: `entities.selected` (name, colour, pace, sight, darkvision), `entities.inventory` and `entities.log`. The `entities.selected` key is retired.

### Entity sub-panel (level 1, and level 2 for a rider)
One component, `EntitySubPanel.vue` (new), props `entity`, `level` and `parentName`. Body top to bottom, by kind:

| # | block | party, npc | ship | caravan |
|---|---|---|---|---|
| 0 | card (tdj.4), never folds | `CharacterCard` + `StatHexagon` | `CharacterCard` + `ShipCardBody` | `CharacterCard` + `CaravanCardBody` |
| 1 | details | name, colour, pace, sight, darkvision rows, moved unchanged from `entities.selected` with the same `may()` gates | same | same |
| 2 | supplies | none | none | `CaravanSupplies` |
| 3 | inventory | `InventoryList` (today's `ownInventory` rule) | same | `InventoryList` |
| 4 | riders | none | rider rows that open level 2 | rider rows that open level 2 |
| 5 | merchants | none | none | compact merchant rows that open level 2, plus DM `add merchant` |
| 6 | adventure log | moved unchanged from `entities.log`, for this entity | same | same |

Fold keys group by kind, so folding a section folds it for every entity of that kind:
- party and npc: `person.details`, `person.inventory`, `person.log`
- ship: `ship.details`, `ship.inventory`, `ship.riders`, `ship.log`
- caravan: `caravan.details`, `caravan.supplies`, `caravan.inventory`, `caravan.riders`, `caravan.merchants`, `caravan.log`. The existing caravan keys keep their stored folds.

**Section ids** must stay unique when two entity sub-panels show at once (a ship with a party rider). `PanelSection` gets an optional `scope` prop: ids become `sec-{scope}-{foldKey with . as -}`, and the sub-panel passes `scope = 'l' + level`. Fold state stays keyed by `foldKey` alone.

Section titles: `details`, `supplies`, `inventory`, `riders`, `merchants`, `adventure log`. Meta as 0zz: inventory `{count} · {wt} wt`, riders and merchants `{count}`, log `{km} km`, details `{kind}`.

**Rider rows** (caravan and ship): pip, name, kind, `›`.
- A click selects the rider (`store.selectEntity`, as today) and opens it at level 2.
- `aria-current="true"` marks the row that is open at level 2.

**Compact merchant rows** (caravan), replacing the inline catalog in `caravan.merchants`:
- Layout: icon, name (with type label when different, as today), `lv {n}`, `›`. The level stepper and remove move to the merchant sub-panel.
- A click opens the merchant at level 2.
- `nothing offered yet` and the catalog no longer show here.
- Empty: `no merchants in the crew` (existing). The DM `add merchant` button and dialog stay here unchanged.

### Merchant sub-panel (level 2), `MerchantSubPanel.vue` (new)
Merchants have no card (PENDING Q6). Header: the merchant's icon (`aria-hidden`) and name. Body:

| # | block | contents |
|---|---|---|
| 0 | summary `dl`, never folds | `type`: the type label; `level`: `lv {n}`, with the DM stepper `−` / `+` (existing buttons, labels and limits); `with`: the caravan's name |
| 1 | blurb `p.dim` | `MERCHANT_INFO[type].blurb` (today only a `title` tooltip) |
| 2 | offers section, foldKey `merchant.offers`, title `offers`, meta `{count}` | one row per unlocked service: name on the left, price on the right (existing `entry.price`). Under them, the description `entry.description` in `--text-meta`, `--ink-dim`, up to 3 lines (`-webkit-line-clamp: 3`). Empty: `nothing offered yet` |
| 3 | DM only, at the foot | `let {name} go` button (existing `removeMerchant`), full width, with the existing danger look if q55 has landed, else the plain button |

Read-only for players. No new store actions.

## Header (sub-panels)
- `<header>` with `<h2 class="title" :id="'col-' + level + '-title'" tabindex="-1">`. Inside: the pip (entities) or icon (merchants), then the name with ellipsis. The panel `.title` style comes from tb0 and q55. The header is **not** a fold toggle: sub-panels do not fold.
- One control, decided by whether the parent is in view:

| parent in view? | control | label |
|---|---|---|
| yes (three-up, or two-up at level 1) | `×` at the right end, a `var(--dock-row)` square | `aria-label="close {name}"`, `title="close"` |
| no (two-up at level 2, every stacked level) | `‹` at the left end, before the title, a `var(--dock-row)` square | `aria-label="back to {parent name}"`, where the parent at level 1 is `entities` |

  Both call `store.closeSubPanel(level)`.
- Button states: default `--ink-dim`; hover `--ink`; focus-visible the tb0 ring (`outline: 2px solid` accent, `outline-offset: -2px`); active, as other panel buttons. Never disabled.
- The `aside` is `aria-labelledby` its title. In stacked mode, closing the last sub-panel brings the dock back.

## Opening (PENDING Q3)
- **Entities list row** (dock):
  - In two-up and three-up, a click selects the entity (as today) **and** opens it at level 1.
  - In stacked mode, a click only selects it. Opening it would hide the list and the route the DM just picked from.
- **Open control on every list row, at every width**: a `›` button at the row's right end. It is 2rem square (2.5rem on phone), with `aria-label="open {name}"` and `title="open"`. It opens without changing the selection.
  - Keyboard users always have it; in stacked mode it is the only way in.
  - The row button and the `›` button are siblings in the `li`, never nested.
- **Riders and merchants** (inside a level-1 sub-panel): a click opens at level 2. A rider click also selects the rider.
- Opening at a level replaces whatever was at that level and closes everything deeper. Opening the entity already shown at that level keeps the stack as is.
- Nothing opens a column by itself: no hex click, map click, selection from elsewhere, turn change or role switch.

## Closing
| event | result |
|---|---|
| `×` or `‹` on a sub-panel | closes that level and deeper |
| `Escape` with focus inside a sub-panel (and not inside an open `<dialog>`, which handles its own Escape) | closes the level that holds focus, and deeper |
| a different entity opened at level 1 | level 1 replaced, level 2 closed |
| the level-1 entity is removed | the stack empties |
| a level-2 rider gets off the level-1 carrier, or is removed | level 2 closes |
| a level-2 merchant is removed (`let … go`) | level 2 closes |
| `store.dmView` changes (debug view toggle, or a guest becoming a player client) | the stack empties |
| window resize across a mode boundary | the stack stays; only which levels show changes |
| dock panel fold or open (tb0 one-open rule) | no effect on the columns |

Focus after a close: back to the control that opened the closed level (the `›` button, or the row) when it still exists. Else the parent level's title. Else the entities header (tb0 fallback).

## Keyboard path
- DOM order: `.panels` (dock), then `.subpanels`, level 1 before level 2. Tab runs dock → column 2 → column 3 → the rest of the page. In stacked mode the dock is `inert`, so Tab stays in the shown sub-panel.
- Opening through a user action (row, `›`, rider or merchant row) moves focus to the new sub-panel's `h2` (`tabindex="-1"`). The screen reader then announces the entity's name, and the next Tab reaches the header control, then the card.
- Close and back return focus as above. Escape closes, as above.
- No arrow-key navigation between columns.

## Store (`src/stores/hexMap.ts`): view state, never saved, no `may()` guard
```ts
type SubPanel =
  | { kind: 'entity'; id: string }
  | { kind: 'merchant'; id: string }
const subPanels = ref<SubPanel[]>([])                              // length 0..2
openSubPanel(panel: SubPanel, parentLevel: 0 | 1): void            // subPanels = [...subPanels.slice(0, parentLevel), panel]; ignored if parentLevel > subPanels.length
closeSubPanel(level: 1 | 2): void                                  // subPanels = subPanels.slice(0, level - 1)
```
- Validity is checked in a computed or watch in MapView, which calls `closeSubPanel` on the first invalid level:
  - level 1: the entity exists
  - level 2 entity: it rides the level-1 entity
  - level 2 merchant: it belongs to the level-1 caravan
- A level-2 panel needs a level-1 caravan or ship. A merchant at level 1, or a rider without a carrier, is never opened.

## Card mounts: tdj.4 amendment
tdj.4's DM mounts move into the columns. The card's contract, sizes and slot bodies (1a1.10, tdj.3) are unchanged.

| tdj.4 mount (as specced) | after ped.12 |
|---|---|
| 1. top of the DM caravan panel body | **row 0 of the caravan's entity sub-panel** (level 1, or level 2 for a caravan riding a ship), with `CaravanCardBody`. The `heading-level` is 3 under the sub-panel's `h2` |
| 2. top of `entities.selected` in the dock | **row 0 of the entity sub-panel** for party, npc and ship (level 1, or level 2 for a rider), with `StatHexagon` or `ShipCardBody`. `heading-level="3"`. The dock shows no card |
| player: ped.7 card slot in the dock caravan panel | unchanged (PENDING Q5) |
| player: ped.6 character panel | unchanged (PENDING Q5) |

- The DM `.bust-row` (with its `BustPicker`) that main `342a1ec` has in `CaravanPanel.vue` does not move into the sub-panel. The card's own oval is the bust picker for every kind (`pickable = store.may('entitySettings', entity)`), as tdj.4 already removes that row.
- Key the card on the entity id, as tdj.4 does.
- The "never twice" rule holds by construction: a caravan's card shows only in its own sub-panel.
- Spacing stays as tdj.4 has it: `.card { margin-block: 0.25rem 0.75rem }`. The card may be taller than the visible column; the body scrolls (tdj.13).
- On a 1280x800 desktop a column is at most 768px tall, so a 652px card plus the header fills most of it. Accepted, as tdj.13.

The tdj.4 spec needs this amendment before it builds (cards epic manager).

## Players
Default (PENDING Q5): players get **no sub-columns** in this bead.
- The player dock stays as ped.5, ped.6 and ped.7 specify: character panel (with the ped.6 card section) and caravan info (with the tdj.4 card slot).
- The stack is emptied on every `dmView` change, and nothing in the player dock opens a sub-panel.
- `--sub-columns` stays 0 for players, so overlays sit as tb0.

## Hex details
Stays in the dock (slot 4). Unchanged.

## States
| state | shows |
|---|---|
| nothing open | tb0 dock only, overlays as today |
| level 1 open | the entity sub-panel beside the dock (two-up, three-up) or in the dock's box (stacked) |
| level 2 open | three-up: both columns. Two-up: dock and level 2, with `‹ back to {level 1 name}`. Stacked: level 2 alone, with back |
| empty sections | each section keeps its own empty line ("carrying nothing", "nobody aboard", "no merchants in the crew", "nothing offered yet") |
| loading, error | none (synchronous store data) |
| entity hidden or removed while open | closes per "Closing" |

## Copy (English only, lowercase)
New visible text:
- section titles `details`, `supplies`, `offers`, and `orders` in the dock
- `type`, `level`, `with` as dt labels in the merchant summary
- `let {name} go` as visible button text (today it is only the `×` button's aria-label)

New accessible names:
- `open {name}`
- `close {name}`
- `back to {parent name}`, where the parent of level 1 in stacked mode is `entities`

## Accessibility
- Contrast: existing inks only; the measured pairs are in `tokens.md`. The `‹` `×` `›` glyphs use `--ink-dim` (5.2:1 on `--surface-raised`) and `--ink` on hover.
- Targets: header controls 40px (44px on phone). The row `›` is 32px (40px on phone).
- `aria-current="true"` on the list row whose entity is open at level 1, and on the rider row open at level 2. Colour is not the only cue.
- Focus rules: see "Keyboard path" and "Closing".
- Reduced motion: nothing animates in this bead.
- Images: the card art and alt text follow 1a1.10. The merchant icon is `aria-hidden`; the name carries the meaning.

## Tests
- Store, in a `describe('the sub-panel columns')`:
  1. `openSubPanel(entity a, 0)` gives `[a]`.
  2. Then `openSubPanel(merchant m, 1)` gives `[a, m]`.
  3. `openSubPanel(entity b, 0)` with `[a, m]` gives `[b]`.
  4. `openSubPanel(entity r, 1)` with `[a, m]` gives `[a, r]`.
  5. `openSubPanel(x, 1)` with `[]` changes nothing.
  6. `closeSubPanel(2)` with `[a, m]` gives `[a]`. `closeSubPanel(1)` gives `[]`.
- Pure helpers:
  - `columnMode` at 360, 768, 1024, 1279, 1280, 1599 and 1600
  - `visibleLevels` for stack lengths 0, 1 and 2 in each mode, for example: three-up with 2 open gives `[0, 1, 2]`; two-up gives `[0, 2]`; stacked gives `[2]`; stacked with 0 open gives `[0]`
  - `--sub-columns` is the count of levels above 0 in that list in two-up and three-up, and 0 in stacked mode
- Validity: removing the level-1 entity empties the stack; a rider leaving its carrier closes level 2; removing a merchant closes level 2.
- `PanelSection` with `scope`: ids carry the scope; fold state is shared by key.

## UI review checklist
As DM, unless noted:
- **1600x900**:
  - Open a caravan from the list, then a merchant: three columns, all aligned at the top, columns 2 and 3 as tall as their content.
  - Dial, toolbar, minimap and SessionBar overlap no column.
  - Then open a rider: the merchant column becomes the rider.
- **1280x800**:
  - One column beside the dock, with overlays clear.
  - Opening a merchant shows dock plus merchant with `‹ back to {caravan}`, and back returns to the caravan.
  - SessionBar is lowered under the dial.
- **1024, 768, 360**:
  - A row click only selects. The `›` button opens the sub-panel in the dock's box, and the dock is hidden and inert.
  - `‹ back to entities` brings the dock back, with focus on the row's `›`.
  - Level 2 drills in further, and back steps out one level.
- **Escape** closes the focused level. With the bust picker open, Escape closes only the dialog.
- **Removals**:
  - Remove the open entity: its columns close and focus lands on the entities header.
  - Let the open merchant go: column 3 closes.
- **Card**: in column 2 for every kind, never in the dock. A caravan card shows once.
- **Player view** (debug toggle): no columns. The player dock is as ped.5, ped.6 and ped.7 specify, and switching views empties the stack.
- **Tab**: from the dock's last control into column 2, then column 3.

## Assets
None new. The card art comes from 1a1.10. Reference added: `docs/reference/sub-panel-columns-sketch-2026-11-14.png`, the user's sketch.

## Open questions (PENDING user answer)
1. **Narrow screens (phone 360, tablet 768, small desktop up to 1279).** There is no room for three columns.
   - Options:
     - (a) **stacked**: one level at a time, in the dock's own box, with a back control; the dock comes back when the stack empties
     - (b) a bottom sheet over the map for the sub-panel, with the dock still visible above it
     - (c) no sub-panels below 1280: entity sheets stay inside the dock, as tdj.4 first planned (two layouts to build and keep)
   - Default **(a)**: one pattern at every width (like a navigation stack), no second layout, and the card always gets a full panel width.
   - Waits on it: the stacked-mode layout, and the tdj.4 mounts below 1280.
2. **Mid desktop (1280 to 1599) with column 3 open.**
   - Options:
     - (a) dock and the deepest level; level 1 hides behind `‹ back`
     - (b) levels 1 and 2; the dock hides
     - (c) all three side by side from 1280, with the dial and toolbar hidden while three are open (fails the bead's "nothing overlaps" check as written)
     - (d) another threshold for three-up than 1600
   - Default **(a)**: the dock (list, route, orders) is the DM's home and stays visible.
   - Waits on it: `visibleLevels`.
3. **What opens column 2.**
   - Options:
     - (a) a list-row click selects and opens in two-up and three-up; only selects in stacked mode; a `›` open button on every row at every width
     - (b) only the `›` button opens; a row click only selects, as today
     - (c) every selection opens, from anywhere
   - Default **(a)**: on a desktop picking an entity shows its sheet at no cost to the dock; on narrow screens opening would hide the list just picked from.
   - Waits on it: entities list markup and the open rule.
4. **The DM's caravan panel.**
   - Options:
     - (a) it leaves the dock; a caravan opens as a level-1 sub-panel like any entity
     - (b) it stays in the dock as today, and column 2 for a caravan shows only its card and details
     - (c) both: the dock panel and the column
   - Default **(a)**: one place per entity, no duplicate sections, and the card shows once.
   - Waits on it: the CaravanPanel refactor, `rendered.caravan`, and tdj.4 mount 1.
5. **Players.**
   - Options:
     - (a) no sub-columns for players in this bead; ped.5, ped.6 and ped.7 as specified (card inside the character panel; ped.7 card slot)
     - (b) the player's own sheet (card, details, inventory, log) opens in column 2 from the character panel, with the same component as the DM; ped.5 and ped.6 respecced so the character panel keeps summary, switcher, orders, route, paths and hint
     - (c) as (b), plus ped.7's riders and merchants opening columns for players
   - Default **(a)**: the player dock has one character and one caravan, so there is little to drill into, and ped.5, ped.6 and ped.7 stay as decided.
   - Waits on it: the ped.6 spec and the player side of the tdj.4 mounts.
6. **A card for merchants.** Merchants are not entities and have no portrait field.
   - Options:
     - (a) no card: the merchant sub-panel opens with icon, name, type, level, blurb and offers
     - (b) a merchant card (a new saved portrait field on merchants, a new bead with the map-field touchpoints)
   - Default **(a)**: no new saved field, and the offers list needs the width a card would take.
   - Waits on it: merchant sub-panel row 0.
