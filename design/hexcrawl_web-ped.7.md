# hexcrawl_web-ped.7: caravan info panel in the player dock

Status: spec, 2026-11-14. Decided (user answers in decision bead hexcrawl_web-ped.10). **Buildable now**, before ped.5/ped.6 and before the character card (tdj.4).

Builds on:
- `design/hexcrawl_web-tb0.md`: panel anatomy and today's dock
- `design/hexcrawl_web-0zz.md`: the caravan sections `caravan.supplies`, `caravan.inventory`, `caravan.riders` and `caravan.merchants`

Later work that touches this panel (not built here):
- ped.5 + ped.6 (ship together): replace the player's entities panel with the character panel. This panel's rules do not change when they land; see "Dock".
- tdj.4: mounts `CharacterCard` in this panel's card slot. See "Card slot".

**The DM's CaravanPanel behaviour is unchanged**: rendered only while a caravan is shown, with the same content and the same edits.

## Goal
For a player: what the caravan their party travels with is carrying, who rides in it, and what its merchants sell. The panel is always there in their dock, so they never have to select the caravan to find it. The one action: **read**. The panel adds no new player actions; the item transfers `may()` already allows stay.

## Subject
`subject` = `store.selectedEntity` in the player view. Today that can be any entity the entities list selects (local view) or the player's own (joined). After ped.5 it is always one of the player's own characters. The rules below read `subject` and need no change when ped.5 lands.

## Which caravan
`infoCaravan` for the player view, evaluated in this order:
1. The subject itself when it is a caravan.
2. The caravan the subject rides in: `player.carrierOf(subject.id)`, when that is a caravan. Steps 1 and 2 are today's `player.shownCaravan`.
3. Else, if the projection holds **exactly one** visible caravan, that caravan.
4. Else, none: the empty state.

The DM view keeps `store.shownCaravan`.

Put it in `usePlayerView` as `infoCaravan` next to `shownCaravan`, or derive it in CaravanPanel; implementer's call. It reads only the projection, so a hidden caravan is never chosen.

## Dock
Player view, top to bottom:

| # | today (built with this bead) | after ped.5 + ped.6 |
|---|---|---|
| 1 | entities (unchanged) | character |
| 2 | **caravan: always rendered** | caravan: always rendered |
| 3 | hex details: `may('notes')` and a hex is selected (never for players today) | same |

- `rendered.caravan` becomes `forPlayers ? true : !!store.shownCaravan`, so `--dock-rows` is 2 for players.
- For players the caravan panel never stops rendering, so `panelGone('caravan', …)` no longer fires in the player view. When `infoCaravan` changes while the panel is open, it stays open and the content swaps, including to the empty state.
- It never auto-opens (tb0 rule). On desktop and tablet the player's home panel (entities today, character after ped.5) is open at start.

## Header
- With a caravan: pip, caravan name with ellipsis, chevron. This is the existing CaravanPanel header (`.label-row`, `.pip`, `.name`).
- Empty: the text `caravan`, no pip.
- Ids unchanged: `panel-caravan`, `panel-caravan-head`.
- States are tb0's.

Until tdj.4 lands, the header is the panel's only identity for the caravan: pip and name. No extra name line goes in the body.

