# hexcrawl_web-tdj.27: DM controls for owner, hidden and hostile

Status: spec, 2026-11-16, amended 2026-11-16 for decisions tdj.35 (b), tdj.37 (a), tdj.38 (b). **Built and merged (01857a7).** Written against main `ad1cd27`, with the store actions of tdj.30 (`setEntityOwner`, `setEntityHidden`, `setEntityHostile`), the hostile rule of tdj.41, and the details section of `EntitySubPanel.vue`.

Builds on:
- `design/hexcrawl_web-ped.12.md`, "Entity sub-panel": row 1 `details`
- `design/hexcrawl_web-1a1.10.md`, "Frame colour rule"
- bead tdj.30 notes (actions and their rules)
- decisions (user, 2026-11-16): tdj.35 **(b)** players see hostile (the projection sends it); tdj.37 **(a)** hostile toggle on all four kinds; tdj.38 **(b)** a player-owned entity may not be hostile
- bead tdj.41 (store and projection side of those decisions; this component depends on it)

## Goal
For the DM, in an entity's sub-panel. Today the only way to get a DM-owned npc (bronze frame) or a hidden one (crimson) is imported data. The one action: **decide who an entity belongs to and whether the players see it, or see it as a foe**, in one place, with the card above recolouring as feedback.

## Invariant (tdj.41)
`hidden` and `hostile` are DM-only states: **an entity with `owner === 'player'` always has `hidden: false` and `hostile: false`**. The store enforces it; this component mirrors it (both checkboxes disabled for a player-owned entity, with a hint each).

