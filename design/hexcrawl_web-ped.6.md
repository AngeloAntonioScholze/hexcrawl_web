# hexcrawl_web-ped.6: my character panel (the cards in the player dock)

Status: spec, revised 2026-11-16 for the ped.12 layout (landed), ped.18 (players get no columns), the art-frame card and `EntityCard` (tdj.4), and the removed dependency on hexcrawl_web-05c.18. User answers: decision beads hexcrawl_web-ped.9 and ped.8, summarised at the end.

**Ships together with ped.5, in one change** (ped.8 Q1). `design/hexcrawl_web-ped.5.md` specifies the player dock and the character panel; this file specifies the cards in it, their data, the edit path and the projection change.

Build waits on: **hexcrawl_web-tdj.4** only (it ports `EntityCard.vue` + `cardMount.ts` onto main, with the player-view reads). Not on 05c.18 any more: owner edits work in the local player view now; carrying a joined player's edits to the host stays in 05c.18.

## What changed since the 2026-11-14 version
- The card is **`EntityCard`**, the mount wrapper around the art-frame `CharacterCard` (no fork, no new props). The sketch-shape interface in the old "The card, by reference only" section is superseded: the shape is the supplied raster frame (PROJECT.md decision 2026-11-15). The sketch `docs/reference/player-card-sketch-2026-11-14.png` stays as history.
- This bead now owns **both player card mounts**: the character panel card, and the read-only caravan card in the player caravan info panel (the ped.7 card slot), which tdj.4 no longer mounts.
- Edit path: local only in this bead.
- Players have no columns (ped.18), so every player card is in the dock.

## Goal
For a player. Their own character's card first in their dock, and the card of the caravan they travel with in the caravan panel. The one action: **the owning player corrects their character's stats, purse or level**, the same edit the DM makes. Everything else on the cards is read only for players.

