# hexcrawl_web-q55: panel visual restyle

This bead restyles what tb0 and 0zz build. It does not change behaviour: no new state, no handlers, no change to markup order, and no copy change beyond letter-case, which comes from CSS. All tokens come from `design/tokens.md`. Add the q55 rows to `:root` in `src/style.css`.

Builds on:
- `design/hexcrawl_web-tb0.md`: column, `h2 > button.head` headers, body scroller
- `design/hexcrawl_web-0zz.md`: `PanelSection.vue`, the `.psec-*` classes

## Goal
For the DM running the table and the players reading their caravan. Panels should read like a field ledger laid over the map. Each panel has a quiet frame, and its sections sit in it as trays. Labels sit on the dim ink and values on the bright ink. The one memorable element is a small **hex marker** in every panel header. It ties the drawer to the board: lit accent when the panel is open, an outline when it is folded, and the caravan's own colour on the caravan panel. Nothing else is decorative.

## Direction
- Palette: only the existing colours, tokenised. No new hues; `--line-strong`, `--surface-deep` and the accent tints are derived from what is there.
- Type: `system-ui`, which is the existing face. Hierarchy comes from size and weight:
  - title: 16px, weight 600
  - section: 14px, weight 600
  - body: 13px
  - meta: 12px

  The uppercase, tracked panel titles go: titles render as written (lowercase), because tracked all-caps labels are a stock template look.
- Hierarchy through surface rather than lines:
  - panel: `--panel-bg`, `--radius-panel`, `--shadow-panel`
  - tray: `--surface`, `--radius-tray`, no shadow
  - control: `--surface-deep` or `--surface-raised`, `--radius-control`

  Three radii mark three levels. The 1px `.control` and `.section` top-border dividers are removed: the trays do that job.
- Alignment: everything left-aligned. Values and counts are right-aligned and use tabular numerals.

## Panel (all four, `aside.panel`)
- `background: var(--panel-bg); border: 1px solid var(--line); border-radius: var(--radius-panel); box-shadow: var(--shadow-panel)`.
- Phone open panel: opaque `var(--surface-raised)` (tb0 rule kept).
- **Header button** (`.head`), as built in tb0:
  - `gap: var(--space-2); padding: 0 var(--space-3) 0 var(--space-4)`
  - `font: 600 var(--text-title)`, colour `var(--ink)`
  - `text-transform: none; letter-spacing: normal`
- **Hex marker**: `<span class="mark" aria-hidden="true">`, first child of `.head`, replacing the caravan header's round `.pip`.
  - `flex: none; width: 0.875rem; height: 0.75rem`
  - `clip-path: polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%)`, a flat-top hex like the board
  - open: `background: var(--accent)`
  - folded: `background: var(--line-strong)`
  - caravan: `background: <caravan colour>` (the inline style that is on `.pip` today), whether open or folded; when folded it gets `opacity: 0.55`
  - the marker is decoration, so it needs no contrast ratio; the folded and open state is also carried by the chevron and `aria-expanded`
- Open header gets `border-bottom: 1px solid var(--line)`. A folded header has no bottom border.
- Hover on the header: `background: color-mix(in srgb, var(--line) 35%, transparent)` and chevron `var(--ink)`.
- Focus-visible: tb0's ring, using `var(--accent)`.
- Chevron: `--ink-dim`, size `1.25rem` (down from 1.7rem), line-height 1.
- Hex details `×`: same hover and focus as the header, `color: var(--ink-dim)`, `font-size: 1.25rem`.
- **Body**:
  - `padding: var(--space-2) var(--space-2) var(--space-3)`
  - `display: flex; flex-direction: column; gap: var(--space-2)`
  - `font: var(--text-body)`
- **Top summary** (the dl, or the portrait row): `padding: var(--space-1) var(--space-2)`, so it aligns with the tray contents. dl columns `auto 1fr`, gap `var(--space-1) var(--space-3)`; `dt` uses `--text-meta` in `--ink-dim`; `dd` uses `--text-body` with tabular numerals.
- The entities hint line and the world controls hint: `--text-meta`, `--ink-dim`, `padding: 0 var(--space-2)`.

