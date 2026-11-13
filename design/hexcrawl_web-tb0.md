# hexcrawl_web-tb0: one left panel column, one panel open at a time

This spec covers layout and behaviour only. It leaves out:
- restyling (q55)
- folding sections inside panels (0zz)
- height animation (17y)
- the character card (tdj.4)

Where this spec names a style value, it is there to place things or to fix a size. It is not a visual change.

## Goal
For the DM and for players at every window size. The map is the screen, and the panels are a single drawer down the left edge. The user opens the one panel they need, and the rest stay one header row each. There is one action: **open a panel by its header**. Opening it folds whichever panel was open.

## Breakpoints
| name | range | sample |
|---|---|---|
| phone | `max-width: 720px` (the existing `NARROW`) | 360 x 740 |
| tablet | 721 to 1023px | 768 x 1024 |
| desktop | `min-width: 1024px` | 1280 x 800 |

Use `@media (max-width: 720px)` for phone and `@media (min-width: 721px) and (max-width: 1023px)` for tablet. Desktop is the base rule.

## Layout tokens
Add these to `:root` in `src/style.css`, next to `--panel-width`. q55 will move them into `design/tokens.md` when it creates that file.

| token | value | use |
|---|---|---|
| `--dock-gap` | `0.375rem` | vertical gap between panels in the column |
| `--dock-row` | `2.5rem` (phone `2.75rem`, a 44px touch target) | min-height of a panel header |
| `--dock-reserve` | `calc(1rem + min(var(--panel-width), 100vw - 2rem) + 0.75rem)`, which is 23.75rem (380px) on tablet and desktop | left edge of the free map area; the dial and toolbar position against it |
| `--minimap-reserve` | `calc(1rem + 176px + 0.75rem)`, which is 204px | right edge kept clear for the minimap on desktop |

`--dock-rows` is set inline on `<main>` by MapView. It is the number of panel headers being rendered (2 to 4, see "A panel stops rendering"). Only the phone dial and the phone session bar read it.

## The column (`.panels` in MapView.vue)
Order, top to bottom. This order is fixed and never changes with selection:
1. **world**: rendered only when `shapesWorld` (DM)
2. **entities**: always rendered
3. **caravan** (`<CaravanPanel />`): rendered while a caravan is shown
4. **hex details** (`<HexDetails />`): rendered for whoever `may('notes')` while a hex is selected

