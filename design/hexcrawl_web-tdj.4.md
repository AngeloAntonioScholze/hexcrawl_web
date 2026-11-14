# hexcrawl_web-tdj.4: Character card in the DM panels

Status: spec, revised 2026-11-14 for the new card shape and for the landed one-column dock (tb0, `d3ff28c`). Ready to build once 1a1.10 and tdj.3 are rebuilt to their 2026-11-14 specs.

Depends on:
- `design/hexcrawl_web-1a1.10.md` (CharacterCard, BustPicker)
- `design/hexcrawl_web-tdj.3.md` (StatHexagon)
- `design/hexcrawl_web-tb0.md` (one left column, scrolling panel bodies; landed)
- `design/hexcrawl_web-0zz.md` (foldable sections; a parallel epic, may land before or after this bead)

Scope: the **DM** mounts only. The player-side panel and its card are hexcrawl_web-ped.6, which mounts the same components through the same contract. This bead must not stop the caravan card from rendering read-only in the player's caravan panel (see mount 1).

## Goal
The DM sees the selected entity's card where they already look: at the top of the caravan panel for a caravan, and at the top of the selected-entity block in the entities panel for parties, npcs and ships. The DM picks busts from the card and corrects stats, level and gold on it.

## Mount points
### 1. Caravan panel (`src/components/CaravanPanel.vue`)
- First child of `.body` (`#panel-caravan`), above `CaravanSupplies`. With 0zz landed it sits above the first `PanelSection`, outside every section: 0zz names this spot ("caravan: the portrait row, where tdj.4's card goes") as the panel's top summary that never folds.
- `<CharacterCard class="card" :entity="caravan" :pickable="mayPick" :heading-level="3" @bust="store.setPortrait(caravan.id, $event)" />`, no slot.
- `caravan` and `mayPick` are the panel's existing computeds (`forPlayers ? player.shownCaravan : store.shownCaravan`; `store.may('entitySettings', caravan)`). So the player's caravan panel shows the same card read-only, with no extra work.
- Remove the DM-only "portrait" row, its `PopupDialog`, the `picking` ref and the `CARAVAN_PORTRAITS` / `caravanPortrait` imports.
- The header keeps the pip and name: it still names the panel when folded.

### 2. Entities panel (`src/views/MapView.vue`, hot spot: small template addition plus one import pair)
- Placement:
  - With 0zz landed: first child of the `entities.selected` `PanelSection` body, above the name row (0zz: "tdj.4's card goes at the top of this body").
  - Before 0zz: first child of `<div v-if="store.selectedEntity" class="control stack">`, above the name row.
- Render only when `!forPlayers && store.selectedEntity && store.selectedEntity.kind !== 'caravan'`. A selected caravan shows its card in the caravan panel only, never twice.
- `<CharacterCard class="card" :entity="e" :pickable="store.may('entitySettings', e)" :heading-level="headingLevel" @bust="store.setPortrait(e.id, $event)">`
  - `headingLevel`: 4 inside a 0zz section (its title is an `h3`), 3 before 0zz.
  - Default slot, parties and npcs only (`hasAbilities(e.kind)`):
    `<StatHexagon :abilities="store.abilitiesOf(e.id)" :character="store.characterOf(e.id)" :editable="store.may('abilities', e) && store.may('editCharacter', e)" @ability="(a, v) => store.setAbility(e.id, a, v)" @purse="v => store.setPurse(e.id, v)" @level="v => store.setLevel(e.id, v)" />`
  - Ships: no slot.
- `:key="e.id"` on the card, so switching the selection drops any half-typed draft and replays the crossfade cleanly.

### Spacing (both mounts)
- `.card { margin-block: 0.25rem 0.75rem; }`. The card's own 16px overhang padding gives the crest room under the panel header or section header.
- Nothing pins or caps the card: it scrolls with the body (tb0). The body keeps its `0 1rem 0.75rem` padding.

## Ownership and permissions
| Action | DM | Owning player | Other player | Store guard |
|---|---|---|---|---|
| Pick bust | yes | no | no | `may('entitySettings')` (DM only) |
| Edit STR … CHA | yes | yes | no | `may('abilities')` (`ownsTarget`) |
| Edit level, gold | yes | yes | no | `may('editCharacter')` (`ownsTarget`) |

In this bead only the DM mounts the entities card, so `editable` is always true there and `pickable` always true. The guards are still passed through, so ped.6 reuses the exact expressions.

## Heights, per breakpoint
Card widths are 288px everywhere (1a1.10 Fits).
| | carrier card | person card |
|---|---|---|
| card box incl. overhangs | 324px | 652px |
| plus mount margins | 340px | 668px |

- Desktop 1280×800: the column is 768px tall. With entities open and the card in `entities.selected`, the card fills most of one screen of the body; the name, colour and pace rows follow below and are reached by scrolling the body. Accepted (open question 3 offers a fold).
- Tablet 768×1024: as desktop, with more room.
- Phone 360×740: an open panel covers the map (tb0). The person card is about 90% of the body height; the selected-entity controls are one scroll away. With 0zz the DM can fold `entities.list` so the card sits under the header.

## States at the mount
| State | Shows |
|---|---|
| nothing selected | No card (the selected block is not rendered) |
| party / npc selected | Card with StatHexagon |
| ship selected | Card, no slot |
| caravan selected | No card in entities; card at the top of the caravan panel |
| selection changes | Card re-keys; new bust shows without a crossfade from the old entity |
| entity removed | The block disappears with the selection |
| `entities.selected` folded (0zz) | Card hidden with the section body; fold state persists |

## Accessibility
- Focus order inside the entities body: list and controls above, then the card (oval button, level, gold, STR … CHA), then the name, colour and pace rows.
- Card headings: `h3` under the caravan panel's `h2`; `h4` under a 0zz `h3` section title.
- No new copy beyond the components'.

## Copy
None new. The card shows the entity name; the panel header and section title keep theirs.

## Files touched
- `src/components/CaravanPanel.vue`: card mount; remove the portrait row, dialog and imports.
- `src/views/MapView.vue`: card + StatHexagon mount in the selected block; imports. Hot spot: template addition only.

## Acceptance checks (UI review)
At 360, 768 and 1280px, as DM (and the caravan panel once as a player):
1. A selected caravan shows its bronze card, no stats, at the top of the caravan body, above supplies; the old portrait row is gone.
2. A selected party or npc shows its card at the top of the selected block with level, gold and the stat hexagon; a ship shows frame, oval and name only; a caravan shows no card in entities.
3. All checks in the 1a1.10 and tdj.3 specs hold in place.
4. The body scrolls inside itself; crest and foot are not clipped; no horizontal overflow.
5. Changing the selection swaps the card without a stale draft.
6. Player view: the caravan card renders read-only (not focusable); the entities panel shows no card (ped.6).
7. With 0zz: folding `entities.selected` hides the card; the caravan card never folds.
