# hexcrawl_web-tdj.4: Character card in the panels

Status: spec, revised 2026-11-14 for the new card shape and the landed one-column dock (tb0, `d3ff28c`); amended 2026-11-14 after the user's answers (tdj.11–tdj.16) and the landed 0zz (`19a0700`) and ped.7 (`1b60325`). Ready to build once 1a1.10 and tdj.3 are rebuilt to their 2026-11-14 specs.

## Changes since a3e3baa
Sections marked **[amended]** changed; the rest is as committed.
- 0zz has landed: only the "with 0zz" placements remain.
- ped.7 has landed: the player's caravan panel is always in the dock, picks `infoCaravan`, and has a **card slot** above its summary `dl`. This bead fills that slot (ped.7 "Card slot"); it is the one player mount in scope.
- tdj.11: the caravan card gets `CaravanCardBody` (gold, merchants) in its slot. Gold is editable for whoever `may('supplies')` (DM only).
- tdj.12: ships get `ShipCardBody` in their slot (proposal, pending the orchestrator). Every card is 652px tall.
- tdj.13: the card may fill the whole panel height and the body scrolls. The fold idea (old open question 3) is dropped.

Depends on:
- `design/hexcrawl_web-1a1.10.md` (CharacterCard, BustPicker, CaravanCardBody, ShipCardBody)
- `design/hexcrawl_web-tdj.3.md` (StatHexagon)
- `design/hexcrawl_web-tb0.md`, `design/hexcrawl_web-0zz.md`, `design/hexcrawl_web-ped.7.md` (all landed)

Scope **[amended]**: the DM's caravan panel and entities panel, plus the player's caravan panel card slot (ped.7). The player's own character card is hexcrawl_web-ped.6, which mounts the same components through the same contract.

## Goal
Whoever looks at an entity sees its card where they already look: at the top of the caravan panel for a caravan, and at the top of the selected-entity section in the entities panel for parties, npcs and ships. The DM picks busts from the card and corrects stats, level and gold on it; the owning player corrects their own stats, level and gold (ped.6 mount).

## Mount points
### 1. Caravan panel (`src/components/CaravanPanel.vue`) **[amended]**
- Position:
  - DM view: first child of `.body` (`#panel-caravan`), above the first `PanelSection` (`caravan.supplies`), outside every section, so it never folds (0zz: "the portrait row, where tdj.4's card goes").
  - Player view: ped.7's card slot, the first child of the body, above the summary `dl`. **Omitted** when the player's subject is this caravan (`store.selectedEntity?.id === caravan.id`): their card shows in the character panel (ped.6). Omitted in the empty state (no `infoCaravan`).