## Player dock (from ped.5, for orientation)
Top to bottom: **character** (this file's card inside it), **caravan** info (ped.7), **hex details** (rendered only with `may('notes')`, which players lack, so never shown; ped.8 Q7). No world, no entities, no columns.

## Mount 1: character panel card
- Position: section `character.card` in the character panel body, after the switcher (ped.5 row 1), before `orders`.

| # | block | foldKey | title | meta | contents | rendered when |
|---|---|---|---|---|---|---|
| 1b | card | `character.card` | `card` | none | `<EntityCard :key="subject.id" class="card" :entity="subject" :heading-level="4" />` | a character exists |

- `subject` is the ped.5 subject (the player's selected own character), read from `player.scene.entityOf.get(id)`.
- `heading-level="4"`: panel `h2`, section `h3`, card `h4`.
- The section is a 0zz `PanelSection`, so it folds and remembers. On a 360x740 phone the card nearly fills the open body; folding it brings the order buttons up.
- `.card { margin-block: 0.75rem; margin-inline: auto; }` inside the section body.
- Abilities, purse and level live on the card only; no second copy in the panel. Inventory stays a section (`character.inventory`). Name and colour stay inputs in `character.details`; the card's name is read only.

## Mount 2: caravan info card (ped.7 card slot)
- File `src/components/CaravanPanel.vue` (player-only component on main). First child of the body's `v-else` template, above the summary `dl`:
  `<EntityCard :key="caravan.id" class="card" :entity="caravan" :heading-level="3" />`
- `caravan` is `player.infoCaravan`. Panel `h2`, card `h3`.
- **Omitted** when `caravan.id === subject.id` (a player seated at the caravan): its card shows once, in the character panel.
- Omitted in the empty state (`not travelling with a caravan`).
- Read only for players: gold shows as text (`may('supplies')` is DM only), no oval button.
- Same `.card` rule as mount 1: `margin-block: 0.75rem; margin-inline: auto`.

## What `EntityCard` shows in player view
`EntityCard` already switches on `!store.dmView` (tdj.4 fix 2):
| kind | slot1 | slot2 | slot3 | body | plate (one line) |
|---|---|---|---|---|---|
| party, npc | `lv` | `gp` purse | `sight` | `StatHexagon` | `riding {carrier}` / `{n} hexes to go` / `standing` |
| caravan | `gp` caravan gold (read) | `pace` | `sight` | `CaravanCardBody` (merchants) | as above |
| ship | `pace` | `sight` | empty | `ShipCardBody` (riders) | as above |

- Data: abilities and character rows from `player.projection` (`abilities`, `characters`); gold, merchants, riders from `player.suppliesOf / merchantsOf / ridersOf`.
- Editable: `lv` and `gp` by `store.may('editCharacter', entity)`; stats by `store.may('abilities', entity)`. Both are `ownsTarget` for players. Caravan gold by `may('supplies')`, never for players.
- Pickable: `false` in player view (portrait picking stays DM only, ped.9 Q7). No dead tab stop.
- The plate has no "played by" line for players.

## Edit path
- The tallies and stat inputs call `store.setLevel`, `store.setPurse`, `store.setAbility`, each guarded by `may()`.
- **Local player view** (the DM's browser, debug toggle): the store applies it; the projection recomputes; the card shows the new value; toggling back to the DM view shows it in the entity's column card.
- **Joined player**: getting the edit to the host is 05c.18 (guest action relay), not this bead. This bead adds no message types and no pending or error UI; the card always shows the projected value. The "sync to DM" acceptance is checked in the local view here and for joined guests in 05c.18.

## Kind rule
| subject kind | card |
|---|---|
| party, npc | full card, editable by the owner |
| caravan or ship (player seated at a carrier) | carrier card, read only; caravan info panel omits its own card for the same caravan |

## States
| state | shows |
|---|---|
| own party or npc | card, editable |
| subject not editable (e.g. a DM-owned entity reached in local view) | card, read only |
| several characters | card follows the switcher; re-keys on `subject.id`, no carried-over draft |
| no character | no card section; ped.5 empty line |
| section folded | header only; fold persists (0zz) |
| riding a caravan | character card plate says `riding {caravan}`; caravan info shows the caravan's card |
| tally invalid | `CardTally` invalid state and title |
| loading | none (synchronous) |

## Projection (acceptance: only allowed character data is sent)
On main, `projection.ts` sends `abilities` and `characters` for every shown entity of a kind that has them, DM-owned npcs included, in one projection for every guest.
- Rule: send `abilities` and `characters` only for shown entities with `owner === 'player'`.
- Nothing in the player dock shows an npc sheet once ped.5 removes the entities panel, so nothing breaks.
- `items` unchanged (players read their caravan's inventory in the caravan panel).
- Tests: a shown DM npc's abilities and character rows are absent; a shown player party's are present; a hidden player party's are absent.
- Other players' sheets still reach every guest (shared projection); no player UI shows them. Accepted (ped.9 Q4).

## Sizes
`EntityCard` width is `min(100%, 21.25rem)`; dock body content is the panel width minus `2rem` padding.
| viewport | panel width | card width |
|---|---|---|
| 1280 and up | 22rem (352px) | 320px |
| 768 | 352px | 320px |
| 360 | `100vw - 2rem` = 328px | 296px |

No horizontal scroll. The body scrolls vertically.

## Tokens
None new.

## Copy (English, lowercase)
- Section title `card`.
- Everything on the card: `cardMount.ts` and 1a1.10 copy.
- Panel header: pip and character name, `character` when there is none (ped.5).

## Accessibility
- `card` section is a 0zz disclosure. Tab order: `card` toggle, then lv, gp, then the six stat inputs (only when editable), then the `orders` toggle.
- Caravan panel: the card has no focusable controls for players; Tab goes from the caravan header to the first section toggle.
- Headings: card `h4` in the character panel, `h3` in the caravan panel.
- Reduced motion: no motion added.

## UI review checklist
At 360, 768 and 1280, local player view (debug toggle), then toggling back to DM. Run with ped.5's checklist.
- Character card sits under the summary (and the switcher at 2+), centred, no horizontal scroll at 360.
- Party: lv, gp, sight, stat hexagon. Editing lv, gp and a stat works and the value shows in the DM column card after toggling back.
- A DM-owned or other player's entity never shows a card in the player dock.
- Caravan info, riding a caravan: read-only caravan card above the summary; no oval button; gold as text. No caravan: empty line, no card.
- Seated at a caravan: card in the character panel only.
- Folding `card` survives reload.
- Several characters: switching swaps the card.

## Assets
None new.

## Decisions (user, 2026-11-14, bead hexcrawl_web-ped.9; updated 2026-11-16)
1. Panel title: pip and character name, `character` when none.
2. Several characters: ped.5 switcher, card follows. None: ped.5 empty line.
3. Only player-owned entities' abilities, purse and level reach players.
4. Other players' sheets reach every guest; accepted.
5. Card first after the switcher, foldable, titled `card`; abilities, purse, level on the card only. Card look: the art frame (2026-11-15), superseding the sketch layout.
6. Edit sync from a joined player: guest action relay 05c.18. **No longer a dependency** (orchestrator 2026-11-16): local edits ship now.
7. Portrait picking stays DM only.
8. Player seated at a caravan: card in the character panel only.
9. Name and colour stay inputs in `character.details`.
