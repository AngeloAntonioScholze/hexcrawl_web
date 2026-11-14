# hexcrawl_web-tdj.3: Stat hexagon

Status: spec, revised 2026-11-14 to the user's new card shape (replaces the 2026-11-10 circles spec). Shape reference: `docs/reference/player-card-sketch-2026-11-14.png`; style: `docs/reference/character-card-frame.jpg`.

What changed:
- Six circles on a flat-top hexagon → a large **pointy-top** hexagon with a **small hexagon on each of its six points**, one stat per small hex.
- The modifier moves out of the stat into a **small circle on the bottom vertex** of each small hex.
- The purse/level box under the hexagon → a **level and gold** row **above** the hexagon (under the card's name).

Kept: component API, presentational rule, commit-on-change, draft handling, limits, states, a11y names, test setup.

## Goal
A party's or npc's level, gold, six ability scores and their roll modifiers, readable at a glance inside the character card. The one action it drives is **the DM or the owning player correcting a number**. Everyone else reads it.

## Files
- `src/components/StatHexagon.vue` (rebuild template and styles; script logic is reused)
- `src/components/StatHexagon.test.ts` (update; `@vue/test-utils` + `happy-dom` as already set up, `// @vitest-environment happy-dom` in this file only)

## Component contract (reused by tdj.4 and ped.6)
Unchanged from the built component:
```ts
props: {
  abilities: Abilities      // store.abilitiesOf(id) or the player projection
  character: Character      // { purse, level }
  editable: boolean         // mount passes store.may('abilities', e) && store.may('editCharacter', e)
}
emits: {
  ability: [ability: Ability, value: number]   // mount -> store.setAbility(id, ability, value)
  purse: [value: number]                       // mount -> store.setPurse(id, value)
  level: [value: number]                       // mount -> store.setLevel(id, value)
}
```
- Presentational: never reads the store, session or panel. Permissions stay in the store (`setAbility`, `setPurse`, `setLevel` are `may()`-guarded).
- `editable` is true for the DM and for the player who owns the entity (`ownsTarget` in `HEX_MAP_RULES` for both `abilities` and `editCharacter`); false for every other player.
- Uses `ABILITIES`, `ABILITY_LIMITS`, `abilityModifier` (`src/entities/abilities.ts`) and `PURSE_LIMITS`, `CHARACTER_LEVELS` (`src/entities/character.ts`).
- The mount renders it only for parties and npcs (`hasAbilities(kind)`), as the card's default slot.
- The stored field stays `purse`; only the visible word becomes "gold".

## Layout
The component fills its container: 256px inside a 288px card. Root `.stats`: `display: grid; justify-items: center; width: 100%; min-width: 14rem`.

```
        level [ 3]    gold [  1250]            tally row, 28px
                                                gap 12px
                   ⬡ STR
                    (+2)
          ⬡ CHA    /    \    ⬡ DEX
           (−1)   /      \    (0)               hexagon box 256×284
                 |        |
          ⬡ WIS   \      /   ⬡ CON
           (+3)    \    /    (+1)
                   ⬡ INT
                    (0)
```

### Tally row (level, gold)
- `display: flex; justify-content: center; align-items: center; gap: 1.5rem; height: var(--card-field-h)` (28px); `margin-bottom: 0.75rem`.
- Two cells, in this order: **level**, **gold**. Each is a `<label class="tally">`: `display: inline-flex; align-items: center; gap: 0.375rem`.
  - Word: "level" / "gold", type per tokens.md Card (0.75rem, `--card-metal-light`).
  - Value: 1rem/600 `--ink`, tabular-nums.
    - Editable: `<input type="number" inputmode="numeric">`, `height: var(--card-field-h)`, `padding: 0 0.375rem`, `text-align: center`, `background: var(--card-window)`, `border: 1px solid var(--card-metal-light)`, `border-radius: var(--radius-control)`, spinners hidden. Widths: level `2.5rem` (fits "20"), gold `4.5rem` (fits "999999"). Limits: level `min=1 max=20 step=1`, gold `min=0 max=999999 step=1`.
    - Read-only: a `<span>` with the same type and no box.
- Widest row (editable, gold 999999) is about 205px, inside 256px.

### Hexagon box
- `position: relative; width: 100%; max-width: 16rem; aspect-ratio: 256 / 284`.
- Geometry in 256×284 units, centre C = (128, 136):
  - Large hexagon, pointy-top, circumradius R = 100.
  - Small hexagons, pointy-top, circumradius r = 34 (58.89 wide, 68 tall), each **centred on a vertex** of the large hexagon.
  - Modifier circles, diameter 28, each centred on the **bottom vertex** of its small hex (small hex centre + (0, 34)).
  - Bounds: top of the STR hex at y 2, bottom of the INT modifier circle at y 284, side hexes span x 12 to 244. No two small hexes touch (vertex spacing 100 > 68), and each side modifier circle ends 18 units above the next small hex's top vertex.

| Ability | Vertex | Small hex centre (units) | left / top | Modifier centre (units) |
|---|---|---|---|---|
| strength | top | (128, 36) | 50% / 12.68% | (128, 70) |
| dexterity | upper-right | (214.60, 86) | 83.83% / 30.28% | (214.60, 120) |
| constitution | lower-right | (214.60, 186) | 83.83% / 65.49% | (214.60, 220) |
| intelligence | bottom | (128, 236) | 50% / 83.10% | (128, 270) |
| wisdom | lower-left | (41.40, 186) | 16.17% / 65.49% | (41.40, 220) |
| charisma | upper-left | (41.40, 86) | 16.17% / 30.28% | (41.40, 120) |

Clockwise from the top, matching `ABILITIES` order, DOM order and tab order.

- **Background SVG**: `<svg viewBox="0 0 256 284" aria-hidden="true">`, `position: absolute; inset: 0`:
  - Large hexagon `points="128,36 214.60,86 214.60,186 128,236 41.40,186 41.40,86"`: fill `var(--card-window)` at `fill-opacity: 0.35`, stroke `var(--card-metal-mid)` 2px.
  - Inner rim `points="128,48 204.21,92 204.21,180 128,224 51.79,180 51.79,92"` (R = 88): no fill, stroke `var(--card-metal-dark)` 1px.
  - The centre stays empty on purpose.

### Stat cell (one per ability)
- Element: editable → `<label class="stat">` (a click anywhere on the small hex focuses its input); read-only → `<div class="stat" role="group">`.
- `position: absolute; width: 23%; aspect-ratio: 58.89 / 68; left/top` from the table; `translate: -50% -50%`. That is 58.89×68px at 256.
- Cell SVG: `<svg viewBox="-29.445 -34 58.89 68" aria-hidden="true">`, `position: absolute; inset: 0; overflow: visible`:
  - `.hex` `points="0,-34 29.445,-17 29.445,17 0,34 -29.445,17 -29.445,-17"`: fill `var(--card-window)`, stroke `var(--card-metal-light)` 1.5px. Metal-light, not mid, because this outline marks an input (3:1 non-text; see tokens.md).
  - `.rim` (r = 30) `points="0,-30 25.98,-15 25.98,15 0,30 -25.98,15 -25.98,-15"`: no fill, stroke `var(--card-metal-dark)` 1px.
  - `.ring` (r = 39) `points="0,-39 33.775,-19.5 33.775,19.5 0,39 -33.775,19.5 -33.775,-19.5"`: no fill, stroke `var(--ink)` 2px, `visibility: hidden` except in the focus state.
- Contents: `position: relative; display: grid; place-items: center; align-content: center; gap: 2px; height: 100%; padding-bottom: 0.875rem` (14px, the part the modifier circle covers):
  1. Abbreviation `STR DEX CON INT WIS CHA`, 0.625rem/600, `letter-spacing: 0.06em`, `--card-metal-light`. Domain abbreviations stay in caps.
  2. Score, 1.25rem/600 `--ink`, tabular-nums:
     - Editable: `<input type="number" min="1" max="20" step="1" inputmode="numeric">`, `width: 75%` (44px at 256), `height: 1.75rem` (28px), no border, transparent background, `padding: 0`, `text-align: center`, spinners hidden (`appearance: textfield`; `::-webkit-inner-spin-button, ::-webkit-outer-spin-button { appearance: none; margin: 0 }`).
     - Read-only: a `<span>`.
  - Stack height 10 + 2 + 28 = 40px, centred in the hex's upper 54px.
- **Modifier circle**: a `<span class="mod">` inside the cell, `position: absolute; left: 50%; top: 100%; translate: -50% -50%; width: 47.5%; aspect-ratio: 1` (28px at 256); `border-radius: 50%; display: grid; place-items: center; background: var(--card-metal-dark); border: 1.5px solid var(--card-metal-light)`. Text 0.75rem/600 `--ink`, tabular-nums.
  - Format with a sign: `+2`, `0`, `−1` (U+2212, no sign for zero).
  - Computed from the score shown; while a draft is invalid, the last valid modifier.
  - Not interactive.

### Hit targets
- Small hex: the whole 58.89×68 label focuses the input (well over 24px). The input itself is 44×28.
- Level and gold fields: 40×28 and 72×28 (≥ 24px tall). The 28px field height is below the app's `--control-h` (32px desktop, 40px phone) on purpose: the tally row sits inside a fixed-width ornate card and a taller field would crowd the name. WCAG 2.2 target size (24px minimum) holds; the label word extends the click area (it is inside the `<label>`).

## States
| State | Small hex | Tally field |
|---|---|---|
| default, read-only | As above. `cursor: default`, no hover change | Text only |
| default, editable | As above, native input | Boxed input |
| hover (editable) | `.hex` fill `color-mix(in srgb, var(--card-metal-dark) 45%, var(--card-window))`; `var(--card-motion-hover)` | Same background mix |
| focus | `.stat:focus-within .ring { visibility: visible }` (shown on mouse focus too: a typing target always shows where you type). Input has `outline: none` | `outline: 2px solid var(--ink); outline-offset: 2px` |
| active / typing | As focus | As focus |
| invalid draft (empty, not an integer, out of limits) | `.hex` stroke `var(--danger)` 2px, `stroke-dasharray: 4 3`; `aria-invalid="true"` | `border: 1px dashed var(--danger)`; `aria-invalid="true"` |
| commit | On `change` (Enter or blur): a finite number emits `Math.round(value)` and the store clamps. Empty or non-numeric emits nothing and reverts. Arrow Up/Down step the native input | Same |
| external change | Unfocused fields show the new prop value; a focused field keeps the draft until commit | Same |
| disabled, loading, empty | None (read-only spans; synchronous reads; not rendered for carriers) | None |
| error | A store refusal re-renders the stored value | Same |

Commit on `change`, not `input`: one undo step per correction.

## Tokens
From `design/tokens.md`, section Card. The component reads them with steel fallbacks so it renders outside a card and in its test: `var(--card-metal-light, #a9c0d8)`, `var(--card-metal-mid, #5b7898)`, `var(--card-metal-dark, #24344a)`, `var(--card-window, #0b1119)`, `var(--card-field-h, 1.75rem)`, `var(--card-motion-hover, 120ms ease-out)`. Invalid uses `--danger` from `:root` (replaces the old local `#ff8a7a`). Motion is colour only; nothing changes under reduced motion.

## Copy (English only)
- Abbreviations: `STR DEX CON INT WIS CHA`.
- Tally words: `level`, `gold`.
- Input `aria-label`s: "strength score" (etc.); "level"; "gold, in coins". Each ability input has `aria-describedby` pointing at its modifier span, whose text reads "modifier +2" (the word "modifier " is in a visually hidden span inside `.mod`).
- Read-only cell: `role="group"`, `aria-label="strength 14, modifier +2"`, inner text `aria-hidden`. Read-only tally: plain text "level 3", "gold 1250".
- Invalid `title`: "a whole number from 1 to 20" (abilities, level), "a whole number from 0 to 999999" (gold).

## Accessibility
- Tab order (DOM order, no positive tabindex): level, gold, STR, DEX, CON, INT, WIS, CHA.
- Every input has an accessible name; the abbreviation alone is not the label.
- Contrast (tokens.md, Card): score `--ink` on window ≥ 15.5:1; abbreviation and tally words in metal-light ≥ 6.9:1; modifier `--ink` on metal-dark ≥ 10.4:1; small hex outline metal-light on the fill ≥ 6.9:1; invalid `--danger` ≥ 6.4:1 plus a dash pattern, so it does not rely on colour (crimson frames are red already).
- Players who don't own the entity: no inputs, no dead tab stops.

## Responsive
Fixed at 256px in both DM mounts (all three breakpoints, see 1a1.10 Fits). The box scales with its width down to `min-width: 14rem` (224px): small hexes 51.5×59.5, modifier circles 24.5px, inputs 38.6px wide; fonts stay. A mount narrower than 14rem is not supported (ped.6 must give at least 14rem of content width).

## Component test (StatHexagon.test.ts)
- `editable: true`:
  - Renders a level input, a gold input and 6 ability inputs, in that DOM order.
  - Changing STR to "15" emits `ability` `['strength', 15]`.
  - Clearing a field emits nothing and restores the value.
  - Changing level to "3" emits `level` `[3]`; changing gold to "250" emits `purse` `[250]`.
- `editable: false`: no `input` elements; level, gold and the six scores are text.
- Modifier circle text: 8 → "−1", 10 → "0", 15 → "+2", 20 → "+5".

## Acceptance checks (UI review)
Card with stats at 360, 768 and 1280px, as DM, as the owning player, as another player:
1. A pointy-top large hexagon with six small pointy-top hexes centred on its vertices, STR at the top and clockwise to CHA at upper-left; small hexes 59×68px at a 288px card; nothing overlaps or clips.
2. Each small hex shows its abbreviation and score; a 28px circle on its bottom vertex shows the signed modifier, which updates after a commit.
3. Level and gold sit on one row under the name, above the hexagon; "999999" fits.
4. DM and owning player: Tab goes level, gold, STR … CHA; the focused small hex shows the white hexagonal ring; tally fields show a 2px ring. Another player: text only, no tab stops.
5. Typing 25 then Enter shows 20; clearing then blurring restores; an invalid draft shows a dashed `--danger` outline and `aria-invalid`.
6. Colours follow the card variant; outside a card the fallback is steel.
7. Native spinners hidden in Chrome and Firefox.
