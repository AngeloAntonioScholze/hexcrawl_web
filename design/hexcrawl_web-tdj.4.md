# hexcrawl_web-tdj.4: Character card in the panels

Status: spec, rewritten 2026-11-16 to the current contract: ped.12 sub-panel columns (landed, main `8cfbca4`), the art-frame `CharacterCard` (landed 2026-11-15), and the `EntityCard` + `cardMount` harness from `agent/hexcrawl_web-tdj.4` `f093212`, ported onto main in worktree `hexcrawl_web-tdj.4-col`.

## What changed since the 2026-11-14 version
- **The in-dock mounts are gone.** No card at the top of a dock caravan panel and none in `entities.selected`. The DM caravan panel left the dock (ped.17), and `entities.selected` is player-only on main. The ped.12 "Card mounts: tdj.4 amendment" table is now the contract.
- **One mount**: the `#card` slot of `EntitySubPanel.vue` (row 0, `[data-testid=card-slot]`), for all four kinds, DM view only.
- **The card is `EntityCard.vue`**, the mount wrapper that fills `CharacterCard`'s `slot1..3`, plate and body by kind (from `f093212`). The old per-kind markup (`CharacterCard` + `StatHexagon` / `CaravanCardBody` / `ShipCardBody` written out in each mount) is replaced by it.
- **The ped.27 bust row stays**, below the card, for caravans, as ped.27 (a) put it (see Open question 1).
- **The player mounts move to ped.6**: the character panel card and the read-only card in the player caravan info panel (ped.7 card slot). See `design/hexcrawl_web-ped.6.md`.
- The shield frame, stat circles, `652px` heights and the 288px width are superseded by the art frame (`--card-width: 21.25rem`, frame `aspect-ratio: 340 / 438`).

Depends on (all landed): `design/hexcrawl_web-1a1.10.md` and the 2026-11-15 art rework (`CharacterCard`, `CardTally`, `BustPicker`, `CaravanCardBody`, `ShipCardBody`), `design/hexcrawl_web-tdj.3.md` (`StatHexagon`), `design/hexcrawl_web-ped.12.md` (columns, card slot).

## Goal
For the DM. Opening an entity in a column shows its card first, above its details. The DM reads who it is at a glance and corrects bust, level, gold and stats on the card itself.

## Mount
File: `src/components/EntitySubPanel.vue`. No edit to `MapView.vue`, `CaravanPanel.vue` or `SubPanelFrame.vue`.

```vue
<template #card>
  <EntityCard :key="entity.id" class="card" :entity="entity" :heading-level="3" />
  <!-- caravan only, ped.27 (a): -->
  <div v-if="mayPick" class="row bust-row"> … unchanged … </div>
  <BustPicker v-if="mayPick" v-model:open="picking" … unchanged … />
</template>
```
- The slot always renders for an entity sub-panel now; the `v-if="mayPick"` moves from the `<template #card>` to the bust row and its dialog.
- `mayPick`, `picking`, `bust`, `pick` and the `.bust-row` / `.bust-choose` / `.thumb` rules stay as they are on main.
- `entity` is the sub-panel's prop (the open entity), never `store.selectedEntity`: a rider can be selected while its carrier stays open.
- `:key="entity.id"` re-mounts the card when the column swaps entities, so no half-typed tally carries over.
- `heading-level="3"`: under the column's `h2` title.
- Level 1 and level 2 (a rider opened from its carrier) mount the same way.

### Spacing
- `.card { margin-block: 0.25rem 0.75rem; }` in `EntitySubPanel.vue` (scoped; `EntityCard`'s root is `CharacterCard`'s root, so the class lands on it).
- Bust row under the card: keeps its `margin-top: 0.5rem`; with the card's 0.75rem bottom margin the gap is 1.25rem. Accepted.
- Nothing pins, caps, folds or shrinks the card. The column body scrolls (tdj.13).

### What `EntityCard` fills, per kind (as built in `f093212`, DM view)
| kind | slot1 | slot2 | slot3 | body | plate |
|---|---|---|---|---|---|
| party, npc | `lv` (editable) | `gp` purse (editable, compact) | `sight` (read) | `StatHexagon` (editable) | `played by {name}` / `no player` / `dm`, then `{n} hexes to go` / `riding {carrier}` / `standing` |
| caravan | `gp` caravan gold (editable, `setSupply`) | `pace` (read, decimal) | `sight` (read) | `CaravanCardBody` (merchants, read) | as above |
| ship | `pace` (read) | `sight` (read) | empty | `ShipCardBody` (riders, read) | as above |