- Markup, both views (`caravan` is the panel's existing computed: `forPlayers ? player.infoCaravan : store.shownCaravan`):
  ```vue
  <CharacterCard class="card" :key="caravan.id" :entity="caravan" :pickable="mayPick" :heading-level="3"
                 @bust="store.setPortrait(caravan.id, $event)">
    <CaravanCardBody
      :gold="(forPlayers ? player.suppliesOf(caravan.id) : store.suppliesOf(caravan.id)).gold"
      :editable="store.may('supplies')"
      :merchants="forPlayers ? player.merchantsOf(caravan.id) : store.merchantsOf(caravan.id)"
      @gold="v => store.setSupply(caravan.id, 'gold', v)" />
  </CharacterCard>
  ```
  `mayPick` is the existing `store.may('entitySettings', caravan)` (DM only). Players get a read-only card: no oval button, gold as text.
- Remove the DM-only "portrait" row (`.portrait-row`), its `PopupDialog`, the `picking` ref and the `CARAVAN_PORTRAITS` / `caravanPortrait` imports.
- The header keeps the pip and name: it still names the panel when folded.
- The `caravan.supplies` section below still shows and edits gold. Both read the same ledger value, so an edit in either place shows in both.

### 2. Entities panel (`src/views/MapView.vue`, hot spot: small template addition plus imports) **[amended]**
- Position: first child of the `entities.selected` `PanelSection` body, above the name row.
- Render only when `!forPlayers && store.selectedEntity && store.selectedEntity.kind !== 'caravan'`. A selected caravan shows its card in the caravan panel only, never twice.
- `<CharacterCard class="card" :key="e.id" :entity="e" :pickable="store.may('entitySettings', e)" :heading-level="4" @bust="store.setPortrait(e.id, $event)">` (`h4` under the section's `h3`). Slot by kind:
  - party, npc (`hasAbilities(e.kind)`):
    `<StatHexagon :abilities="store.abilitiesOf(e.id)" :character="store.characterOf(e.id)" :editable="store.may('abilities', e) && store.may('editCharacter', e)" @ability="(a, v) => store.setAbility(e.id, a, v)" @purse="v => store.setPurse(e.id, v)" @level="v => store.setLevel(e.id, v)" />`
  - ship (proposal, pending the orchestrator):
    `<ShipCardBody :pace-per-turn="e.pacePerTurn" :sight="e.sight" :riders="store.ridersOf(e.id)" />`
- `:key="e.id"` drops any half-typed draft when the selection changes and avoids a crossfade between two entities' busts.

### Spacing (all mounts)
- `.card { margin-block: 0.25rem 0.75rem; }`. The card's own 16px overhang padding gives the crest room under the header.
- **[amended, tdj.13]** Nothing pins, caps, folds or shrinks the card. It may be taller than the visible body; the body scrolls (tb0). The body keeps its `0 1rem 0.75rem` padding.

## Ownership and permissions **[amended]**
| Action | DM | Owning player | Other player | Store guard |
|---|---|---|---|---|
| Pick bust | yes | no | no | `may('entitySettings')` (DM only) |
| Edit STR … CHA | yes | yes | no | `may('abilities')` (`ownsTarget`) |
| Edit level, gold (party, npc) | yes | yes | no | `may('editCharacter')` (`ownsTarget`) |
| Edit caravan gold | yes | no | no | `may('supplies')` (DM only) |
| Merchants, ship pace/sight, riders on the card | read-only for everyone | | | edits stay in their sections and rows |

The DM's entities card is always editable and pickable. The player mounts (caravan slot here, character panel in ped.6) pass the same guard expressions.

## Heights, per breakpoint **[amended]**
Card width is 288px everywhere (1a1.10 Fits). Every kind: card box 652px, 668px with mount margins.
- Desktop 1280×800: column 768px tall, so the card fills most of the open body; the controls under it are reached by scrolling the body. Accepted (tdj.13).
- Tablet 768×1024: as desktop, more room.
- Phone 360×740: an open panel covers the map (tb0); the card is taller than the visible body and scrolls with it (tdj.13).

## States at the mount **[amended]**
| State | Shows |
|---|---|
| nothing selected | No card in entities |
| party / npc selected | Entities: card with StatHexagon |
| ship selected | Entities: card with ShipCardBody |
| caravan selected (DM) | No card in entities; card with CaravanCardBody at the top of the caravan panel |
| player, caravan panel, `infoCaravan` set | Read-only caravan card above the summary `dl` |
| player, subject is the caravan | No card in the caravan panel (ped.6 shows it) |
| player, no caravan | ped.7 empty state; no card |
| selection or `infoCaravan` changes | Card re-keys |
| `entities.selected` folded | Card hidden with the section body |

## Accessibility
- Focus order in the entities body: sections above, then the card (oval button, then the slot's inputs: level, gold, STR … CHA; ships have none), then the name, colour and pace rows.
- Focus order in the caravan body (DM): oval button, gold input, then the sections.
- Card headings: `h3` in the caravan panel (under its `h2`), `h4` in `entities.selected` (under its `h3`).

## Copy
None new here; see the components' copy in 1a1.10 and tdj.3.

## Files touched **[amended]**
- `src/components/CaravanPanel.vue`: card mount in both views; remove the portrait row, dialog and imports.
- `src/views/MapView.vue`: card mount in `entities.selected` with StatHexagon or ShipCardBody; imports. Hot spot: template addition only.

## Acceptance checks (UI review) **[amended]**
At 360, 768 and 1280px, as DM, plus the caravan panel as a player:
1. DM, caravan shown: a bronze 652px card at the top of the caravan body, above supplies, with an editable gold field and the merchant list; the old portrait row is gone. Editing gold on the card updates `caravan.supplies` and back.
2. DM, party or npc selected: card at the top of `entities.selected` with level, gold and the stat hexagon. Ship: card with pace, sight and the aboard list. Caravan: no card in entities.
3. Player, caravan panel with a caravan: read-only card above the summary (no oval button, gold as text). Seated at the caravan: no card there. No caravan: the empty state, no card.
4. All checks in the 1a1.10 and tdj.3 specs hold in place.
5. The body scrolls; crest and foot are not clipped; no horizontal overflow.
6. Changing the selection swaps the card without a stale draft.
7. Folding `entities.selected` hides the card; the caravan card never folds.