## Store contract (tdj.30 + tdj.41, do not change here)
| action | gate | effect | undo |
|---|---|---|---|
| `setEntityOwner(id, 'player')` | `may('assignEntity')` | `owner: 'player', hidden: false, hostile: false` | no, clears history |
| `setEntityOwner(id, 'dm')` | `may('assignEntity')` | `owner: 'dm'`, unseats any player (`assignSeat(…, null)`); `hidden` and `hostile` unchanged (both stay false) | no, clears history |
| `assignEntity(id, player)` (dock's `played by`) | `may('assignEntity')` | `owner: 'player', hidden: false, hostile: false` | as today |
| `setEntityHidden(id, b)` | `may('entitySettings', e)` | `hidden: b`; refused unless `owner === 'dm'` | yes |
| `setEntityHostile(id, b)` | `may('entitySettings', e)` | `hostile: b`; refused unless `owner === 'dm'`; any kind | yes |
| projection `asPlayersSeeIt` | n/a | sends `hostile` as is for visible entities; hidden entities still not sent | n/a |

## Component: `src/components/EntityDmControls.vue` (new)
```ts
props: { entity: Entity }   // the sub-panel's entity, never store.selectedEntity
```
Reads `useHexMapStore()` for `may`, `playerOf` and the three actions. No emits. Every handler acts on `entity.id`.

### Mount (done)
Mounted in `EntitySubPanel.vue`, inside the details section's `<div class="control stack">`, as its **last child, right after the darkvision label**:
```vue
<EntityDmControls v-if="store.may('assignEntity')" :entity="entity" />
```

### Rows by kind
| row | party | npc | caravan | ship |
|---|---|---|---|---|
| owner | yes | yes | yes | yes |
| hidden | yes | yes | yes | yes |
| hostile | yes | yes | **yes** | **yes** |

Hostile on caravans and ships: **decided, tdj.37 (a)**. Raider wagon trains and pirate ships are hexcrawl staples; `Entity.hostile` exists on every kind and `frameVariant` checks `hidden || hostile` before the carrier rule, so a hostile ship gets the crimson frame with no extra rule. On every kind the hidden and hostile rows are disabled while `owner === 'player'`.

### Layout
Root `<div class="dm-controls">`, scoped styles of its own (EntitySubPanel's scoped `.row` rules reach only this root, not its children; memory `hexcrawl-web-vue-gotcha-scoped-styles-in-a`). Values copied from ped.25's details rows so the block reads as part of the same list:

```
 ─────────────────────────────────── 1px var(--line)
 owner                     [player ▾]
 (hint, conditional)
 hidden                          [ ]
 players' entities are always on the map   (when owner = player)
 hostile                         [ ]
 players see it as a foe                   (when owner = dm)
 players' entities are never hostile       (when owner = player)
```
Exactly one hint shows under the hostile row: the first when the owner is dm, the second when it is player.
- `.dm-controls`: `display: flex; flex-direction: column; gap: 0.4rem; margin-top: 0.2rem; padding-top: 0.6rem; border-top: 1px solid var(--line); font-size: 0.78rem`. Inside the parent stack its own gap (0.4rem) sits above the divider.
- `.row`: `display: flex; justify-content: space-between; align-items: center; gap: 1rem`. Label text `span` in `--ink-dim`.
- `select`: `flex: 0 1 8rem; min-width: 0; padding: 0.3rem; border: 1px solid var(--line); border-radius: 0.35rem; background: var(--surface); color: var(--ink); font: inherit` (as the dock's `played by` select).
- `input[type='checkbox']`: `margin: 0; accent-color: var(--accent); cursor: pointer`.
- `.hint`: `margin: -0.2rem 0 0; color: var(--ink-dim); font-size: 0.75rem; line-height: 1.3`, sits right under the row it explains.
- **Token fallbacks (until bead q55 defines them in `src/style.css`)**: `--accent`, `--danger` and `--control-h` are not defined on main yet, so every use carries a literal fallback, as `CharacterCard.vue` does: `var(--accent, #7aa2c8)` (checkbox `accent-color`, select hover border, focus outline), `var(--danger, #e07a6a)` (take-it border, text and hover tint), `var(--control-h, 2.5rem)` (row `min-height`). Without them the focus ring disappears, take-it is not red and rows shrink to 16px. When q55 lands, the fallbacks may stay or go; the values must match.
- Same at every breakpoint: the sub-panel is 336px wide (two-up, three-up) or the dock's box (stacked: 360 phone, 768 tablet, 1024). Phone: checkbox and select keep native size; the whole `label` row is the hit area (at least 2.5rem tall via `min-height: var(--control-h)` on `.row`).

### Owner row
`<label class="row">` with `<span>owner</span>` and `<select :value="entity.owner">`, options in this order: `player` (value `player`), `dm` (value `dm`). `aria-label="who the entity belongs to"`.

On `change`:
| from → to | seated? (`playerOf(id) !== null`) | result |
|---|---|---|
| dm → player | n/a | `setEntityOwner(id, 'player')` at once, no dialog. Hidden and hostile are both cleared (see hint); both checkboxes turn unchecked and disabled |
| player → dm | no | `setEntityOwner(id, 'dm')` at once |
| player → dm | yes | **confirm dialog** first (below). The select shows `player` again until confirmed: reset `select.value = entity.owner` in the handler, as `CardTally.onChange` resets its input |

Hint under the owner row, only when `owner === 'dm'` and at least one of `hidden`, `hostile` is true. Copy by state:
| hidden | hostile | owner hint |
|---|---|---|
| true | false | `handing it to the players also shows it on their map` |
| false | true | `handing it to the players also clears hostile` |
| true | true | `handing it to the players shows it on their map and clears hostile` |
| false | false | no hint |

`id="dm-{entity.id}-owner-hint"`, `aria-describedby` on the select only while the hint renders.

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
`<label class="row">` with `<span>hostile</span>` and `<input type="checkbox" :checked="entity.hostile" aria-label="hostile to the players">`; `@change` → `setEntityHostile(id, checked)`.
- **Disabled when `owner === 'player'`** (decision tdj.38 (b); the store refuses it anyway). Exactly as the hidden row: `disabled` on the input, label `span` keeps `--ink-dim`, row `cursor: default`, checkbox `cursor: not-allowed`. It is unchecked then (the invariant).
- Hint under it, always one of two, same `id="dm-{entity.id}-hostile-hint"`, `aria-describedby` on the checkbox in both states:
  - owner dm (enabled): `players see it as a foe` (decision tdj.35 (b)).
  - owner player (disabled): `players' entities are never hostile`.

### States
| state | owner select | hidden checkbox | hostile checkbox |
|---|---|---|---|
| default | native select, `--line` border | native | native |
| hover | `border-color: var(--accent)` | native | native |
| focus-visible | `outline: 2px solid var(--accent); outline-offset: 1px` | same | same |
| active | native | native | native |
| disabled | never | owner = player, unchecked, with hint | owner = player, unchecked, with hint |
| confirm pending | shows the current owner (`player`) | unchanged | unchanged |
| loading, empty, error | none: synchronous store data; the component is not rendered for players (`v-if` on `may('assignEntity')`) | | |

## Frame colour consequence
After tdj.30, `frameVariant` in `src/entities/busts.ts`:
```ts
if (entity.hidden || entity.hostile) return 'crimson'
if (entity.kind === 'caravan' || entity.kind === 'ship') return 'bronze'
return entity.owner === 'player' ? 'steel' : 'bronze'
```
What each control does to the card in the slot above (DM view; it re-renders from the same reactive entity, no extra wiring). Hidden and hostile toggles exist only for dm-owned entities, so there is no player-owned crimson row:
| action | party / npc | caravan / ship |
|---|---|---|
| owner dm → player | crimson or bronze → **steel** (hidden and hostile are cleared) | crimson → bronze, or stays bronze |
| owner player → dm | steel → **bronze** (never hidden or hostile at that point) | stays bronze |
| hidden on (dm-owned) | → **crimson** | → **crimson** |
| hidden off, not hostile | → bronze | → bronze |
| hostile on (dm-owned) | → **crimson** | → **crimson** |
| hostile off, not hidden | → bronze | → bronze |

The same applies through the dock's `played by` select: `assignEntity` clears both flags, so a crimson npc handed to a player turns steel.

### Player view (tdj.35 (b))
- The projection sends `hostile`; a **visible hostile entity is crimson in the player view too**. Hidden entities stay out of the projection.
- Since a hostile entity is always dm-owned (tdj.38 (b)), players never see their own character or caravan in crimson. Players get no columns (ped.18) and their dock cards show only their own character and caravan (ped.6, ped.7), so a player sees hostile crimson wherever a dm-owned entity's card is shown to them (the sub-panel of a selected visible entity, if the player view opens one) and nowhere else, until a bead shows other entities' cards to players.

## Copy (English only, lowercase)
- Row labels: `owner`, `hidden`, `hostile`. Options: `player`, `dm`.
- Accessible names: `who the entity belongs to`, `kept off the players' map`, `hostile to the players`.
- Owner hints: `handing it to the players also shows it on their map` (hidden); `handing it to the players also clears hostile` (hostile); `handing it to the players shows it on their map and clears hostile` (both).
- Hidden hint: `players' entities are always on the map` (owner player).
- Hostile hints: `players see it as a foe` (owner dm); `players' entities are never hostile` (owner player).
- `only you see it` is retired (it was the tdj.35 (a) copy).
- Dialog: title `take {name} from {player}?`; body `{player} plays {name} now. making it a dm entity takes it off their seat, and undo can't bring it back.`; buttons `keep it with {player}`, `take it`.

## Accessibility
- Contrast: existing pairs only (`tokens.md`): `--ink-dim` labels and hints on `--surface-raised` 5.2:1, `--danger` on `--surface-raised` 5.6:1, `--accent` focus ring 6.1:1.
- Every control has a visible label (the wrapping `label`) and an accessible name; hints are tied with `aria-describedby`. A disabled checkbox's reason is in its description, not only in its look (both hidden and hostile).
- Focus order: after darkvision: owner select, hidden checkbox, hostile checkbox. For a player-owned entity both checkboxes are disabled and skipped by Tab, so Tab goes from the owner select to whatever follows the block. In the dialog: `keep it with …` first, then `take it`, then `×`.
- Keyboard: select with arrows (change fires as native), Space toggles checkboxes, Escape cancels the dialog only (ped.12: Escape inside an open `<dialog>` does not close the sub-panel).
- Reduced motion: nothing animates.
- No images.

## Tests: `src/components/EntityDmControls.test.ts` (happy-dom, pinia as `SubPanelStack.test.ts`)
`describe('the dm controls')`, DM store, entity mounted as a prop:
1. Renders the three rows for each of party, npc, caravan, ship.
2. Owner `dm → player` on a hidden, hostile dm entity calls through: entity is `owner: 'player', hidden: false, hostile: false` afterwards, and both checkboxes are unchecked and disabled.
3. Owner `player → dm` with no seat changes at once, no dialog.
4. Owner `player → dm` while seated opens the dialog; the select still reads `player`; `keep it with …` leaves owner and seat as they were; `take it` sets `owner: 'dm'` and `playerOf(id)` is null.
5. Hidden checkbox is disabled with the hint `players' entities are always on the map` when owner is player; enabled when dm, and toggling sets `hidden`.
6. Hostile checkbox is disabled with the hint `players' entities are never hostile` when owner is player; enabled with the hint `players see it as a foe` when dm, and toggling sets `hostile`.
7. The owner hint shows only for a dm entity that is hidden, hostile or both, with the copy of the owner-hint table for each of the three cases; none for a plain dm entity or any player entity.
8. Ids are unique per entity (two components for two entities: no duplicate `id` attributes).
Store refusal and clearing (`setEntityHostile` on a player entity, `setEntityOwner`/`assignEntity` clearing hostile), the projection sending `hostile`, and `frameVariant` cases belong to tdj.41 and tdj.30, not here.

## UI review checklist
In a level-1 sub-panel at 1280x800 and 1600x900, and stacked at 768 and 360:
- The block sits at the end of `details`, under darkvision, behind a 1px divider, rows aligned with the rows above.
- For each kind (dm-owned): toggling hidden and hostile recolours the card per the table; owner switches recolour per the table.
- A hidden + hostile dm npc: owner hint reads `handing it to the players shows it on their map and clears hostile`; switching to `player` turns the card steel and leaves both checkboxes unchecked and disabled.
- A seated party set to `dm`: dialog with the player's name, focus on `keep it with …`; Escape keeps it; `take it` unseats (the plate reads `dm`).
- Player-owned, every kind: hidden disabled with `players' entities are always on the map`, hostile disabled with `players' entities are never hostile`; Tab skips both.
- Dm-owned: hostile hint reads `players see it as a foe`.
- Player view (debug toggle): no DM controls; a visible hostile dm npc **is crimson** wherever its card shows (tdj.35 (b)); a hidden one is not on the map at all.

## Assets
None.

## Open questions
None open. Resolved 2026-11-16 by the user:
- **Q1, hostile on carriers** (decision tdj.37): **(a)**, the hostile toggle shows on all four kinds.
- **Q2, hostile on player-owned entities** (decision tdj.38): **(b)**, a player-owned entity may not be hostile; the toggle is disabled for it, and handing an entity to a player clears hostile (store side in tdj.41).
- **Players see hostile** (decision tdj.35): **(b)**, the projection sends `hostile`; hint copy `players see it as a foe`.
