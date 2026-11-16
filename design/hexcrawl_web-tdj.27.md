# hexcrawl_web-tdj.27: DM controls for owner, hidden and hostile

Status: spec, 2026-11-16. **Spec only.** Written against main `ad1cd27`, with the store actions as built in the tdj.30 worktree (`setEntityOwner`, `setEntityHidden`, `setEntityHostile`) and the details section of `EntitySubPanel.vue` as built in the ped.25 worktree.

Builds on:
- `design/hexcrawl_web-ped.12.md`, "Entity sub-panel": row 1 `details`
- `design/hexcrawl_web-1a1.10.md`, "Frame colour rule"
- bead tdj.30 notes (actions and their rules), decision tdj.35 (hostile is DM-only, default (a))

## Goal
For the DM, in an entity's sub-panel. Today the only way to get a DM-owned npc (bronze frame) or a hidden one (crimson) is imported data. The one action: **decide who an entity belongs to and whether the players see it, or see it as a foe**, in one place, with the card above recolouring as feedback.

## Store contract (tdj.30, do not change here)
| action | gate | effect | undo |
|---|---|---|---|
| `setEntityOwner(id, 'player')` | `may('assignEntity')` | `owner: 'player', hidden: false` | no, clears history |
| `setEntityOwner(id, 'dm')` | `may('assignEntity')` | `owner: 'dm'`, unseats any player (`assignSeat(…, null)`); `hidden` unchanged (stays false) | no, clears history |
| `setEntityHidden(id, b)` | `may('entitySettings', e)` | refused unless `owner === 'dm'` | yes |
| `setEntityHostile(id, b)` | `may('entitySettings', e)` | `hostile: b`, any owner, any kind | yes |

## Component: `src/components/EntityDmControls.vue` (new)
```ts
props: { entity: Entity }   // the sub-panel's entity, never store.selectedEntity
```
Reads `useHexMapStore()` for `may`, `playerOf` and the three actions. No emits. Every handler acts on `entity.id`.

### Mount (after ped.25 merges; one line)
In `EntitySubPanel.vue`, inside the details section's `<div class="control stack">`, as its **last child, right after the darkvision label**:
```vue
<EntityDmControls v-if="store.may('assignEntity')" :entity="entity" />
```
Until then the component is built and tested standalone.

### Rows by kind
| row | party | npc | caravan | ship |
|---|---|---|---|---|
| owner | yes | yes | yes | yes |
| hidden | yes | yes | yes | yes |
| hostile | yes | yes | **yes** | **yes** |

