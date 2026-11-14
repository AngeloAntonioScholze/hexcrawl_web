# hexcrawl_web-ped.6: my character panel (the card in the player dock)

Status: spec, 2026-11-14. Decided (user answers in decision bead hexcrawl_web-ped.9, summarised at the end).

**Ships together with ped.5, in one change** (ped.8 Q1). The build waits on:
- hexcrawl_web-tdj.4: `CharacterCard` in its new shape (cards epic hexcrawl_web-tdj)
- hexcrawl_web-05c.18: the guest action relay, which carries a joined player's edits to the host

Builds on:
- `design/hexcrawl_web-ped.5.md`: the character panel and the player dock. This file adds the card section to that panel, the card's data and edit path, and the projection change.
- The cards epic (hexcrawl_web-tdj) owns the card component: its shape, its parts, their layout, its states, its tokens and its copy. **This spec does not design the card.** It mounts it, feeds it and places it. Reuse `CharacterCard` (and whatever stat component it contains) as the cards epic ships it. Do not fork it.

## The card, by reference only
- The user's sketch of the new card shape, 2026-11-14: `docs/reference/player-card-sketch-2026-11-14.png`. Visual style reference stays `docs/reference/character-card-frame.jpg`.
- The user decided the shape applies to every entity card (parties, npcs, caravans, ships; DM and player views), so the player panel uses the same component as the DM panels. The cards epic manager respecifies it (1a1.10, tdj.3, tdj.4). Their spec is the authority for anything inside the card.
- What this file needs from that spec, as interface only:
  - a component that takes an entity, its ability scores and its character row (level, purse), and an `editable` flag
  - emits for an ability change, a purse change and a level change
  - a carrier form for caravans and ships (no stats)
  - a width that fits the panel content box: 296px on a 360px phone, 320px on tablet and desktop, with no horizontal scroll

The 2026-11-13 version of this file described the card's inner layout (shield frame, stat circles, purse and level under the hexagon, fixed 288 x 620px). That layout is superseded and removed here.

## Goal
For a player: their own character, at a glance, in the first panel of their dock. The one action it drives: **the owning player correcting their character's stats, purse or level**, the same edit the DM can make (tdj decision 2026-10-17). Everything else on the card is read only for the player.

## Where the card goes
In the character panel body, as its own section right after the switcher (ped.5 row 1), before `orders`:

| # | block | foldKey | title | meta | contents | rendered when |
|---|---|---|---|---|---|---|
| 1b | card | `character.card` | `card` | none | `<CharacterCard>` for the subject, in the form the cards epic defines for its kind | a character exists |

- The section is a 0zz `PanelSection`, so a player can fold the card away once and the fold is remembered. On a 360x740 phone the open panel body is about 580px tall, so a tall card can fill it; the fold is the way to reach the order buttons quickly.
- Spacing around the card: `margin-block: 0.75rem` inside the section body, card centred horizontally. Anything inside the card is the cards epic's.
- Abilities, purse and level live on the card only. There is no second copy of them in the panel.
- Inventory stays a panel section (`character.inventory`, ped.5), not on the card.
- Name and colour editing stay as inputs in `character.details` (ped.5). The card's name stays read only.

## Data
| prop (interface above) | source in player view |
|---|---|
| entity | `player.scene.entityOf.get(subject.id)` |
| abilities | new `player.abilitiesOf(id)` reading `projection.abilities` (tdj.4 names this accessor; reuse it) |
| character (level, purse) | new `player.characterOf(id)` reading `projection.characters` |
| editable | `store.may('abilities', entity) && store.may('editCharacter', entity)` |
| portrait pickable | false for players: picking a portrait stays DM-only (`entitySettings`) |

`subject` is the ped.5 subject: the selected own character. The DM has no character panel, so there is no DM-view mount.