Port fixes owed from the 2026-11-15 review (bead notes), to land with this bead:
1. The plate's "hexes to go" reads the store's order through `orderOf({ queue, states }, id).length`, not a copied `orderFor`. (Done in the tdj.4-col working tree.)
2. Player view reads abilities and the character row from the projection. (Done in tdj.4-col; used by ped.6.)
3. No inline `style` on the mount: the `.card` class rule above.
4. Tests: card mounts for party, npc, caravan, ship at level 1 and for a rider at level 2; caravan has the bust row under it; no card in the dock for any kind.

## Ownership and permissions
| Action | DM | Store guard |
|---|---|---|
| Pick bust (card oval) | yes | `may('entitySettings')` |
| Pick caravan bust (bust row) | yes | same; caravan only |
| Edit STR … CHA | yes | `may('abilities')` |
| Edit level, purse (party, npc) | yes | `may('editCharacter')` |
| Edit caravan gold | yes | `may('supplies')` |
| Merchants, riders, pace, sight on the card | read only | edited in their sections and rows |

The caravan gold tally and `caravan.supplies` read the same ledger value; an edit in one shows in the other.

## Sizes, per breakpoint
Card width is `min(100%, 21.25rem)`.
| viewport | where the column is | card width |
|---|---|---|
| 1600px and up | column 2 (and 3 for a rider), `--subpanel-width: 21rem`, content 304px, 296px with the thin scrollbar | 296 to 304px |
| 1280 to 1599px | as above, two-up | 296 to 304px |
| 721 to 1279px (stacked: 1024, 768) | the column replaces the dock at `min(var(--panel-width), 100vw - 2rem)` = 352px, content 320px | 312 to 320px |
| 720px and under (stacked phone, 360) | `calc(100vw - 1rem)` = 344px, content 312px | 304 to 312px |

The frame is about 380 to 390px tall at these widths, plus the body. No cap: the body scrolls.

## States
| state | shows |
|---|---|
| party or npc open | card with lv, gp, sight, stat hexagon |
| caravan open | card with gp, pace, sight, merchant list; bust row under the card |
| ship open | card with pace, sight, aboard list |
| rider open at level 2 | its own card in the level-2 column; the carrier's card stays in level 1 |
| column swaps entity | card re-keys, no stale draft |
| entity has no bust | the card's own empty-oval state (1a1.10) |
| tally input invalid | `CardTally`'s invalid state and title |
| player view | no columns (ped.18), so no mount here; ped.6 owns the player cards |
| dock, any kind, any path (row, `›`, selection) | no card, no bust row, no sheet sections |

## Accessibility
- Focus on open goes to the column title (ped.12). Next Tab: `×` or `‹`, then the card's oval button, then its editable tallies in DOM order (lv, gp; or gp for a caravan), then the stat hexagon inputs, then the bust row button (caravan), then the `details` section toggle.
- Card heading `h3` under the column `h2`.
- Alt text and contrast as 1a1.10 and the art rework.
- Reduced motion: no motion added.

## Copy
None new. Tally words and plate lines are `cardMount.ts` and 1a1.10 copy.

## Files touched
- `src/components/EntityCard.vue`, `src/components/cardMount.ts` (+ tests): ported from `f093212` with fixes 1 to 3.
- `src/components/EntitySubPanel.vue`: the mount, `.card` rule, bust row kept under it.
- `src/composables/usePlayerView.ts`: `orderOf` accepts `{ queue, states }`.
- `src/components/CaravanPanel.vue`, `src/views/MapView.vue`: **no change** (the `f093212` edits to both are not ported).

## UI review checks
At 1600, 1280 and 1024 (stacked), DM view, for party, npc, caravan, ship, each opened by row click and by `›`:
1. The card is the first thing in the column body, centred, no horizontal scroll, crest and plate not clipped.
2. Per-kind slots and body as the table above; lv, gp, stats and caravan gold edit and persist.
3. Caravan: the bust row sits under the card and its picker works; the card's oval picker works too.
4. A rider opened at level 2 shows its own card; the carrier keeps its own.
5. The dock never shows a card, bust row, supplies, inventory, riders or merchants.
6. Player view: no columns, no card from this bead.

## Open question
1. **Bust row under the card (caravan).** The card's oval is a bust picker for every kind, so a caravan has two pickers. ped.27 (a) said tdj.4 deletes the row; the brief for this rewrite keeps it, and the tdj.4-col working tree currently deletes it. Default in this spec: keep it (as briefed). Alternative: delete it, as ped.27 described.
