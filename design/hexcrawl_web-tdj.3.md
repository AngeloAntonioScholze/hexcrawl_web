# hexcrawl_web-tdj.3: Stat hexagon

Status: spec, **art frame rework 2026-11-14**. The layout approved by the user stays: a large pointy-top hexagon, a small hexagon on each vertex, a modifier circle on each small hex's bottom vertex, STR at the top then clockwise DEX, CON, INT, WIS, CHA. What changes: the hexagon sits **below the art frame** (`design/hexcrawl_web-1a1.10.md`), its colours come from the art, and the level and gold row moves **into the frame's slots** (`CardTally`, 1a1.10 "Slots"). Shape reference: `docs/reference/player-card-sketch-2026-11-14.png`; colours: `docs/reference/character-card-frame.jpg`; mock: `design/hexcrawl_web-1a1.10-mock.png`.

## Changes since main `d7517cf` [amended]
- **Tally row removed** from StatHexagon. Level and gold are now `CardTally` instances that the mount places in the card's `slot1` and `slot2` (1a1.10, Slot content). The `character` prop and the `purse` and `level` emits go away; the draft, invalid and commit rules move unchanged into `CardTally`.
- **Restyle to the art**: the large hexagon is a coloured plate like the frame's shield, the small hexes are dark insets like the frame's slots, and the modifier circles are plate-coloured studs. New per-variant values for the `--card-*` tokens, sampled from the art, plus a new `--card-plate` (tokens.md, Card).
- **No SVG gradients**: flat fills only. A `<linearGradient id>` repeated across several cards resolves to the first card's definition. The mock showed a crimson card drawing the steel card's blue plate.

Kept: geometry, the percentage positions, DOM and tab order, the stat cell markup, draft handling, limits, states, a11y names, test setup.

## Goal
A party's or npc's six ability scores and their roll modifiers, readable at a glance under the card's frame. The one action it drives is **the DM or the owning player correcting a score**. Everyone else reads it.

## Files
- `src/components/StatHexagon.vue`: drop the tally row and its props and emits; restyle.
- `src/components/StatHexagon.test.ts`: update.
- Level and gold tests move to `src/components/CardTally.test.ts` (1a1.10).

## Component contract [amended]
```ts
props: {
  abilities: Abilities      // store.abilitiesOf(id) or the player projection
  editable: boolean         // mount passes store.may('abilities', e)
}
emits: {
  ability: [ability: Ability, value: number]   // mount -> store.setAbility(id, ability, value)
}
```
- Presentational: never reads the store, session or panel. `setAbility` stays `may()`-guarded.
- `editable` is true for the DM and for the player who owns the entity (`ownsTarget` in `HEX_MAP_RULES`).
- Rendered by the mount only for parties and npcs (`hasAbilities(kind)`), in the card's default slot.

## Layout
Root `.stats`: `position: relative; width: min(100%, 16rem); min-width: 14rem; aspect-ratio: 256 / 284; margin-inline: auto`. The card puts it 0.5rem below the frame. It is 256×284px in every current mount (card 296 to 340px wide).

Geometry is unchanged, in 256×284 units with centre C = (128, 136):
- Large hexagon, pointy-top, R = 100.
- Small hexagons, pointy-top, r = 34 (58.89×68), centred on the large hexagon's vertices.
- Modifier circles, diameter 28, centred on each small hex's bottom vertex.

| Ability | Small hex centre (units) | left / top | Modifier centre |
|---|---|---|---|
| strength | (128, 36) | 50% / 12.68% | (128, 70) |
| dexterity | (214.60, 86) | 83.83% / 30.28% | (214.60, 120) |
| constitution | (214.60, 186) | 83.83% / 65.49% | (214.60, 220) |
| intelligence | (128, 236) | 50% / 83.10% | (128, 270) |
| wisdom | (41.40, 186) | 16.17% / 65.49% | (41.40, 220) |
| charisma | (41.40, 86) | 16.17% / 30.28% | (41.40, 120) |

### Background SVG [amended: styles]
`<svg viewBox="0 0 256 284" aria-hidden="true">`, `position: absolute; inset: 0`. Three polygons, flat fills, no `<defs>`:
1. **Plate** (R = 100) `points="128,36 214.60,86 214.60,186 128,236 41.40,186 41.40,86"`: `fill: var(--card-plate); stroke: var(--card-metal-mid); stroke-width: 2`. Echoes the frame's shield body.
2. **Highlight** (R = 94) `points="128,42 209.41,89 209.41,183 128,230 46.59,183 46.59,89"`: `fill: none; stroke: var(--card-metal-light); stroke-opacity: 0.35; stroke-width: 1`. The art's bevel line inside the rim.
3. **Well** (R = 62) `points="128,74 181.69,105 181.69,167 128,198 74.31,167 74.31,105"`: `fill: var(--card-window); fill-opacity: 0.55; stroke: var(--card-metal-dark); stroke-width: 1`. A dark inset like the frame's panels, so the empty centre reads as deliberate.