### Edit path
- The emits call `store.setAbility(id, ability, value)`, `store.setPurse(id, value)` and `store.setLevel(id, value)`. All three are already guarded by `may()` with `ownsTarget` for players.
- **Local player view** (the DM's browser): the store call applies directly.
- **Joined player**: the call travels to the host through the guest action relay, hexcrawl_web-05c.18. The host checks it with `allowed()` for the guest's seat, applies it, and the normal state sync brings the result back. This bead adds no message types of its own; it uses the relay's whitelisted actions (`abilities`, `editCharacter`).
- No pending indicator. Until the host's next patch, the card shows what the card's own edit states show after a commit. If the host refuses, the next sync restores the host's value.

### Kind rule
| subject kind | card form |
|---|---|
| party, npc | the full card with stats, level and purse (cards epic) |
| caravan, ship (a player seated at a carrier) | the carrier form, no stats (cards epic) |

When the subject is a caravan, ped.7's caravan panel shows the same caravan. The card shows only once: here. The caravan panel omits its card slot when `infoCaravan.id === subject.id` (ped.7 "Card slot").

## States (panel level; everything inside the card is the cards epic's)
| state | what shows |
|---|---|
| own party or npc | the card, editable |
| not editable (a DM-owned subject reached in local view) | the card, read only |
| several characters | the card follows the switcher. Key the card on `subject.id` so switching swaps it instantly, with no carried-over draft or transition between two entities |
| no character | no card section. The ped.5 empty state |
| section folded | the section header only; the fold persists (0zz) |
| loading | none (synchronous) |

## Projection (acceptance: only allowed character data is sent)
Today `projection.ts` sends `abilities` and `characters` for **every** visible party and npc, the DM's npcs included. It sends one projection to every guest (`stateSync.broadcast`).

- Rule: send `abilities` and `characters` only for visible entities with `owner === 'player'`. DM-owned npcs' scores, purse and level stay on the host.
- Nothing in the player dock shows an npc sheet once ped.5 removes the entities panel.
- `items` stay as they are: players read DM-owned caravans' inventories in the caravan panel.
- Projection test:
  - a visible DM npc's abilities and character rows are absent
  - a visible player party's are present
  - a hidden player party's are absent (already true)
- Other players' sheets still reach every guest (shared projection); no player UI shows them. Accepted.

## Tokens
None new in this file. The card's tokens are the cards epic's, recorded in `design/tokens.md` by that epic.

## Copy (English only, lowercase)
- New section title: `card`.
- Everything inside the card comes from the cards epic's copy.
- The panel header stays the ped.5 header: the pip and the character's name, `character` when there is none.

## Accessibility
- The card section is a 0zz disclosure region labelled `card`. The card's own semantics (landmark, labels, alt text, contrast, target sizes) are the cards epic's.
- Tab order: card section toggle, then the card's focusable fields in the card's own DOM order (only when editable), then the `orders` toggle.
- A read-only portrait (players) has no button, so there is no dead tab stop.
- Reduced motion: this bead adds no motion.

## UI review checklist
At 360, 768 and 1280, as owning player (local view and, once 05c.9 lands, joined), and as the DM toggling back. Run together with ped.5's checklist.
- The card section sits right under the summary (and the switcher, with 2+ characters). The card is centred and causes no horizontal scroll at 360.
- The card matches the cards epic's spec in its new shape (sketch: `docs/reference/player-card-sketch-2026-11-14.png`). A party shows stats, level and gold; a carrier seat shows the carrier form.
- The owner can edit stats, level and gold. The change is in the DM view after toggling back, and on the host for a joined guest through the 05c.18 relay.
- Folding `card` survives reload and does not fold `entities.*` or `caravan.*`.
- Several characters: switching swaps the card.
- No character: no card, the empty line shows.
- A caravan seat: its card shows here, not in the caravan panel.

## Assets
None new. The card art comes from the cards epic (placeholders made in-repo today; the final art source is the user's open question in that epic). Reference added: `docs/reference/player-card-sketch-2026-11-14.png`, the user's own sketch.

## Decisions (user, 2026-11-14, bead hexcrawl_web-ped.9)
1. Panel title: pip and character name, `character` when there is none (default, same as ped.5).
2. Several characters: the ped.5 switcher, the card follows it. None: the ped.5 empty line, the panel stays (default).
3. Only player-owned entities' abilities, purse and level reach players (default).
4. Other players' sheets reach every guest; accepted (default).
5. Panel placement: abilities, purse and level on the card only; card first after the switcher, foldable, titled `card` (default). The card's inner layout is superseded by the user's new shape and belongs to the cards epic (hexcrawl_web-tdj, tdj.4).
6. Edit sync from a joined player: guest action relay, hexcrawl_web-05c.18; ped.6 depends on it.
7. Portrait picking stays DM-only (default).
8. A player seated at a caravan: card in the character panel only (default).
9. Name and colour stay inputs in `character.details`; the card's name is read only (default).
