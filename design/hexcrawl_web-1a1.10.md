# hexcrawl_web-1a1.10: Character card frame and placeholder busts

Status: spec, revised 2026-11-14 to the user's new card shape (replaces the 2026-11-10 shield spec). Final art is deferred. Everything here is designer-specified placeholder art (standalone SVG plus CSS). Real art replaces the files under the same names.

References:
- Style (metals, ornament, palette): `docs/reference/character-card-frame.jpg`. Keep it.
- Shape and layout (decided by the user 2026-11-14): `docs/reference/player-card-sketch-2026-11-14.png`. A tall **rectangle**, an **oval** portrait, then (for people) a large hexagon with a small hexagon on each point. The sketch sets shape only; it shows one small hex as a sample of six.

What changed from the shield spec:
- Shield outline (3-slice top/body/bottom) → rectangle frame (9-slice border) plus a crest and a foot ornament.
- 4:3 rounded bust window → 4:5 oval.
- Stepped name banner with the kind word → a centred name line, no kind word.
- Stat circles, purse box: see `design/hexcrawl_web-tdj.3.md`.

Kept as is: bust registry and ids, bust picker behaviour, frame colour variants and their rule, edit permissions, bust window states, a11y, copy voice.

## Goal
Anyone at the table (DM or player) who selects an entity sees who or what it is at a glance: a bust in an oval inside an ornate frame, with its name under it. The one action the card drives is **the DM choosing a bust**. Stats go in the card's slot (`StatHexagon`, tdj.3). Mounting is tdj.4 (DM panels) and hexcrawl_web-ped.6 (player panel).

Applies to every entity kind:
| kind | card content |
|---|---|
| `party`, `npc` | frame, oval, name, slot with `StatHexagon` (level, gold, hexagon) |
| `caravan`, `ship` | frame, oval, name. No slot: they have no abilities and no character sheet (orchestrator assumption; caravan gold is an open question) |

## Scope for the implementer
Reuse from the already built (uncommitted, review-passed) work in `.worktrees/hexcrawl_web/hexcrawl_web-tdj-design`:
- `src/entities/busts.ts`: `BUSTS`, `bustOf`, `frameVariant` and their tests stay. `FRAME_ART` changes shape (Registry).
- `src/components/BustPicker.vue`: stays; tiles become ovals (Components).
- `src/assets/busts/*.svg`: stay, except the wagon and ship redraw check (Assets).
- `setPortrait` widened to every entity kind in `src/stores/hexMap.ts`, still `may('entitySettings', one)` (DM only), still a bundled id or `null`, with the forbidden-for-players test. Persisted field stays `Entity.portrait`, no migration. Saved maps with an old scenic id keep it and render as "unknown bust".
- Removal of `src/assets/portraits/caravan-*.svg`, `CARAVAN_PORTRAITS` and `caravanPortrait` (confirm with the manager; `PROFESSION_ICONS` stays, 1a1.12 owns it).

Replace:
- `src/assets/frames/<variant>-top|body|bottom.svg` (9 files) → `<variant>-frame.svg`, `<variant>-crest.svg`, `<variant>-foot.svg` (9 files). Delete the old ones.
- `src/components/CharacterCard.vue`: template and styles rebuilt to the layout below. Props and emits unchanged.

## Frame colour rule (unchanged)
| Entity | Variant |
|---|---|
| `caravan` or `ship` (any owner) | **bronze** |
| `party` or `npc` with `owner: 'player'` | **steel** |
| `party` or `npc` with `owner: 'dm'` | **crimson** |

Bronze marks the company's wagons and hulls, steel the players' people, crimson the DM's people. The rule follows `owner`, so reassigning recolours the frame. The seat is ignored on purpose. `frameVariant(entity: Pick<Entity, 'kind' | 'owner'>)`, unit-tested for all 8 pairs.