## Section tray (`PanelSection.vue`, `.psec`)
- `background: var(--surface); border-radius: var(--radius-tray); padding: 0 var(--space-3) var(--space-3)`. Folded: `padding-bottom: 0`.
- No border, no shadow. Sibling spacing comes from the body's gap, so drop 0zz's `.psec + .psec` margin.
- `.psec-head`: `margin: 0 calc(-1 * var(--space-3))` with the toggle getting `padding: 0 var(--space-3)`, so the hover fill runs edge to edge. Radius: `var(--radius-tray) var(--radius-tray) 0 0` when open, `var(--radius-tray)` when folded.
- `.psec-name`: `font: 600 var(--text-heading)`, `--ink`.
- `.psec-meta`: `font: var(--text-meta)`, `--ink-dim`, tabular.
- Hover: head `background: color-mix(in srgb, var(--line) 45%, transparent)`.
- Body: `display: flex; flex-direction: column; gap: var(--space-3)`.
- Inside a tray, `.control` loses its `margin-top`, `padding-top` and `border-top`. `.control.indent` keeps `padding-left: 1.2rem`.

## Controls
All sizes use `--control-h` (32px; 40px on phone).

### Text, number, select, textarea
| state | rule |
|---|---|
| default | `height: var(--control-h)` (textarea: auto, `min-height: 5.5rem`, `resize: vertical`, `padding: var(--space-2)`); `padding: 0 var(--space-2)`; `background: var(--surface-deep)`; `border: 1px solid var(--line-strong)`; `border-radius: var(--radius-control)`; `color: var(--ink)`; `font: var(--text-body)` |
| placeholder | `color: var(--ink-dim)` |
| hover | `border-color: var(--ink-dim)` |
| focus | `border-color: var(--accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 35%, transparent); outline: none` |
| disabled / read-only | `background: transparent; border-color: var(--line); color: var(--ink-dim)` |
| invalid (`:invalid` on number inputs) | `border-color: var(--danger)` |
| phone | `font-size: 1rem`, so iOS doesn't zoom on focus |

Number inputs in CaravanSupplies are `width: 5rem`, right-aligned and tabular.

### Range
`accent-color: var(--accent); width: 100%; height: 1.25rem; margin: 0`. The label row above it is `--text-body`, with the label in `--ink-dim` on the left and the value in `--ink` on the right, as today.

### Checkbox
`accent-color: var(--accent); width: 1rem; height: 1rem`. The row is `min-height: 1.75rem` (phone `--control-h`) with `gap: var(--space-2)`, and the label is `--text-body` in `--ink`.

### Colour input
`width: 2.5rem; height: var(--control-h); padding: 2px; border: 1px solid var(--line-strong); border-radius: var(--radius-control); background: var(--surface-deep)`.

### Buttons
Every panel button falls into one of six kinds. Kind is chosen by class; the default needs none.

| kind | class | used by | default | hover | active | disabled |
|---|---|---|---|---|---|---|
| secondary | none | every other panel button (export, import, new map, roll a new world, order buttons, let in…) | `height: var(--control-h); padding: 0 var(--space-3); background: var(--surface-raised); border: 1px solid var(--line-strong); color: var(--ink); font: 500 var(--text-body)` | `border-color: var(--accent); background: color-mix(in srgb, var(--accent) 14%, var(--surface-raised))` | `background: color-mix(in srgb, var(--accent) 24%, var(--surface-raised))` | `background: transparent; border-color: var(--line); color: var(--ink-dim); cursor: default` |
| primary | `.primary` | `roll encounter` (HexEncounter), `generate resources` (world), the add-entity button (entities) | `background: var(--accent); border-color: var(--accent); color: var(--on-accent)` | `background: var(--accent-hover)` | `background: var(--accent-press)` | as secondary |
| danger | `.danger` | `clear the history`, remove entity | `background: transparent; border-color: var(--line-strong); color: var(--danger)` | `border-color: var(--danger); background: color-mix(in srgb, var(--danger) 12%, transparent)` | `background: color-mix(in srgb, var(--danger) 20%, transparent)` | as secondary |
| icon | `.drop`, `.kick` | `×` on legs, locations, resources | `width: 1.5rem; height: 1.5rem` (phone 2.25rem); `border: none; background: none; color: var(--ink-dim)` | `color: var(--ink); background: color-mix(in srgb, var(--line) 50%, transparent)` | same as hover | n/a |
| link | `.link` | `edit table` | `border: none; background: none; padding: 0; color: var(--accent); font: var(--text-meta)` | `text-decoration: underline` | same | n/a |
| row | list buttons in `.entities`, `.riders`, `.list`, `.journey`, `.portraits` | entity, rider and journey rows | `min-height: 1.875rem; padding: var(--space-1) var(--space-2); border: none; border-radius: var(--radius-control); background: transparent; color: var(--ink); text-align: left` | `background: color-mix(in srgb, var(--line) 55%, transparent)` | n/a | `color: var(--ink-dim)` |