## Body, player view, top to bottom
| # | block | foldKey | title | meta | contents | player can edit? |
|---|---|---|---|---|---|---|
| 0 | **card slot: empty until tdj.4** | none | none | none | Nothing rendered today: no element, no placeholder, no reserved height. See "Card slot" | no |
| 1 | summary `dl` (new, never folds) | none | none | none | `standing` = the caravan's hex (`player.scene.states.get(id).at`, `—` when off the map). `headed` = the last hex of `orderOf(player.scene, id)`, or `—`. `pace` = `{pacePerTurn} hex a turn`. Same `dl` markup and style as the entities summary | no |
| 2 | supplies | `caravan.supplies` | supplies | none | `CaravanSupplies` as today: food and gold. Its inputs are DM-only (`may('supplies')`), so players see values | no |
| 3 | inventory | `caravan.inventory` | inventory | as 0zz | `InventoryList` as today. Edits and transfers follow `may()`: a player may transfer items between their own character and the caravan, and edit only if they own the caravan | only what `may()` already allows |
| 4 | riders | `caravan.riders` | riders | `{count}` | the rider list. In the player view a rider row is a button **only** when `store.may('order', rider)` (the player's own character); it calls `store.selectEntity`. Every other rider is a plain row with the same grid and no hover. "nobody aboard" when empty | no |
| 5 | merchants | `caravan.merchants` | merchants | `{count}` | `CaravanMerchants` as today: merchants, their type and level, and the service catalog with prices. Its edits are DM-only (`may('merchants')`) | no |

- Not shown to players: the route legs and the caravan's journey log.
- The DM's portrait picker row (`.portrait-row`, gated by `mayPick` = `may('entitySettings')`) is never shown to players. Leave it as is for the DM; tdj.4 decides its fate.
- With the slot empty, the summary `dl` is the first thing in the body, with the body's normal top padding. No spacing value changes when the card arrives later; the card brings its own margin.

### Card slot (for tdj.4, not built here)
- Position: first child of the player-view body, above the summary `dl`.
- Content when tdj.4 lands: `<CharacterCard :entity="infoCaravan">` in its carrier form (portrait and name, no stats), as respecified by the cards epic (hexcrawl_web-tdj). Read only for players.
- Omitted when the subject is this caravan (a player seated at a caravan): their card shows in the character panel instead (ped.6).
- This bead adds no wrapper element or empty `div` for it. tdj.4 inserts the mount at that position.

### Rider row states (player view)
| state | own rider (button) | other rider (row) |
|---|---|---|
| default | as today's `.list button` | same grid, `cursor: default`, no background |
| hover | today's hover background | none |
| current (it is the subject) | `.here` plus `aria-current="true"` | n/a |
| focus-visible | the existing button ring | not focusable |
| title | `give ${name} the orders` (existing) | none |

### Empty state
- When it shows: no caravan by the rule above. That covers several caravans with the subject riding in none, or no visible caravan at all.
- Body: one `p.dim` line, `not travelling with a caravan`, with `padding-top: 0.75rem`.
- No sections.

## Projection (acceptance: DM-only caravan state is not sent)
Nothing the panel shows needs a projection change. Everything listed above is already in `PlayerProjection`: entity, states, queue, supplies for the current turn, merchants, items, catalog overrides.

Test what is already DM-only, so it stays that way:
- A **hidden** caravan has no `entities` row and no `supplies`, `merchants`, `items`, `states` or `queue` rows.
- Supplies are those **at the current turn** only. A ledger entry for a later turn (after a rewind) does not change the projected food or gold.
- A rider of a hidden caravan has `riding: null`. This is already in projection.ts; pin it in this bead's test if no test covers it.

## Breakpoints
As tb0 (360 / 768 / 1280 samples). There is no geometry change. On phone the player sees 2 header rows, and `--dial-top` follows.

## Tokens
None new.

## Copy (English only, lowercase)
New visible text:
- `standing`, `headed` and `pace` as dt labels. The first two already exist in the entities summary.
- `{n} hex a turn`, which is the existing pace phrasing.
- The empty line `not travelling with a caravan`.
- The empty header `caravan`.

## Accessibility
- The tb0 APG disclosure. The accessible name is the caravan name, or `caravan` when empty.
- Tab order: caravan header, then section toggles and any focusable controls in table order. Non-own riders and read-only supplies and merchants have no tab stops.
- `aria-current="true"` marks the subject among the riders.
- Contrast uses existing inks. Target sizes are unchanged. No motion. No images until tdj.4 (the card's alt text comes from the tdj spec).

## UI review checklist
At 360, 768 and 1280, in the player view (local; joined once 05c.9 lands):
- The caravan header is always in slot 2, also with no caravan.
- No card and no empty gap at the top of the body: the summary `dl` comes first.
- The party riding in a caravan shows that caravan.
- The party walking, with one caravan on the map, shows that caravan.
- With two caravans and riding in neither, the empty state shows.
- Supplies, merchants and prices read only. Route legs, journey log and the portrait row are absent.
- The riders list shows only own riders as buttons.
- With the panel open, boarding or leaving a caravan swaps the content in place and does not fold the panel.
- The DM view is unchanged: the panel shows only while a caravan is selected or ridden, with edits and the portrait row.

## Assets
None.

## Decisions (user, 2026-11-14, bead hexcrawl_web-ped.10)
1. Fields: name (header) and card (slot, from tdj.4), summary, food and gold, inventory, riders, merchants with the priced catalog. Route legs and journey log hidden.
2. Which caravan: subject's own caravan, else the one it rides in, else the only visible caravan, else empty (default, no new saved field).
3. Actions: no new actions; keep the item transfers `may()` already allows.
4. Only own riders are buttons (default).
5. Empty copy: `not travelling with a caravan` (default).