## Registry (`src/entities/busts.ts`)
```ts
export type FrameVariant = 'steel' | 'bronze' | 'crimson'
export interface Bust { id: string; label: string; url: string }
export const BUSTS: readonly Bust[]
export const bustOf: (id: string | undefined) => Bust | undefined
export const frameVariant: (entity: Pick<Entity, 'kind' | 'owner'>) => FrameVariant
export const FRAME_ART: Readonly<Record<FrameVariant, { frame: string; crest: string; foot: string }>>
```
Ids never change, because maps store them. If real art arrives as PNG or WebP, only import extensions change.

## Tokens
All card tokens live in `design/tokens.md`, section **Card**: variant colours (`--card-metal-light|mid|dark`, `--card-fill-top|bottom`, `--card-window`), sizes (`--card-width`, `--card-pad`, `--card-overhang`, `--card-oval-w`, `--card-oval-h`, `--card-field-h`), card type scale, `--card-motion-hover`, `--card-motion-swap`, and the measured contrast. The variant colours are set on `.character-card[data-variant=…]`, the sizes on `.character-card`. Base tokens (`--ink`, `--danger`, `--surface-deep`, `--line`, `--radius-control`) come from `:root`.

## Layout: `CharacterCard`
```
           /\ /\                 crest 160×40, centred, 16px above the frame
   +======/=====\======+         frame: 8px metal band, ornate 24px corners
   ||    (       )    ||
   ||   (  oval   )   ||         oval 160×200, centred
   ||    (       )    ||
   ||   Name Surname  ||         name line, centred, 24px
   ||  level 3  gold 1250 ||     \
   ||     <hexagon>   ||          > default slot: StatHexagon (people only)
   ||                 ||         /
   +=====\_  ><  _/====+         foot 288×40, 16px below the frame
```
Dimensions at the card's max width (288px):

| part | size | notes |
|---|---|---|
| card root `<article class="character-card">` | `width: min(100%, var(--card-width))` = 288px; `padding-block: var(--card-overhang)` (16px); `margin-inline: auto`; `container-type: inline-size` | no outer margin; the mount sets spacing |
| frame `<div class="frame">` | 288px wide; `position: relative; display: grid; justify-items: center; padding: 1.75rem var(--card-pad)` (28px top and bottom, 16px sides); `border-radius: 4px` | fill: `linear-gradient(180deg, var(--card-fill-top), var(--card-fill-bottom))` |
| oval | `var(--card-oval-w)` × `var(--card-oval-h)` = 160×200 (4:5) | first grid row |
| name | full content width (256px), `margin-top: 0.75rem`, 24px line | |
| slot wrapper | full content width (256px), `margin-top: 0.25rem` | rendered only when `$slots.default` |

Heights at 288px wide:
- Carrier (no slot): frame 28 + 200 + 12 + 24 + 28 = **292px**; card with overhangs **324px**.
- Person (slot = StatHexagon 28 + 12 + 284 = 324px, tdj.3): frame 292 + 4 + 324 = **620px**; card **652px** (aspect about 1 : 2.26).

Fits: panel content width is 320px on tablet and desktop (22rem panel, `0 1rem` body padding) and 312px on a 360px phone (column `100vw - 1rem` = 344px, minus 32px). A thin scrollbar takes up to 8px. So the card is 288px wide at every breakpoint and never scales in the two DM mounts. Below 288px (a future narrow mount) it shrinks with `width: 100%`; the frame, oval and name still fit down to 240px; StatHexagon's own minimum is 14rem (tdj.3).

### Frame construction (fixed art vs stretched)
Three layers, all decorative (`alt=""`, `aria-hidden="true"`, `pointer-events: none`):