- Selected row (`.here`): `background: color-mix(in srgb, var(--accent) 18%, transparent); box-shadow: inset 2px 0 0 var(--accent)`.
- Every button, any kind, has the same focus-visible rule: `outline: 2px solid var(--accent); outline-offset: 2px`. Icon and row buttons use `outline-offset: 0`.
- Radius for all kinds except link: `var(--radius-control)`.
- Loading state: none of these buttons are async. `library.busy` keeps using `disabled`.
- Adding `.primary` and `.danger` is the only markup change, and it is a class only.
- Entity pips (`.pip` in lists) stay round, 0.55rem. They are tokens, not panel identity.

### Lists and logs
- `.journey`, `.legs`, `.list`: rows `gap: var(--space-1)`, `font: var(--text-body)`, numbers tabular. Dim parts use `--ink-dim`. `.ahead` uses `--ink-dim`, `.met` stays italic.
- The `.journey` scroller stays `max-height: 11rem`.
- Error text: `color: var(--danger)`, in place of the `#e07a6a` literal.

## Breakpoints
- Desktop and tablet: as above.
- Phone (`max-width: 720px`):
  - `--control-h` and `--section-row` take their phone values
  - inputs get `font-size: 1rem`
  - icon buttons are 2.25rem
  - no other differences

## Where the CSS lives
- Tokens go on `:root` in `src/style.css`.
- Shared control and button rules: keep them scoped per component, as today. Hot-spot memory: bare element selectors in MapView leak into child roots, so keep the `:where(.panel)` scoping and class selectors.
  - MapView's `:where(.panel) button / input / select` rules become the reference implementation.
  - CaravanPanel, HexDetails and the Hex*/Caravan*/InventoryList components replace their local literals with the same token-based rules.
  - Do not add a global `button {}` rule to style.css, because the dial, toolbar and session bar are out of scope.
- Replace every `#7aa2c8` and `#e07a6a` literal in the touched files with `var(--accent)` and `var(--danger)`.

## Accessibility
- Every text pair used is in the contrast table in `tokens.md`. All pass AA: the lowest text pair is `--ink-dim` on `--surface-raised` at 5.2:1. Input and button borders that identify a control use `--line-strong`, at 3.2:1 or more.
- Panels sit at 94% opacity over the 3D map, so the measured contrast holds to within 0.1.
- Focus is always visible (accent ring, 6.1:1). `outline: none` appears only where a box-shadow ring replaces it (inputs).
- Selection is never colour alone: the selected row has an inset bar as well as the tint.
- Target sizes: 32px controls (40px phone), 24px icon buttons (36px phone). Both are at or above 24px.
- Reduced motion: q55 adds no transitions. Hover colour changes are instant.

## Copy
No string changes. Titles lose the CSS uppercase transform, so they now render as authored (lowercase).

## Assets
None. Fonts stay system-ui.

## Files touched
- `src/style.css`: tokens
- `src/views/MapView.vue`: `<style>`, plus `.primary` and `.danger` classes on 3 buttons and the `.mark` span in two headers
- `src/components/CaravanPanel.vue`
- `src/components/HexDetails.vue`
- `src/components/PanelSection.vue`
- `src/components/InventoryList.vue`
- `src/components/CaravanSupplies.vue`
- `src/components/CaravanMerchants.vue`
- `src/components/HexEncounter.vue`: `.primary` on roll
- `src/components/HexEvents.vue`
- `src/components/HexLocations.vue`
- `src/components/HexResources.vue`
- `src/components/MapList.vue`

Out of scope: DmToolbar, SessionBar, DayNightDial, MiniMap, EnterScreen, PopupDialog, EncounterTableEditor.

## UI review checklist
Check at 360, 768 and 1280:
- every panel open
- one section folded and one open
- hover and focus on header, toggle, each button kind, input and checkbox
- a selected entity row
- an invalid number in supplies
- disabled `new map` while busy

Then contrast spot-check against the table.

## Open questions for the user
1. Panel titles go from uppercase tracked to lowercase as written. Keep the uppercase look instead?
2. Is the hex marker in panel headers wanted? It is the one decorative element. The fallback is no marker, with the caravan keeping its round pip.
3. There is no light theme. The AA criterion is met for the only theme, dark. Is a light theme expected anywhere? If so it is a separate bead.