`<HexDetails />` moves from its current spot (absolutely placed on the right, in MapView's `v-if="!veiled"` template) into `.panels`, after `<CaravanPanel />`. Its own `position: absolute`, `top`, `right`, `bottom` and phone `@media` block are removed. Its comment about mirroring the left panel goes too. It gets `class="panel"` like the others, so the shared `:where(.panel)` rules apply to it.

### Geometry
| | desktop / tablet | phone |
|---|---|---|
| position | absolute; `top: 1rem; left: 1rem; bottom: 1rem` | absolute; `top/left/right/bottom: 0.5rem` |
| width | `min(var(--panel-width), 100vw - 2rem)`, which is 22rem (352px) | `calc(100vw - 1rem)`, which is 344px at 360 |
| direction | `flex-direction: column; gap: var(--dock-gap); align-items: stretch` | same |
| z-index | `2` | `11` (above the toolbar and session bar, both `10`) |
| pointer | `pointer-events: none` on the column, `auto` on each panel (as today) | same |

The column's `bottom` is only its maximum. It still lets the pointer through, so map space under it stays clickable until a panel's box actually reaches there.

The phone rule `height: calc(100% - 7rem)` and the desktop row layout go.

### A panel (`aside.panel`, in all four)
- Collapsed and open panels are both **full column width**. Drop the `.collapsed { width: auto; max-height: none; overflow: visible }` rule, so the stack reads as one drawer and every header is the same size of target.
- The panel box is `display: flex; flex-direction: column; min-height: 0; overflow: hidden`, with the existing border, radius and background. Its padding becomes `0`.
- The **header** is `flex: none` and has `min-height: var(--dock-row)`. Its horizontal padding lives in the header button (see Header).
- The **body** is `flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain`, with the existing thin scrollbar, and `padding: 0 1rem 0.75rem`. The scroller moves from the `aside` to the body.
- Collapsed panel: `flex: none`, and the body is hidden with the existing `v-show`. The row is `var(--dock-row)` plus a 2px border.
- Open panel: `flex: 0 1 auto`. It is as tall as its content, but never taller than the column's leftover height.

### Scroll behaviour when the open panel is tall
- The column itself never scrolls. Every header stays visible: the ones above the open panel, and the collapsed ones below it, which sit right under it at the foot of the column.
- Only the open panel's body scrolls. Wheel and touch scrolling stay inside it (`overscroll-behavior: contain`) and never pan the map.
- The `.journey` list keeps its own `max-height: 11rem` scroller inside the body. 0zz may revisit that.
- Scroll position is neither saved nor restored across a fold. Whatever the browser does is fine.
- tdj.4 room: the character card goes at the top of the caravan **body** and inside the entities **body**, and it scrolls with the body. Nothing in this spec pins it. Do not cap the body height for it.

### Phone
- When a panel is open on phone, its background is opaque `var(--surface-raised)`, not the 88% mix, because it covers the dial, session bar and toolbar while it is open. Folding it gives them back.
- When no panel is open, the column is just its 2 to 4 header rows at the top.

## Header (all four panels)
- Structure: `<header>` holding `<h2 class="title"><button type="button" class="head" ...>`. Inside the button:
  - world: `world`
  - entities: `entities`
  - caravan: pip, then caravan name with ellipsis, as today
  - hex details: `hex {key}`
  - then the chevron `<span aria-hidden="true">▾</span>` at the right end
- The **whole header row is the toggle**. The button is `flex: 1; min-height: var(--dock-row); padding: 0 1rem; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; text-align: left`, and `.title` is `flex: 1; min-width: 0; margin: 0`.
- The button overrides `:where(.panel) button`: no border, no background, and it inherits the font from `.title`. `.title` takes over the current `h1` rule: 0.9rem, 0.08em letter-spacing, uppercase.
- Chevron: open is `rotate(0)`, pointing down. Collapsed is `rotate(-90deg)`, pointing right, in all four panels. HexDetails rotates `+90deg` today: change it to `-90deg`. Keep its current size (1.7rem, line-height 1). The existing 150ms transition stays as it is; 17y owns motion.
- **hex details** keeps its close `×` (`aria-label="deselect the hex"`). It sits as a sibling after the `h2`, inside `<header>`, as a `var(--dock-row)` square, so it is never inside the toggle button. Then the header's flex gap is `0`.
- Heading level: all four titles are `h2`. world, entities and caravan are `h1` today: change them to `h2` and move the existing `h1` styles onto `.title`.

States of the header button:
| state | rule |
|---|---|
| default | title `var(--ink)`, chevron `var(--ink-dim)` |
| hover | chevron `var(--ink)` (as today) |
| focus-visible | `outline: 2px solid #7aa2c8; outline-offset: -2px`. Radius `0.5rem 0.5rem 0 0` when open, `0.5rem` when collapsed, so the panel corner doesn't clip the ring |
| expanded | `aria-expanded="true"`, chevron down |
| disabled | none; headers are never disabled |

## Behaviour

### One open at a time, at every width
- The store keeps at most one panel open. Opening one closes the other three, at every width. Closing the open one leaves **none** open; that is allowed.
- The `narrow` argument and the comment above `setPanelOpen` go. Resizing the window never changes which panel is open.
- Suggested store shape (the implementer may choose another, but the behaviour must match):
  - Keep `panelsOpen: Record<SidePanel, boolean>`, with the invariant that at most one value is true. Add `returnTo: SidePanel | null`. Both are view state and never saved.
  - `setPanelOpen(which, open)`: the user's own toggle.
    - `true`: opens `which` and closes the others.
    - `false`: closes `which`.
    - Either way it clears `returnTo`.
  - `revealPanel(which)`: an automatic open (see Selection). If another panel was open, it is remembered in `returnTo`. Then it opens `which`. If `which` is already open, it does nothing.
  - `panelGone(which, fallback)`: called when `which` stops being rendered.
    - If `which` was open: open `returnTo`, else `fallback` (or none if `fallback` is `null`). The caller passes `returnTo` only when that panel is still rendered; if the store does the check, the caller passes the visible set instead.
    - It always clears `returnTo`.
- None of these change the map or touch permissions. They are view state, like `panelsOpen` today, so they need no `may()` guard.

### Initial state (set once, in MapView setup only)
- Desktop and tablet (`innerWidth > 720`): **entities** open, the rest closed.
- Phone: none open, so the map comes first, as today.
- CaravanPanel.vue and HexDetails.vue **must not** call `setPanelOpen` in setup. CaravanPanel mounts again every time a caravan is selected, so a setup call would steal the open slot. Remove:
  - both setup calls
  - both `NARROW` constants
  - the `narrow()` in CaravanPanel

  HexDetails keeps a `narrow()` (`innerWidth < 720`) only for the selection guard below.

### Selection
| event | desktop / tablet | phone |
|---|---|---|
| DM selects a hex (select tool, no token picked; `selectedHex` goes from `null` or another hex to a hex) | `revealPanel('details')` | nothing; the details header just appears |
| selected hex changes while details is open | stays open, content updates | same |
| caravan becomes shown (picked from the list, or a rider of one picked) | **nothing**. The caravan header appears collapsed in slot 3. Opening it would fold the entities list the user just picked from, and the route and pace controls with it | same |
| shown caravan switches to another while caravan is open | stays open, content updates | same |
| user clicks a header | `setPanelOpen(which, !open)` | same |

CaravanPanel has a watch on `caravan.value?.id` that auto-opens the panel today: remove it.

### A panel stops rendering while it is open
This happens when:
- the hex is deselected: `×`, the same hex clicked again, or a token picked
- the caravan is no longer shown
- the debug view toggle hides world or details

What to do: call `panelGone(which, fallback)`.
- fallback is `'entities'` on desktop and tablet, `null` on phone.
- So desktop never ends up with every panel folded just because something vanished. Only the user's own fold does that.
- Example: the DM is editing in **world**, clicks a hex, and **details** reveals. Pressing `×` brings **world** back.

The visibility check lives in MapView. It needs one computed per panel:
- `shapesWorld`
- `true` for entities
- the caravan shown for this view. Use the same source as CaravanPanel: `player.shownCaravan` for players, `store.shownCaravan` for the DM.
- `store.may('notes') && store.selectedHex`

The same computeds give `--dock-rows`.

### Focus
- An automatic open (`revealPanel`) never moves focus. The map keeps it.
- A header click keeps focus on that header button.
- If focus was inside a panel that stops rendering (for example on the `×`), move focus to the header button of the panel that is now open, else to the entities header.

## Placement of the other overlays

### Desktop (>= 1024px), sample 1280
- **Minimap**: `right: 1rem; bottom: 1rem` always. Remove the `.beside` class binding in MiniMap.vue and its rule. Hex details is no longer on the right, so zey.8's step-aside is superseded.
- **Day/night dial**: `top: 1rem; left: min(max(50%, var(--dock-reserve) + 0.75rem + 8.1rem), 100% - 15.1rem); translate: -50% 0`. That is `max(50%, 32.6rem)` in place of today's `54.6rem`. Rewrite the comment above `.dial`: the row of two panels, 45.75rem wide, no longer exists.
  - At 1280 the dial spans 510 to 770px.
  - At 1024 it spans 392 to 651px.
  - It clears the column, which ends at 368px.
- **SessionBar**: unchanged at `top: 12px; right: 12px`, `max-width: min(22rem, 100% - 24px)`. At 1024 its widest left edge is 660px, which clears the dial's 651px.
- **DmToolbar**: `bottom: 12px`, centred in the band between the column and the minimap:
  - `left: calc(var(--dock-reserve) + (100% - var(--dock-reserve) - var(--minimap-reserve)) / 2); translate: -50% 0;`
  - `max-width: calc(100% - var(--dock-reserve) - var(--minimap-reserve))`
  - That band is 380 to 1076px at 1280, and 380 to 820px at 1024.
  - `.tools` gets `flex-wrap: wrap; justify-content: center`.
  - `.paint` max-width becomes `100%`, in place of `min(92vw, 640px)`, so the swatches wrap inside the toolbar.

### Tablet (721 to 1023px), sample 768
- **Column, minimap**: as desktop.
- **Dial**: the desktop formula as is. At 768 it spans 391 to 651px.
- **SessionBar**: `top: 9.5rem`. That is the dial's top of 1rem, plus its height of 7.95rem (16.2rem x 108/220), plus a 0.5rem gap. Keep `right: 12px`. It drops below the dial because the two can't share the top row next to the column.
- **DmToolbar**: it sits above the minimap, centred in the band from the column to the right edge:
  - `bottom: calc(1rem + 176px + 0.5rem)`
  - `left: calc(var(--dock-reserve) + (100% - var(--dock-reserve) - 1rem) / 2)`
  - `max-width: calc(100% - var(--dock-reserve) - 1rem)`
  - At 768 the band is 380 to 752px, which is 372px, and the five tools fit on one row.
  - Its foot (208px) clears the minimap's top (192px).

### Phone (<= 720px), sample 360
- **Minimap**: hidden, as today.
- **Dial**: `left: 50%`, svg `13.5rem` (as today). Height is 6.65rem.
  - `top: var(--dial-top)`, where MapView sets `--dial-top` on `<main>` to `calc(0.5rem + var(--dock-rows) * (var(--dock-row) + 2px) + (var(--dock-rows) - 1) * var(--dock-gap) + 0.75rem)`. That puts it right under the collapsed headers.
  - With 4 rows that is about 13.3rem. The open panel covers it, because the column's z-index is 11.
- **SessionBar**: `top: calc(var(--dial-top) + 6.65rem + 0.5rem); right: 0.5rem; max-width: calc(100% - 1rem)`. Today it sits over the headers.
- **DmToolbar**: unchanged, at `bottom: 12px`, centred, z-index 10. An open panel covers it. Fold the panel to paint.
- **ViewToggle** (debug only): unchanged, top-right. On phone it overlaps the full-width column headers. This is accepted, because it only shows in debug mode.

## Accessibility
- Header pattern: an APG disclosure on each panel.
  - The button has `aria-expanded`, and `aria-controls` set to the body's id.
  - The body has `role="region"` and `aria-labelledby` set to the button's id.
  - Ids: `panel-world`, `panel-entities`, `panel-caravan`, `panel-details` for the bodies, with `-head` for the buttons.
- Accessible name = the visible title (`world`, `entities`, the caravan name, `hex 3,4`). Drop the old `aria-label="open the … panel" / "collapse the … panel"`: `aria-expanded` already says which.
- Keyboard: headers are native buttons, so Enter and Space toggle them.
  - Tab order is DOM order. In the column: world header, then world body if open, then entities header, and so on, ending with the details header and then the details `×`.
  - Arrow-key moves between headers and an Escape-to-fold are **not** required. Escape is left alone so it doesn't fight PopupDialog.
- Contrast on `--surface-raised` (#1d2026):
  - title `--ink` #e6e8ec: about 14:1
  - chevron `--ink-dim` #8b929e: 5.2:1, which passes AA for text
  - focus ring #7aa2c8: 6.1:1, above the 3:1 needed for non-text
- Target size: header rows are 40px (44px on phone). The `×` is the same size.
- Reduced motion: this bead adds no motion. The chevron's existing 150ms rotation is 17y's concern.
- No new images.

## Copy
English only (the repo ships one language). The lowercase voice is unchanged. The only text change is that the toggle `aria-label`s go away (see Accessibility). No new placeholder text.

## Store tests (replace `describe('the side panels')`, hexMap.test.ts ~2811)
1. Opening each panel in turn leaves only that one open.
2. Closing the open panel leaves none open.
3. Closing a panel that is not open changes nothing.
4. `revealPanel('details')` with world open opens details. `panelGone('details', 'entities')` then reopens world.
5. `revealPanel` followed by a user `setPanelOpen('entities', true)`, then `panelGone('details', 'entities')`, leaves entities open: `returnTo` was cleared.
6. `panelGone(which, 'entities')` with nothing remembered opens entities. With `null` it leaves none open.
7. `panelGone` for a panel that was not open changes nothing.

The four existing tests (wide and narrow) are deleted; they describe the old rule.

## Screenshots for the UI review
Take each at 360, 768 and 1280, as DM:
- start state
- world open with a hex then selected (details revealed)
- caravan selected
- a tall panel open (scroll visible)

Take start and caravan-open as a player.

## Assets
None.

## Assumptions (defaults chosen; the user can overturn)
1. Selecting a caravan does **not** auto-open the caravan panel. Today it does, but under one-open it would fold the entities list. A hex selection does auto-open details on desktop and tablet.
2. Desktop starts with **entities** open, not world. World and entities both open at start today.
3. Collapsed panels are full column width rows, so a 352px by 40px strip per row no longer passes the pointer to the map.
4. When the open panel vanishes, desktop falls back to the panel it replaced, else to entities. Phone falls back to none.
5. On phone an open panel covers the dial, session bar and toolbar, including the session bar's reconnecting notice.