1. **Fill**: CSS on `.frame` (the gradient above). Stretches freely.
2. **Rails and corners**: `.frame::after { content: ''; position: absolute; inset: 0; border: 24px solid transparent; border-image: var(--card-frame) 24 / 24px / 0 stretch; pointer-events: none; }`. `--card-frame` is set inline from `FRAME_ART[variant].frame` as `url("…")`, as the built card does with `--card-rails`. The four 24×24 corners are **fixed art**; the four edge segments are **stretched** along their length only, which is safe because the band is uniform along the edge. The centre is not drawn (no `fill` keyword).
3. **Crest and foot**: two `<img>` children of `.frame`, `position: absolute`, **fixed art, never stretched**:
   - crest: `width: 10rem; height: auto` (160×40), `left: 50%; translate: -50% 0; top: calc(-1 * var(--card-overhang))`. It covers frame y 0 to 24, which the 28px top padding clears.
   - foot: `width: 100%; height: auto` (288×40 at max width; scales with the card), `left: 0; bottom: calc(-1 * var(--card-overhang))`. It covers frame y H−24 to H.
   - The article's `padding-block` holds the 16px overhangs, so nothing overflows the card box and no panel scroller clips it.

### Oval (bust window)
- `width: var(--card-oval-w); height: var(--card-oval-h); border-radius: 50%; overflow: hidden; position: relative; display: grid; place-items: center`.
- `background: var(--card-window); border: 3px solid var(--card-metal-mid)`.
- `box-shadow: inset 0 0 0 1px var(--card-metal-dark), inset 0 8px 20px rgb(0 0 0 / 0.6), 0 0 0 1px var(--card-metal-dark), 0 0 0 2px var(--card-metal-light)`. The last two draw a 2px outer bezel line around the metal ring.
- Image: `position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center top`. The 4:3 bust art is cropped at the sides to the central 62.5% (x 48 to 208 of 256). Head-and-shoulder busts lose only shoulder width.
- Strip (pickable only): `position: absolute; left: 0; right: 0; top: 62%; height: 1.5rem; display: grid; place-items: center; background: rgb(0 0 0 / 0.6)`; text per the card type table. At 62 to 74% of the height the oval is at least 147px wide, so the longest strip text ("choose a bust", about 80px) never clips.
- Empty-state mark: a 40px pointy-top hexagon outline, 1.5px `--card-metal-mid`, 60% opacity, centred.

