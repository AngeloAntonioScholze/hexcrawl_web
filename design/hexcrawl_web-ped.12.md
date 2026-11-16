# hexcrawl_web-ped.12: sub-panel columns (entity panels open to the right of the dock)

Status: final spec, 2026-11-15. **Spec only.** The six open questions were answered by the user (decision beads ped.14 to ped.19); see "Decisions" at the end.

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

Not in this spec: the restyle (q55), motion (17y; columns open and close instantly here), new store actions, and **mounting any card**. ped.12 leaves an empty card slot as row 0 of every sub-panel. tdj.4 fills it for entities. ped.21 fills it for merchants. ped.12 does not import or edit `CharacterCard`, `StatHexagon`, `CaravanCardBody`, `ShipCardBody` or `BustPicker`.

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
| two-up | 1280 to 1599px | dock and the **deepest** open level. With level 2 open, level 1 is hidden behind back (ped.15) | 1280 x 800 |
| stacked | up to 1279px: phone 360, tablet 768, small desktop 1024 | only one level: the deepest open one, **in the dock's own box**. The dock is hidden while a sub-panel is open (ped.14) | 360 x 740, 768 x 1024 |

Why these widths: each column needs 21rem plus a 0.75rem gap (348px). The DM toolbar needs about 320px of free band between the columns and the minimap reserve (204px):
- two-up: 728 + 320 + 204 = 1252px, so 1280 works
- three-up: 1076 + 320 + 204 = 1600px