Hostile on caravans and ships (designer's call): raider wagon trains and pirate ships are hexcrawl staples; `Entity.hostile` exists on every kind and `frameVariant` checks `hidden || hostile` before the carrier rule, so a hostile ship gets the crimson frame with no extra rule. Hiding the toggle for carriers would leave the field unreachable for no gain. If the user wants it narrower, it is one `v-if` (open question Q1).

### Layout
Root `<div class="dm-controls">`, scoped styles of its own (EntitySubPanel's scoped `.row` rules reach only this root, not its children; memory `hexcrawl-web-vue-gotcha-scoped-styles-in-a`). Values copied from ped.25's details rows so the block reads as part of the same list:

```
 ─────────────────────────────────── 1px var(--line)
 owner                     [player ▾]
 (hint, conditional)
 hidden                          [ ]
 players' entities are always on the map   (when owner = player)
 hostile                         [ ]
 only you see it
```
- `.dm-controls`: `display: flex; flex-direction: column; gap: 0.4rem; margin-top: 0.2rem; padding-top: 0.6rem; border-top: 1px solid var(--line); font-size: 0.78rem`. Inside the parent stack its own gap (0.4rem) sits above the divider.
- `.row`: `display: flex; justify-content: space-between; align-items: center; gap: 1rem`. Label text `span` in `--ink-dim`.
- `select`: `flex: 0 1 8rem; min-width: 0; padding: 0.3rem; border: 1px solid var(--line); border-radius: 0.35rem; background: var(--surface); color: var(--ink); font: inherit` (as the dock's `played by` select).
- `input[type='checkbox']`: `margin: 0; accent-color: var(--accent); cursor: pointer`.
- `.hint`: `margin: -0.2rem 0 0; color: var(--ink-dim); font-size: 0.75rem; line-height: 1.3`, sits right under the row it explains.
- Same at every breakpoint: the sub-panel is 336px wide (two-up, three-up) or the dock's box (stacked: 360 phone, 768 tablet, 1024). Phone: checkbox and select keep native size; the whole `label` row is the hit area (at least 2.5rem tall via `min-height: var(--control-h)` on `.row`).

### Owner row
`<label class="row">` with `<span>owner</span>` and `<select :value="entity.owner">`, options in this order: `player` (value `player`), `dm` (value `dm`). `aria-label="who the entity belongs to"`.

On `change`:
| from → to | seated? (`playerOf(id) !== null`) | result |
|---|---|---|
| dm → player | n/a | `setEntityOwner(id, 'player')` at once. If it was hidden it now shows on the players' map (see hint) |
| player → dm | no | `setEntityOwner(id, 'dm')` at once |
| player → dm | yes | **confirm dialog** first (below). The select shows `player` again until confirmed: reset `select.value = entity.owner` in the handler, as `CardTally.onChange` resets its input |

Hint under the owner row, only when `owner === 'dm' && hidden`: `handing it to the players also shows it on their map`. `id="dm-{entity.id}-owner-hint"`, `aria-describedby` on the select.

#### Confirm dialog (player → dm, seated)
`PopupDialog` (existing), `v-model` local `confirming`.
- title: `take {name} from {player}?`
- body `p`: `{player} plays {name} now. making it a dm entity takes it off their seat, and undo can't bring it back.`
- buttons, in a row `display: flex; gap: 0.5rem; justify-content: flex-end; padding: 0 1rem 1rem`:
  1. `keep it with {player}`: plain button, closes, nothing changes. **Gets focus on open** (safe default).
  2. `take it`: danger button (`border-color: var(--danger); color: var(--danger)`; hover `background: color-mix(in srgb, var(--danger) 12%, transparent)`), calls `setEntityOwner(id, 'dm')`, closes.
- Escape, the `×` and a backdrop click all cancel (PopupDialog already does this).
- After close, focus returns to the owner select (`select.focus()` in a `nextTick` after `confirming` turns false).

### Hidden row
`<label class="row">` with `<span>hidden</span>` and `<input type="checkbox" :checked="entity.hidden" aria-label="kept off the players' map">`; `@change` → `setEntityHidden(id, checked)`.
- **Disabled when `owner === 'player'`** (the store refuses it anyway). Then: `disabled` on the input, label `span` keeps `--ink-dim`, row `cursor: default`, checkbox `cursor: not-allowed`.
- Hint under it, only while disabled: `players' entities are always on the map`. `id="dm-{entity.id}-hidden-hint"`, `aria-describedby` on the checkbox.

### Hostile row
`<label class="row">` with `<span>hostile</span>` and `<input type="checkbox" :checked="entity.hostile" aria-label="hostile to the players">`; `@change` → `setEntityHostile(id, checked)`. Never disabled.
- Hint under it, always (decision tdj.35 (a)): `only you see it`. `id="dm-{entity.id}-hostile-hint"`, `aria-describedby` on the checkbox.

### States
| state | owner select | hidden checkbox | hostile checkbox |
|---|---|---|---|
| default | native select, `--line` border | native | native |
| hover | `border-color: var(--accent)` | native | native |
| focus-visible | `outline: 2px solid var(--accent); outline-offset: 1px` | same | same |
| active | native | native | native |
| disabled | never | owner = player, with hint | never |
| confirm pending | shows the current owner (`player`) | unchanged | unchanged |
| loading, empty, error | none: synchronous store data; the component is not rendered for players (`v-if` on `may('assignEntity')`) | | |

## Frame colour consequence
After tdj.30, `frameVariant` in `src/entities/busts.ts`:
```ts
if (entity.hidden || entity.hostile) return 'crimson'
if (entity.kind === 'caravan' || entity.kind === 'ship') return 'bronze'
return entity.owner === 'player' ? 'steel' : 'bronze'
```
What each control does to the card in the slot above (DM view; it re-renders from the same reactive entity, no extra wiring):
| action | party / npc | caravan / ship |
|---|---|---|
| owner dm → player (not hostile) | crimson or bronze → **steel** (hidden is cleared) | crimson → bronze, or stays bronze |
| owner player → dm (not hostile) | steel → **bronze** | stays bronze |
| hidden on | → **crimson** | → **crimson** |
| hidden off, not hostile | → bronze | → bronze |
| hostile on | → **crimson**, any owner | → **crimson** |
| hostile off, not hidden | → steel (player) or bronze (dm) | → bronze |

A player-owned hostile party shows crimson to the DM and loses the steel "player" cue; the plate's `played by {name}` line still says who plays it. Accepted.

### Under tdj.35 option (b) (players see hostile)
- Projection keeps `hostile`; a visible hostile entity is crimson in the player view too.
- Hostile hint copy becomes `players see it as a foe`. Nothing else in this component changes.
- Note: players get no columns (ped.18) and their dock cards show only their own character and caravan (ped.6, ped.7), so under (b) a player would see crimson only on a hostile entity they play or ride with, until some bead shows other entities' cards to players. Hidden entities stay out of the projection either way.

## Copy (English only, lowercase)
- Row labels: `owner`, `hidden`, `hostile`. Options: `player`, `dm`.
- Accessible names: `who the entity belongs to`, `kept off the players' map`, `hostile to the players`.
- Hints: `handing it to the players also shows it on their map`; `players' entities are always on the map`; `only you see it` ((b): `players see it as a foe`).
- Dialog: title `take {name} from {player}?`; body `{player} plays {name} now. making it a dm entity takes it off their seat, and undo can't bring it back.`; buttons `keep it with {player}`, `take it`.

## Accessibility
- Contrast: existing pairs only (`tokens.md`): `--ink-dim` labels and hints on `--surface-raised` 5.2:1, `--danger` on `--surface-raised` 5.6:1, `--accent` focus ring 6.1:1.
- Every control has a visible label (the wrapping `label`) and an accessible name; hints are tied with `aria-describedby`. A disabled checkbox's reason is in its description, not only in its look.
- Focus order: after darkvision: owner select, hidden checkbox (skipped by Tab while disabled), hostile checkbox. In the dialog: `keep it with …` first, then `take it`, then `×`.
- Keyboard: select with arrows (change fires as native), Space toggles checkboxes, Escape cancels the dialog only (ped.12: Escape inside an open `<dialog>` does not close the sub-panel).
- Reduced motion: nothing animates.
- No images.

## Tests: `src/components/EntityDmControls.test.ts` (happy-dom, pinia as `SubPanelStack.test.ts`)
`describe('the dm controls')`, DM store, entity mounted as a prop:
1. Renders the three rows for each of party, npc, caravan, ship.
2. Owner `dm → player` calls through: entity is `owner: 'player', hidden: false` afterwards.
3. Owner `player → dm` with no seat changes at once, no dialog.
4. Owner `player → dm` while seated opens the dialog; the select still reads `player`; `keep it with …` leaves owner and seat as they were; `take it` sets `owner: 'dm'` and `playerOf(id)` is null.
5. Hidden checkbox is disabled with the hint when owner is player; enabled when dm, and toggling sets `hidden`.
6. Hostile toggles `hostile` for a player-owned and a dm-owned entity.
7. The owner hint shows only for a hidden dm entity.
8. Ids are unique per entity (two components for two entities: no duplicate `id` attributes).
`frameVariant` cases for hostile belong to tdj.30.

## UI review checklist
In a level-1 sub-panel at 1280x800 and 1600x900, and stacked at 768 and 360:
- The block sits at the end of `details`, under darkvision, behind a 1px divider, rows aligned with the rows above.
- For each kind: toggling hidden and hostile recolours the card per the table; owner switches recolour per the table.
- A seated party set to `dm`: dialog with the player's name, focus on `keep it with …`; Escape keeps it; `take it` unseats (the plate reads `dm`).
- Player-owned: hidden disabled with its hint.
- Player view (debug toggle): no DM controls; a hostile npc is not crimson (tdj.35 (a)).

## Assets
None.

## Open questions
- **Q1, hostile on carriers**: (a) show hostile on all four kinds [default: pirate ships, raider caravans]; (b) party and npc only, as tdj.30's description first said.
- **Q2, hostile on player-owned entities**: (a) allowed, any owner [default: the store allows it; a charmed or turned party is a table case]; (b) disable hostile when owner is player and clear it on `owner → player` (needs a tdj.30 store change).