### Name line
- `<h3 class="name">` inside the article (it is the card's heading; mounts sit under an `h3` section title in 0zz, so the mount may pass `heading-level`; see Component contract).
- `margin: 0.75rem 0 0; width: 100%; text-align: center`; type `1.125rem / 1.33`, 600, `--ink`; one line, `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`.
- No kind word on the card. The kind is in the article's accessible name, in the entities list, and in the 0zz section meta.

## Component contract (reused by tdj.4 and ped.6)
`CharacterCard` is presentational. It never reads the store, the router, the session or which panel mounts it. Props in, events out.

```ts
// src/components/CharacterCard.vue
props: {
  entity: Pick<Entity, 'id' | 'name' | 'kind' | 'owner' | 'portrait'>  // DM store or player projection
  pickable: boolean          // mount passes store.may('entitySettings', entity): DM only
  headingLevel?: 2 | 3 | 4   // level of the name heading; default 3
}
emits: {
  bust: [id: string | null]  // mount calls store.setPortrait(entity.id, id)
}
slots: {
  default: stats region under the name. Empty slot: no wrapper is rendered.
}
```
- Root: `<article class="character-card" :data-variant="variant" :aria-label="`${entity.name}, ${entity.kind}`">`. The variant custom properties are set on the root, so slotted children inherit them.
- When `pickable`, the oval is a `<button type="button">` that opens `BustPicker`; otherwise a `<div>`.
- The card sets no outer margin and assumes no panel width beyond its container.

### `BustPicker.vue` (unchanged except tiles)
- Wraps `PopupDialog`. Props `open` (v-model), `name: string`, `current: string | undefined`. Emits `pick: [id: string | null]`; the card relays it as `bust` and closes.
- Title `` `${name}: bust` ``.
- Grid `.busts`: `grid-template-columns: repeat(auto-fill, minmax(6rem, 1fr)); gap: 0.6rem`.
- Tile: a button; thumbnail `aspect-ratio: 4 / 5; border-radius: 50%; overflow: hidden; background: var(--surface-deep)`, image `object-fit: cover; object-position: center top` (the same crop as the card, so the DM sees what the card will show); label under it, 0.78rem.
- First tile "no bust": the oval thumbnail with a dashed 1px `--line-strong` border.
- Current tile: `aria-pressed="true"` and the existing `.here` style. Unknown `current`: no tile pressed.
- Picking closes the dialog; `showModal` returns focus to the oval button.

### Oval states
| State | When | Shows |
|---|---|---|
| default | known bust, not pickable | Image, `alt` = bust label (e.g. "Wizard") |
| default, pickable | known bust, DM | Image `alt=""` (the button carries the name). Strip hidden (`opacity: 0`) |
| hover | pickable | Strip visible; ring `border-color: var(--card-metal-light)`. `var(--card-motion-hover)` |
| focus-visible | pickable | `outline: 2px solid var(--ink); outline-offset: 4px` (follows the ellipse; clears the 2px bezel), plus the strip |
| active | pickable | Image `filter: brightness(0.85)` |
| empty | no `portrait` | Hexagon mark. Pickable: strip always visible, "choose a bust". Read-only: no text |
| unknown id | `portrait` set, `bustOf()` undefined | As empty. Pickable: strip "unknown bust"; the button's `title` gives the stored id. Never cleared automatically |
| loading | image decoding | Window fill only. No spinner (bundled SVGs) |
| error | `@error` | Falls back to empty |
| disabled | none | Not pickable means not a button; no disabled look |

Bust change: crossfade, `opacity` over `var(--card-motion-swap)`. Reduced motion: instant swap.

## Assets (designer-specified placeholders, made in-repo, AGPL with the repo)
All shapes use the variant's metal colours (tokens.md, Card) as hard-coded fills, so the files stay standalone. "Metal gradient" = vertical linear gradient metal-light (top) to metal-mid (bottom). Outline strokes are 1px metal-dark unless stated.

### `src/assets/frames/<variant>-frame.svg` (viewBox `0 0 72 72`, 9-slice source, slice 24)
- **Band**: an 8px ring between the outer rect (0,0)-(72,72) and the inner rect (8,8)-(64,64), `fill-rule: evenodd`, fill metal-mid. A 1.5px metal-light line along the outer edge (inset 0.75) and a 1px metal-dark line along the inner edge.
- **Corners** (top-left drawn, mirrored to the other three; everything stays inside its 24×24 square):
  - Diamond stud: polygon `8,0 16,8 8,16 0,8`, metal gradient, metal-dark stroke.
  - Inner thorns: triangle `16,8 22,8 19,13` on the top arm and `8,16 8,22 13,19` on the left arm, fill metal-mid, metal-dark stroke.
- **Edge segments** (24 to 48 on each side): band only. No ornament: it would visibly stretch.
- Transparent everywhere inside the inner rect.

### `src/assets/frames/<variant>-crest.svg` (viewBox `0 0 160 40`, shown at 160×40)
- Base plate: path `M20 30 Q80 8 140 30 Q80 20 20 30 Z`, metal gradient.
- Centre horns: two curved spikes from bases (70,16) and (90,16) to tips (64,0) and (96,0), curving outward, 6px wide at the base, metal gradient.
- Outer horns: bases (44,22) and (116,22) to tips (36,8) and (124,8), 5px wide at the base, metal gradient.
- Filigree: 2px metal-mid strokes, round caps: `M6 34 Q30 20 56 22` and its mirror `M154 34 Q130 20 104 22`.
- Centre gem: polygon `80,12 85,20 80,28 75,20`, fill metal-light.
- Nothing below y 34 except the plate's lower curve, so the oval stays clear.

### `src/assets/frames/<variant>-foot.svg` (viewBox `0 0 288 40`, shown at width 100%)
- Crossed blades (under everything else): two straight blades, 4px lozenges in metal-light with a 1px metal-dark spine, from (24,6) to (180,36) and mirrored from (264,6) to (108,36). They cross at the centre.
- Axe hooks: crescents about 18×14 at (14,10) and (274,10), opening outward, metal gradient.
- Centre point: polygon `126,14 162,14 144,38`, metal gradient, a nod to the old shield point.
- Transparent elsewhere; between x 40 and 248 above y 14 only the blades show, so the hexagon's bottom modifier circle (tdj.3) stays readable above the frame's inner edge.

### Busts: `src/assets/busts/<id>.svg` (unchanged)
viewBox `0 0 256 192`, transparent, head top near y 24, flat 3–4 tones, rim light `#e6e8ec` at 30% on the upper-left contour, shared palette (skin `#b89a82`, shade `#7d6553`, hair `#3a3530`, metal `#9aa3ad`, one accent at ≤45% saturation). The 14 ids and labels stay: knight, ranger, rogue, wizard, cleric, bard, dwarf, elf, crone, brute, merchant, captain, wagon, ship.

**New rule for the oval crop**: each figure's recognisable silhouette must sit within x 56 to 200 (the oval's central width with a margin). The `wagon` placeholder spans x 40 to 216 today and `ship` likely does too: redraw both narrower (wagon wheels and canvas inside x 60 to 196; ship hull and sail inside x 64 to 192). The others are head-and-shoulders and need no change; the UI review checks all 14.