### Stat cell
Markup, size and contents unchanged (label or group, cell SVG, abbreviation, score, modifier). New colour roles:
- `.hex` (r = 34): `fill: var(--card-window); stroke: var(--card-metal-light); stroke-width: 1.5`. The small hexes are the dark insets, as the frame's slots are; the light outline marks them as inputs (3:1 non-text, below).
- `.rim` (r = 30): `fill: none; stroke: var(--card-metal-dark); stroke-width: 1`.
- `.ring` (r = 39): `stroke: var(--ink)` 2px, visible on focus only (unchanged).
- Abbreviation: 0.625rem/600, `letter-spacing: 0.06em`, `--card-metal-light`.
- Score: 1.25rem/600 `--ink`, tabular-nums; the input rules are unchanged.
- **Modifier circle** [amended]: `background: var(--card-plate); border: 1.5px solid var(--card-metal-light); box-shadow: 0 0 0 1px var(--card-metal-dark)`. Text 0.75rem/600 `--ink`, tabular-nums; format `+2`, `0`, `−1` (U+2212). The plate fill (was metal-dark) makes it a stud of the same metal as the big hexagon.

## States
| State | Small hex |
|---|---|
| default, read-only | As above; `cursor: default`, no hover change |
| default, editable | Native input |
| hover (editable) | `.hex` fill `color-mix(in srgb, var(--card-plate) 45%, var(--card-window))`; `var(--card-motion-hover)` |
| focus | `.stat:focus-within .ring { visibility: visible }`; input `outline: none` |
| invalid draft | `.hex` stroke `var(--danger)` 2px, `stroke-dasharray: 4 3`; `aria-invalid="true"` |
| commit | On `change`: a finite number emits `Math.round(value)` and the store clamps; empty or non-numeric reverts |
| external change | Unfocused cells show the new prop; a focused cell keeps its draft |
| disabled, loading, empty, error | None (read-only spans; synchronous reads; a store refusal re-renders the stored value) |

## Tokens
From tokens.md, section Card. The component reads them with **steel** fallbacks so it renders outside a card and in its test: `var(--card-metal-light, #a5b2bf)`, `var(--card-metal-mid, #7e8c9c)`, `var(--card-metal-dark, #17293d)`, `var(--card-plate, #1a314d)`, `var(--card-window, #0b1014)`, `var(--card-motion-hover, 120ms ease-out)`. Invalid uses `--danger`. Motion is colour only.

## Copy (English only)
- Abbreviations: `STR DEX CON INT WIS CHA`.
- Input `aria-label`s: "strength score" and so on, with `aria-describedby` pointing at the modifier ("modifier +2", where "modifier " is visually hidden).
- Read-only cell: `role="group"`, `aria-label="strength 14, modifier +2"`.
- Invalid `title`: "a whole number from 1 to 20".

## Accessibility
- Tab order: STR, DEX, CON, INT, WIS, CHA. In the card it comes after the pick button and the editable slots (1a1.10).
- Contrast (tokens.md, Card), worst variant: score `--ink` on `--card-window` 15.6:1; abbreviation `--card-metal-light` on `--card-window` 6.7:1; modifier `--ink` on `--card-plate` 10.8:1; small hex outline `--card-metal-light` against the plate around it 5.1:1 (3:1 non-text); invalid `--danger` on `--card-window` 6.5:1, plus the dash pattern.
- Players who don't own the entity: no inputs, no dead tab stops.

## Responsive
256px wide in all current mounts. It scales down to `min-width: 14rem` (224px): small hexes 51.5×59.5, circles 24.5px; fonts stay.

## Component test (StatHexagon.test.ts)
- `editable: true`: renders 6 ability inputs in STR..CHA DOM order; changing STR to "15" emits `ability` `['strength', 15]`; clearing restores and emits nothing.
- `editable: false`: no `input` elements; six scores as text.
- Modifier text: 8 → "−1", 10 → "0", 15 → "+2", 20 → "+5".
- No level or gold inputs (moved to `CardTally.test.ts`).
- The rendered SVG has no `<defs>` and no `id` attributes.

## Acceptance checks (UI review)
Card with stats at 360, 768 and 1280px, as DM, as the owning player, as another player; one card per variant:
1. The hexagon sits 8px under the frame's shield point, centred, 256×284; layout as approved (STR top, clockwise to CHA; small hexes 59×68px; modifier circles on the bottom vertices).
2. Colours follow the card's variant: steel plate is blue-grey, bronze brown, crimson red, matching the frame above. No variant shows another variant's colour (the gradient-id trap).
3. The small hexes read as dark insets with a light outline; the modifier circles read as metal studs.
4. DM and owning player: Tab goes STR … CHA after the frame's slots; the focused small hex shows the hexagonal ring. Another player: text only.
5. Typing 25 then Enter shows 20; clearing then blurring restores; an invalid draft shows a dashed `--danger` outline and `aria-invalid`.
6. Outside a card the fallback is steel.