Below 1280 a column beside the dock would leave the toolbar under 100px of band. Put the mode in the pure helpers `columnMode(width): 1 | 2 | 3` and `visibleLevels(stackLength, mode)` in `useSubPanels.ts` ("Column state"). `visibleLevels` returns the levels to render (for example `[0, 2]` in two-up with 2 open). MapView reads `innerWidth` on `resize`, as `phone()` does today.

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
| 3 | caravan | **removed from the DM dock**: a caravan opens as a level-1 sub-panel (ped.17). `rendered.caravan` becomes `forPlayers`. `CaravanPanel.vue` keeps only its player branch (ped.7, unchanged). Its DM branch moves into the caravan's entity sub-panel; the DM `.bust-row` and its `BustPicker` dialog move as they are (see "Card slot") |
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
| 0 | card slot, never folds. **Empty in ped.12**; tdj.4 mounts the card here | (tdj.4: `CharacterCard` + `StatHexagon`) | (tdj.4: `CharacterCard` + `ShipCardBody`) | (tdj.4: `CharacterCard` + `CaravanCardBody`). ped.12 puts the DM `.bust-row` from `CaravanPanel.vue` here, moved as it is; tdj.4 deletes it as already specced |
| 1 | details | name, colour, pace, sight, darkvision rows, moved unchanged from `entities.selected` with the same `may()` gates. The handlers act on the sub-panel's `entity.id`, not `store.selectedId` | same | same |
| 2 | supplies | none | none | `CaravanSupplies` |
| 3 | inventory | `InventoryList` (today's `ownInventory` rule) | same | `InventoryList` |
| 4 | riders | none | rider rows that open level 2 | rider rows that open level 2 |
| 5 | merchants | none | none | compact merchant rows that open level 2, plus DM `add merchant` |
| 6 | adventure log | moved unchanged from `entities.log`, for this entity | same | same |

**Card slot** (row 0 of every sub-panel, entity and merchant): `<div class="card-slot">` as the first child of the body, before section 1. It is the one agreed place where tdj.4 (entities) and ped.21 (merchants) put the card, with tdj.4's `.card { margin-block: 0.25rem 0.75rem }`.
- ped.12 ships it empty: `.card-slot:empty { display: none }`, so no gap shows. The caravan's moved `.bust-row` is the only thing ped.12 puts inside it.
- `data-testid="card-slot"`, so tests and the UI review can find it.

**This entity, not the selection.** `›` and a row click select what they open (ped.28), but the open entity and the selection still part ways: a rider click selects the rider while its carrier stays open at level 1, and a map or token click selects without touching the columns. So the sub-panel never reads selection-bound getters:
- details handlers take `entity.id`
- `InventoryList` and `CaravanSupplies` already take an owner id
- the log needs `store.adventureLogFor(id)` and `store.hexesWalkedFor(id)`: today's `adventureLog`, `journey` and `hexesWalked` in `hexMap.ts` take `selectedId`. Make them functions of an id, and keep the existing computeds as calls on `selectedId`. These are getters, not actions, and the only `hexMap.ts` change in this bead.

Fold keys group by kind, so folding a section folds it for every entity of that kind:
- party and npc: `person.details`, `person.inventory`, `person.log`
- ship: `ship.details`, `ship.inventory`, `ship.riders`, `ship.log`
- caravan: `caravan.details`, `caravan.supplies`, `caravan.inventory`, `caravan.riders`, `caravan.merchants`, `caravan.log`. The existing caravan keys keep their stored folds.

**Section ids** must stay unique when two entity sub-panels show at once (a ship with a party rider). `PanelSection` gets an optional `scope` prop: ids become `sec-{scope}-{foldKey with . as -}`, and the sub-panel passes `scope = 'l' + level`. Fold state stays keyed by `foldKey` alone.

Section titles: `details`, `supplies`, `inventory`, `riders`, `merchants`, `adventure log`. Meta as 0zz: inventory `{count} · {wt} wt`, riders and merchants `{count}`, log `{km} km`, details `{kind}`.

**Rider rows** (caravan and ship): pip, name, kind, `›`.
- A click selects the rider (`store.selectEntity`, as today) and opens it at level 2.
- `aria-current="true"` marks the row that is open at level 2.

**Compact merchant rows** (caravan, DM only), replacing the inline catalog in the DM's `caravan.merchants`. The player caravan panel (ped.7) keeps today's priced catalog in `CaravanMerchants.vue` unchanged:
- Layout: icon, name (with type label when different, as today), `lv {n}`, `›`. The level stepper and remove move to the merchant sub-panel.
- A click opens the merchant at level 2.
- `nothing offered yet` and the catalog no longer show here.
- Empty: `no merchants in the crew` (existing). The DM `add merchant` button and dialog stay here unchanged.

### Merchant sub-panel (level 2), `MerchantSubPanel.vue` (new)
The user wants a merchant card (ped.19 (b)), but it is its own bead, **hexcrawl_web-ped.21**: it needs a new saved portrait field on merchants (map-field touchpoints) and waits on ped.12 and tdj.4. In ped.12 the merchant sub-panel has an **empty card slot** at row 0 and adds no portrait field, no schema change and no bust picker. Header: the merchant's icon (`aria-hidden`) and name. Body:

| # | block | contents |
|---|---|---|
| 0 | card slot, never folds | **empty in ped.12** (same `.card-slot` as entity sub-panels, hidden while empty); ped.21 mounts the merchant card here |
| 1 | summary `dl`, never folds | `type`: the type label; `level`: `lv {n}`, with the DM stepper `−` / `+` (existing buttons, labels and limits); `with`: the caravan's name |
| 2 | blurb `p.dim` | `MERCHANT_INFO[type].blurb` (today only a `title` tooltip) |
| 3 | offers section, foldKey `merchant.offers`, title `offers`, meta `{count}` | one row per unlocked service: name on the left, price on the right (existing `entry.price`). Under them, the description `entry.description` in `--text-meta`, `--ink-dim`, up to 3 lines (`-webkit-line-clamp: 3`). Empty: `nothing offered yet` |
| 4 | DM only, at the foot | `let {name} go` button (existing `removeMerchant`), full width, with the existing danger look if q55 has landed, else the plain button |

DM only in this bead (players get no columns, ped.18). The stepper and `let … go` keep their `may('merchants')` gate. No new store actions.

## Header (sub-panels)
- `<header>` with `<h2 class="title" :id="'col-' + level + '-title'" tabindex="-1">`. Inside: the pip (entities) or icon (merchants), then the name with ellipsis. The panel `.title` style comes from tb0 and q55. The header is **not** a fold toggle: sub-panels do not fold.
- One control, decided by whether the parent is in view:

| parent in view? | control | label |
|---|---|---|
| yes (three-up, or two-up at level 1) | `×` at the right end, a `var(--dock-row)` square | `aria-label="close {name}"`, `title="close"` |
| no (two-up at level 2, every stacked level) | `‹` at the left end, before the title, a `var(--dock-row)` square | `aria-label="back to {parent name}"`, where the parent at level 1 is `entities` |

  Both call `useSubPanels().close(level)`.
- Button states: default `--ink-dim`; hover `--ink`; focus-visible the tb0 ring (`outline: 2px solid` accent, `outline-offset: -2px`); active, as other panel buttons. Never disabled.
- The `aside` is `aria-labelledby` its title. In stacked mode, closing the last sub-panel brings the dock back.

## Opening (ped.16)
- **Entities list row** (dock):
  - In two-up and three-up, a click selects the entity (as today) **and** opens it at level 1.
  - In stacked mode, a click only selects it. Opening it would hide the list and the route the DM just picked from.
- **Open control on every list row, at every width**: a `›` button at the row's right end. It is 2rem square (2.5rem on phone), with `aria-label="open {name}"` and `title="open"`. It opens **and selects** the entity (ped.28): `store.selectEntity(id)`, then open at level 1. It never clears the selection, unlike today's row click on the already-selected row (`pick` in MapView toggles to none).
  - Keyboard users always have it; in stacked mode it is the only way in, and it selects there too.
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
- DOM order: `.panels` (dock), then `.subpanels`, level 1 before level 2. Tab runs dock → column 2 → column 3 → the rest of the page. In stacked mode the dock is `inert`, so Tab skips it. Tab is not trapped in the sub-panel: the overlays still on screen (dial, toolbar, session bar) stay reachable, as they are with the dock open today.
- Opening through a user action (row, `›`, rider or merchant row) moves focus to the new sub-panel's `h2` (`tabindex="-1"`). The screen reader then announces the entity's name.
  - With `×` (parent in view), the next Tab reaches `×`, then the first control in the body (the card, once tdj.4 mounts it).
  - With `‹` (back mode: stacked, and two-up at level 2), `‹` comes before the title in the DOM and is reached with Shift+Tab. The next Tab goes to the first control in the body.
- Close and back return focus as above. Escape closes, as above.
- No arrow-key navigation between columns.

## Column state (`src/composables/useSubPanels.ts`, new): view state, never saved, no `may()` guard
It lives outside `hexMap.ts` (a hot spot) because nothing but the panels reads it and it is never saved or synced. Pure functions plus one module-level `ref`, like `useSectionFolds`:
```ts
type SubPanel =
  | { kind: 'entity'; id: string }
  | { kind: 'merchant'; id: string }
type ColumnMode = 1 | 2 | 3                                        // stacked, two-up, three-up
columnMode(width: number): ColumnMode                               // <1280 → 1, <1600 → 2, else 3
visibleLevels(stackLength: number, mode: ColumnMode): number[]      // e.g. (2, 2) → [0, 2]; (2, 1) → [2]; (0, 1) → [0]
subColumns(levels: number[], mode: ColumnMode): 0 | 1 | 2           // levels above 0 beside the dock; 0 in stacked mode
openAt(stack: SubPanel[], panel: SubPanel, parentLevel: 0 | 1): SubPanel[]   // [...stack.slice(0, parentLevel), panel]; unchanged if parentLevel > stack.length or the same panel is already there
closeAt(stack: SubPanel[], level: 1 | 2): SubPanel[]                // stack.slice(0, level - 1)
firstInvalidLevel(stack: SubPanel[], world: { entityIds: Set<string>; carrierOf(id: string): string | null; merchantCaravan(id: string): string | null }): 1 | 2 | null
useSubPanels(): { stack: Readonly<Ref<SubPanel[]>>; open(panel, parentLevel): void; close(level): void; clear(): void }
```
- `firstInvalidLevel` rules:
  - level 1: the entity exists
  - level 2 entity: it rides the level-1 entity
  - level 2 merchant: it belongs to the level-1 caravan
- MapView watches it and calls `close` on the first invalid level. It also calls `clear` on every `store.dmView` change.
- A level-2 panel needs a level-1 caravan or ship. A merchant at level 1, or a rider without a carrier, is never opened.

## Card mounts: tdj.4 amendment
ped.12 builds no card. It leaves the empty `.card-slot` (row 0) in `EntitySubPanel.vue`, and tdj.4, which lands after ped.12, mounts the card into it. tdj.4's DM mounts move into the columns. The card's contract, sizes and slot bodies (1a1.10, tdj.3) are unchanged.

| tdj.4 mount (as specced) | after ped.12 |
|---|---|
| 1. top of the DM caravan panel body | **`.card-slot` of the caravan's entity sub-panel** (level 1, or level 2 for a caravan riding a ship), with `CaravanCardBody`. The `heading-level` is 3 under the sub-panel's `h2` |
| 2. top of `entities.selected` in the dock | **`.card-slot` of the entity sub-panel** for party, npc and ship (level 1, or level 2 for a rider), with `StatHexagon` or `ShipCardBody`. `heading-level="3"`. The dock shows no card |
| player: ped.7 card slot in the dock caravan panel | unchanged (ped.18) |
| player: ped.6 character panel | unchanged (ped.18) |
| (merchant) | not tdj.4: ped.21 mounts a merchant card into the merchant sub-panel's `.card-slot` |

- ped.12 moves the DM `.bust-row` (with its `BustPicker` dialog) from `CaravanPanel.vue` into the caravan sub-panel's `.card-slot`, as it is, so the DM keeps picking caravan busts until the card lands. tdj.4 deletes it: the card's own oval is the bust picker for every kind (`pickable = store.may('entitySettings', entity)`), as tdj.4 already specs.
- Key the card on the entity id, as tdj.4 does.
- The "never twice" rule holds by construction: a caravan's card shows only in its own sub-panel.
- Spacing stays as tdj.4 has it: `.card { margin-block: 0.25rem 0.75rem }`. The card may be taller than the visible column; the body scrolls (tdj.13).
- On a 1280x800 desktop a column is at most 768px tall, so a 652px card plus the header fills most of it. Accepted, as tdj.13.

The tdj.4 spec needs this amendment before it builds (cards epic manager).

## Players
Decided (ped.18): players get **no sub-columns** in this bead.
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
- `useSubPanels.test.ts`, in a `describe('the sub-panel columns')`:
  1. `openAt([], entity a, 0)` gives `[a]`.
  2. Then `openAt([a], merchant m, 1)` gives `[a, m]`.
  3. `openAt([a, m], entity b, 0)` gives `[b]`.
  4. `openAt([a, m], entity r, 1)` gives `[a, r]`.
  5. `openAt([], x, 1)` gives `[]`. `openAt([a, m], entity a, 0)` gives `[a, m]`.
  6. `closeAt([a, m], 2)` gives `[a]`. `closeAt([a, m], 1)` gives `[]`.
- Store getters: `adventureLogFor(id)` and `hexesWalkedFor(id)` for a non-selected entity match what `adventureLog` and `hexesWalked` give once it is selected.
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
  - A row click only selects. The `›` button selects and opens the sub-panel in the dock's box, and the dock is hidden and inert.
  - `›` on an unselected row (any width) selects it too: on return to the dock, that row is the selected one and route and orders follow it.
  - `‹ back to entities` brings the dock back, with focus on the row's `›`.
  - Level 2 drills in further, and back steps out one level.
- **Escape** closes the focused level. With the bust picker open, Escape closes only the dialog.
- **Removals**:
  - Remove the open entity: its columns close and focus lands on the entities header.
  - Let the open merchant go: column 3 closes.
- **Card slot**: every sub-panel has an empty `[data-testid="card-slot"]` as the first body child, with no visible gap. No card shows anywhere for the DM. The caravan sub-panel shows the `bust` row inside the slot, and its picker still works. No card or `.bust-row` remains in the dock. (The card itself is checked in tdj.4's review, the merchant card in ped.21's.)
- **Player view** (debug toggle): no columns. The player dock is as ped.5, ped.6 and ped.7 specify, and switching views empties the stack.
- **Tab**: from the dock's last control into column 2, then column 3.

## Assets
None new. The card art comes from 1a1.10. Reference added: `docs/reference/sub-panel-columns-sketch-2026-11-14.png`, the user's sketch.

## Decisions (user, 2026-11-15)
| q | bead | answer |
|---|---|---|
| 1. narrow screens (up to 1279px) | ped.14 | (a) **stacked**: one level at a time in the dock's box, with a back control; the dock is hidden and inert meanwhile and comes back when the stack empties |
| 2. 1280 to 1599 with level 2 open | ped.15 | (a) dock plus the deepest level; level 1 sits behind `‹ back`. Three-up from 1600px |
| 3. what opens column 2 | ped.16 | (a) a list-row click selects and opens in two-up and three-up, and only selects when stacked; a `›` open button on every row at every width |
| 4. the DM caravan panel | ped.17 | (a) it leaves the dock and becomes the caravan's level-1 sub-panel (card slot, supplies, inventory, riders, merchants, log). The player caravan info panel (ped.7) stays in the player dock |
| 5. players | ped.18 | (a) no columns for players in this bead; ped.5, ped.6 and ped.7 stay as specced |
| bust row until tdj.4 | ped.27 | (a) the DM `.bust-row` moves as it is into the caravan sub-panel's card slot; tdj.4 deletes it |
| does `›` select? | ped.28 | (b) yes: `›` opens **and** selects the entity, at every width |
| 6. merchant card | ped.19 | (b) a merchant card, built in its own bead **ped.21** (new saved portrait field; waits on ped.12 and tdj.4). ped.12 leaves the merchant sub-panel's card slot empty and adds no portrait field |

## Build slices
Four slices. Each builds and tests on its own. Every hot-spot file has one owner at a time: MapView.vue is edited by slice 2, then by slice 3 after slice 2 merges. `hexMap.ts` gets only the two getters in slice 3. HexCanvas.vue, scene.ts and messages.ts are not touched.

| # | slice | owns (new or edited) | depends on | tests and check |
|---|---|---|---|---|
| 1 | **Column state** (pure) | new `src/composables/useSubPanels.ts` + `useSubPanels.test.ts`: `SubPanel`, `columnMode`, `visibleLevels`, `subColumns`, `openAt`, `closeAt`, `firstInvalidLevel`, `useSubPanels()` | none | the store and helper cases under "Tests" (minus `PanelSection` and getters). No UI |
| 2 | **Column shell and layout** | `src/views/MapView.vue` (`.subpanels` container after `.panels`; `innerWidth` on `resize` into `columnMode`; `--sub-columns` inline on `<main>`; stacked mode: `.panels` `visibility: hidden` + `inert`; Escape; focus moves on open and close; validity watch; `clear` on `dmView` change; `aria-current` and the `›` open button on entities-list rows; row-click open rule); `src/style.css` `:root` tokens (`--subpanel-width`, `--column-gap`, `--sub-columns`, new `--dock-reserve`); `design/tokens.md` Layout; `src/components/SessionBar.vue` (`lowered` class); new `src/components/SubPanelFrame.vue` (the `aside`, header with `‹`/`×`, `h2` title, body slot, `.card-slot` first); new `src/components/SubPanelStack.vue` (renders the visible levels: entity → `EntitySubPanel`, merchant → `MerchantSubPanel`); **stub** `EntitySubPanel.vue` and `MerchantSubPanel.vue` that show only the frame and name | 1 | open, close, back and Escape at 1600, 1280, 1024, 768 and 360; overlay offsets from the "Overlays" table; DayNightDial.vue and DmToolbar.vue need no edit (they read `--dock-reserve`). Can open merchants only through a test, since merchant rows come in slice 4 |
| 3 | **Entity sub-panel content and dock slimming** | `src/components/EntitySubPanel.vue` (fills the stub: details, supplies, inventory, riders rows opening level 2, log, the moved `.bust-row` in the card slot); `src/components/PanelSection.vue` (`scope` prop); `src/components/CaravanPanel.vue` (DM branch removed, player branch unchanged); `src/views/MapView.vue` (remove `entities.selected`, `entities.inventory`, `entities.log` and their handlers; add `entities.orders`; `rendered.caravan = forPlayers`); `src/stores/hexMap.ts` (getters `adventureLogFor`, `hexesWalkedFor` only) + `hexMap.test.ts` | 2 (MapView edits after slice 2) | `PanelSection` scope test, getter tests, the dock and level-1 parts of the UI review. The caravan merchants section shows today's `CaravanMerchants` until slice 4 |
| 4 | **Merchant column (level 2)** | `src/components/MerchantSubPanel.vue` (fills the stub: empty card slot, summary with stepper, blurb, offers, `let {name} go`); new `src/components/MerchantRows.vue` (DM compact rows that open level 2, plus `add merchant`); `src/components/CaravanMerchants.vue` (player catalog only, or keeps both if the implementer finds that simpler, with the player rendering unchanged); one line in `EntitySubPanel.vue` to use `MerchantRows` for the DM | 2; the one `EntitySubPanel.vue` line after slice 3 | merchant rows, stepper and remove in the merchant column; removing the open merchant closes level 2; the 1600 and 1280 merchant cases in the UI review |

Slices 3 and 4 can run in parallel after slice 2: they share only that one `EntitySubPanel.vue` line, and whichever merges second adds it. The UI review runs once, after all four.