Real-art brief addition: busts for the oval are 4:5 portrait art, subject centred, head top at about 12% of the height, the oval and name areas kept dark.

## Copy (English only; the repo ships no other language)
Lowercase, as the panels.
- Strip: "choose a bust" (empty), "change bust" (has one), "unknown bust" (unknown id; the long form moved to the button `title`: "stored bust: {id}").
- Oval button `aria-label`: `` `choose a bust for ${name}` ``; with a bust `` `change ${name}'s bust (now ${label})` ``.
- Picker title `` `${name}: bust` ``; first tile "no bust"; other tiles use the bust labels.
- Article `aria-label`: `` `${name}, ${kind}` `` with the raw kind (`party`, `npc`, `caravan`, `ship`).

## Accessibility
- `<article>` labelled "name, kind"; frame, crest, foot and the empty-state mark are `aria-hidden`.
- The name is a heading (`headingLevel`, default `h3`).
- Focus order: the oval button (DM only), then the slot content.
- Keyboard: Enter or Space on the oval opens the picker; Tab through tiles, Enter picks, Esc closes (native `<dialog>`); focus returns to the oval.
- Alt text: read-only bust = bust label; pickable bust image `alt=""` (button is named).
- Target: the oval button is 160×200. Picker tiles at least 6rem wide.
- Contrast: tokens.md, Card. No text sits on frame art: the name sits on the fill, strip text on its own dark strip. Real art must keep the oval and the band between oval and hexagon dark.
- Reduced motion: no crossfade; colour-only hover changes stay.

## Acceptance checks (UI review)
Screens: caravan panel and entities panel (DM), at 360, 768 and 1280px.
1. The card is 288px wide at all three widths, centred, with no horizontal scroll inside the panel.
2. The frame is a rectangle with fixed ornate corners; edges stretch without visible distortion; crest and foot are not cut off by the panel scroller.
3. The oval is 160×200 and centred; busts are not distorted; each of the 14 busts is recognisable in the oval and in the picker (wagon and ship not clipped).
4. Frame variant follows the rule; reassigning the owner recolours it.
5. DM: oval focusable with a visible 2px elliptical ring; Enter opens the picker; picking sets the bust, closes and refocuses; "no bust" clears it.
6. Not pickable: the oval is not focusable and no picker opens.
7. Empty and unknown ids show the empty state; an unknown id survives a reload.
8. A 40-character name ellipsizes on one line.
9. A carrier's card has no slot wrapper: frame height 292px at 288px wide.
10. Reduced motion: no crossfade.

## Open questions
See the report; the manager files them as decision beads. Display typeface (none until the user picks one) stays open from the 2026-11-10 spec.
