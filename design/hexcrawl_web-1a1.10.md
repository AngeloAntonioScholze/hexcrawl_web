# hexcrawl_web-1a1.10: Character card on the supplied art frame

Status: spec, **art frame rework 2026-11-14** (supersedes the hand-built 9-slice frame, crest, foot and oval of the earlier 2026-11-14 revision). Written against main `d7517cf`, where `CharacterCard.vue`, `BustPicker.vue`, `CaravanCardBody.vue`, `ShipCardBody.vue`, `cardBody.ts`, `StatHexagon.vue` exist unmounted.

Why: the user validated the card's layout in the tdj.4 harness but rejected the look ("LAYOUT OK, LOOKS BAD") and asked for the supplied art instead of built shapes. Decisions fixed by the user (bead notes 2026-11-14, decision tdj.19 = a):
- Crop the three frames from `docs/reference/character-card-frame.jpg` (1156×912 JPG on black). No better source exists.
- The art frame is the **top** of the card, used as drawn: portrait in its window, name in its banner, numbers in its three small slots, the lower trapezoid panel as proposed here.
- The stat hexagon sits **below** the frame, restyled to the art's colours (tdj.3).
- Frame colour by owner, kind and hidden (rule below).
- Caravan card keeps gold and the merchant list; ship card keeps pace, sight and the aboard list.
- Name font stays Inter Tight 600 (checked against the art below: kept).
- Components stay container-agnostic (mounted in the ped.12 sub-panel column).

Mock of this spec (built from the real crops, rendered in Chromium at 340px and 296px card widths): `design/hexcrawl_web-1a1.10-mock.png`. Crop and cut-out tool: `design/tools/card-frames.mjs`.

## Goal
Anyone at the table who opens an entity sees who or what it is at a glance: its bust in the frame's window, its name on the banner, three key numbers in the slots, who plays it and what it is doing on the lower plate. The one action the card drives is **the DM choosing a bust**. Numbers that the viewer may edit (level, gold) are edited in place in the slots.

| kind | frame | below the frame |
|---|---|---|
| `party`, `npc` | art frame | `StatHexagon` (tdj.3) |
| `caravan` | art frame | `CaravanCardBody` (merchant list) |
| `ship` | art frame | `ShipCardBody` (aboard list) |

## Frame colour rule (tdj.19 = a) [amended]
Fields on `Entity` (`src/entities/entity.ts`): `kind`, `owner: 'player' | 'dm'`, `hidden: boolean` ("kept off the players' map"). There is **no hostile field**. New DM entities start hidden (`newEntity`: `hidden: owner === 'dm'`); `assignEntity` sets `owner: 'player', hidden: false`.

One function, in `src/entities/busts.ts`, checked in this order:
```ts
export const frameVariant = (entity: Pick<Entity, 'kind' | 'owner' | 'hidden'>): FrameVariant => {
  if (entity.hidden) return 'crimson'                               // hidden DM entity
  if (entity.kind === 'caravan' || entity.kind === 'ship') return 'bronze'
  return entity.owner === 'player' ? 'steel' : 'bronze'             // visible DM party/npc = bronze
}
```
| hidden | kind | owner | variant |
|---|---|---|---|
| true | any | any | **crimson** |
| false | caravan, ship | any | **bronze** |
| false | party, npc | player | **steel** (blue) |
| false | party, npc | dm | **bronze** |

- "Hostile" has no data yet, so this build's crimson means **hidden** only. Q2 answered (b): a saved `hostile` field and `hidden || hostile` come in hexcrawl_web-tdj.30, not here.
- Carriers are checked before owner. Today the add row in MapView creates every entity with `owner: 'player'`, so an owner-first rule would turn every caravan blue (Q3 answered (a): carriers first).
- Players never see crimson: the projection drops hidden entities.
- Unit test: all 16 combinations (2 hidden × 4 kinds × 2 owners).
- `CharacterCard`'s `entity` prop gains `'hidden'` in its `Pick`.

## Art frame
### Source and crop boxes
Source: `docs/reference/character-card-frame.jpg`, 1156×912, background max(R,G,B) ≤ 6 (measured over y 700 to 911). Measured bounds of each frame (max channel > 12): steel x 49–377, y 119–550; bronze x 410–734, y 118–551; crimson x 767–1106, y 116–551. The three frames are **not** the same drawing at three tints: shield widths differ (steel 260, bronze 257, crimson 269px), the bronze window has an arched top, and the slot rows sit at different heights. So every variant gets its own region map (below).

All three are cropped to **one size, 340×438**, each centred on its shield's outer edges (steel 83–343, bronze 444–701, crimson 803–1072) so the cards line up:

| variant | crop box in source px (x, y, w, h) | source x range | source y range |
|---|---|---|---|
| steel | 43, 115, 340, 438 | 43–382 | 115–552 |
| bronze | 402, 115, 340, 438 | 402–741 | 115–552 |
| crimson | 767, 115, 340, 438 | 767–1106 | 115–552 |

Every ornament (crest horns, side spears, crossed blades) is inside its crop. The card box **is** the crop box, so nothing overhangs the card and no panel scroller can clip an ornament.

### Black background: cut out to alpha [decision]
The black is keyed to alpha once, at build time; no CSS blend mode at runtime. Why:
- `mix-blend-mode: screen` or `lighten` would also lift the art's dark window, banner, slots and plate (their max channel is only 8 to 40) toward the panel colour. That washes out the text on them, and the map would show through the 94% panel.
- A plain luminance key would punch holes in those same panels: their darkest pixels (8) are barely above the background (≤ 6).
- A cut-out PNG/WebP looks the same on any surface: dock, sub-panel, phone.

**Method** (implemented in `design/tools/card-frames.mjs`; restated here so it can be rebuilt):
1. Draw the crop into a canvas; m = max(R, G, B) per pixel.
2. **Background set**: every 4-connected component of pixels with m ≤ 14 that contains at least one pixel with m ≤ 4. This catches the outer black and the enclosed pockets between ornaments. The frame's dark panels are never caught, because they are enclosed by the metal rim (m ≥ 35) and never reach m ≤ 4.
3. For background pixels: alpha = clamp((m − 4) / (14 − 4), 0, 1). Colour is un-premultiplied against black, c = min(255, c / alpha), so the antialiased ornament fringe keeps its metal tint instead of going grey. Every other pixel stays opaque and unchanged.
4. No blur or feather pass. The 4-to-14 ramp is the feather (1 to 2px on the ornament edges). A blur would thin the 1px spear and horn tips.

Result: the keyed edges are clean over `#1d2026` at 3× zoom. A faint dark line hugs the shield's outer rim; it reads as a contact shadow and stays.

### Window mask
The portrait is drawn **over** the art's window and clipped to the window's exact shape, which differs per variant (rounded rectangle with a notch at the bottom left for the banner; bronze has an arched top). One mask per variant, made by the same tool:
1. Region grow from a seed inside the window, accepting 4-neighbours with m ≤ limit **and** |m − m(previous)| ≤ 2. The art's rims are steps of 10 or more; the window's own gradient changes by about 1 per pixel. Seeds in source px, with limits: steel (213, 290) ≤ 44; bronze (572, 290) ≤ 44; crimson (933, 290) ≤ 42.
2. Bronze only: the inner band around its window is as dark as the window, so the grow is clipped to x 465–680 and y ≥ 177 + 0.0034 × (x − 572.5)² + 1 (source px; the arch was fitted to edge samples at x 468, 530, 550, 572, 600, 630, 660, 675 to within 2px).
3. Fill pinholes: pixels inside the region's bounding box that are not connected to the box edge outside the region.
4. Erode 1px (so the bust never touches the rim), then a 3×3 box blur. Write it as a white RGBA PNG at the window's bounding-box size; alpha = mask.

Measured window boxes match the edge profiles: steel window x 98–327, y 187–396 in source px, which is crop (55, 72) 230×210.

### Files, sizes, HiDPI
| file | size | format | ships |
|---|---|---|---|
| `src/assets/frames/steel-frame.webp`, `bronze-frame.webp`, `crimson-frame.webp` | 340×438 | WebP, lossy q 0.92 with alpha (Chromium canvas encoder), about 15 KB each | yes |
| `src/assets/frames/steel-window.png`, `bronze-window.png`, `crimson-window.png` | window box (230×210, 215×229, 239×220) | PNG RGBA, white + alpha, about 2 KB each | yes |
| `<v>-frame.png`, `slots.json` | — | lossless copy and measured regions, for checking | no (tool output only) |

Run from the hexcrawl_web root: `node design/tools/card-frames.mjs docs/reference/character-card-frame.jpg src/assets/frames`, then delete the `*-frame.png` and `slots.json` it also writes. `--preview` writes keyed previews with a region overlay.

HiDPI: the source is 1×, so the card **never displays the art above 1 CSS px per source px**. `--card-width` is 340px, the crop width. In the 21rem sub-panel (296 to 304px content) the art shows at 0.87 to 0.89. On DPR 2 screens it is upsampled and looks soft; that is accepted (bead note: "1x resolution, soft on HiDPI"). Use `image-rendering: auto` (smooth), never `pixelated` or `crisp-edges`: the art is painterly. No `srcset` today. If a 2× source arrives, re-run the tool with every crop number doubled, add `<v>-frame@2x.webp` and `srcset="… 2x"`, and keep the % region map unchanged.

### Region map (crop px; % of the 340×438 crop)
Measured by region grow (same rule as the window), normalised to one height per variant's slot row. Positions in CSS are `left / top / width / height` in % of the frame box, so they scale with the card.

**Steel** (crop 43, 115)
| region | x, y, w × h | left / top / width / height % | holds |
|---|---|---|---|
| window | 55, 72, 230 × 210 | 16.18 / 16.44 / 67.65 / 47.95 | bust (masked) |
| pick | 55, 72, 230 × 191 | 16.18 / 16.44 / 67.65 / 43.61 | DM bust button (window down to 4px above the banner) |
| banner | 56, 267, 107 × 15 | 16.47 / 60.96 / 31.47 / 3.42 | name |
| slot 1 | 67, 294, 65 × 15 | 19.71 / 67.12 / 19.12 / 3.42 | see Slot content |
| slot 2 | 138, 294, 65 × 15 | 40.59 / 67.12 / 19.12 / 3.42 | |
| slot 3 | 209, 294, 65 × 15 | 61.47 / 67.12 / 19.12 / 3.42 | |
| plate (trapezoid) | 68, 317, 205 × 50; top edge x 70–270, bottom edge x 82–257 | 20.00 / 72.37 / 60.29 / 11.42 | — |
| plate text box | 82, 317, 175 × 50 | 24.12 / 72.37 / 51.47 / 11.42 | two plate lines |

**Bronze** (crop 402, 115)
| region | x, y, w × h | left / top / width / height % |
|---|---|---|
| window (arched top) | 63, 64, 215 × 229 | 18.53 / 14.61 / 63.24 / 52.28 |
| pick | 63, 64, 215 × 211 | 18.53 / 14.61 / 63.24 / 48.17 |
| banner | 64, 279, 100 × 14 | 18.82 / 63.70 / 29.41 / 3.20 |
| slot 1 | 74, 304, 61 × 15 | 21.76 / 69.41 / 17.94 / 3.42 |
| slot 2 | 140, 304, 62 × 15 | 41.18 / 69.41 / 18.24 / 3.42 |
| slot 3 | 207, 304, 61 × 15 | 60.88 / 69.41 / 17.94 / 3.42 |
| plate | 75, 326, 193 × 47; top x 76–265, bottom x 89–252 | 22.06 / 74.43 / 56.76 / 10.73 |
| plate text box | 89, 326, 163 × 47 | 26.18 / 74.43 / 47.94 / 10.73 |

**Crimson** (crop 767, 115)
| region | x, y, w × h | left / top / width / height % |
|---|---|---|
| window | 51, 62, 239 × 220 | 15.00 / 14.16 / 70.29 / 50.23 |
| pick | 51, 62, 239 × 201 | 15.00 / 14.16 / 70.29 / 45.89 |
| banner | 51, 267, 112 × 15 | 15.00 / 60.96 / 32.94 / 3.42 |
| slot 1 | 63, 295, 68 × 16 | 18.53 / 67.35 / 20.00 / 3.65 |
| slot 2 | 137, 295, 68 × 16 | 40.29 / 67.35 / 20.00 / 3.65 |
| slot 3 | 211, 295, 67 × 16 | 62.06 / 67.35 / 19.71 / 3.65 |
| plate | 63, 319, 215 × 52; top x 65–275, bottom x 80–260 | 18.53 / 72.83 / 63.24 / 11.87 |
| plate text box | 80, 319, 180 × 52 | 23.53 / 72.83 / 52.94 / 11.87 |

In source px add the crop origin (for example the steel banner is source x 99–205, y 382–396).

At the 296px card width (scale 0.871) a slot is about 57×13px, the banner 93×13px, the plate text box 152×44px.

## Registry (`src/entities/busts.ts`) [amended]
```ts
export type FrameVariant = 'steel' | 'bronze' | 'crimson'
export interface FrameBox { left: number; top: number; width: number; height: number }   // % of the frame box
export interface FrameArt {
  frame: string            // url of <v>-frame.webp
  window: string           // url of <v>-window.png
  regions: { window: FrameBox; pick: FrameBox; banner: FrameBox; slots: readonly [FrameBox, FrameBox, FrameBox]; plate: FrameBox }
}
export const FRAME_ART: Readonly<Record<FrameVariant, FrameArt>>   // values: the % columns above (plate = plate text box)
export const frameVariant: (entity: Pick<Entity, 'kind' | 'owner' | 'hidden'>) => FrameVariant
```
`BUSTS` and `bustOf` stay as they are. A unit test asserts that every region box lies inside 0 to 100 and that the three slots of a variant do not overlap.

## Layout: `CharacterCard` [amended]
```
 article.character-card            width min(100%, 340px), container-type inline-size
 ┌ .frame (aspect-ratio 340/438) ─────────────┐
 │ img.art            the variant's webp, inset 0               │
 │ .window            bust, masked to the art's window          │
 │ button.pick        DM only, over the window                  │
 │ h3.name            in the banner                             │
 │ .slot ×3           named slots slot1 / slot2 / slot3         │
 │ .plate             plate lines                               │
 └──────────────────────────────────────────────┘
 default slot          StatHexagon / CaravanCardBody / ShipCardBody, margin-top 0.5rem
```
- Root `<article class="character-card">`: `width: min(100%, var(--card-width)); margin-inline: auto; display: grid; justify-items: center; container-type: inline-size`. No outer margin, no padding, no background (the art carries its own).
- `.frame`: `position: relative; width: 100%; aspect-ratio: 340 / 438`. Every child below is `position: absolute` with `left/top/width/height` from `FRAME_ART[variant].regions` as inline style.
- `img.art`: `inset: 0; width: 100%; height: 100%; image-rendering: auto; user-select: none; pointer-events: none`, `alt=""`, `aria-hidden="true"`, `draggable="false"`, `decoding="async"`.
- Heights: frame = 438 × width / 340 (438px at 340, 381px at 296). With StatHexagon below: 438 + 8 + 284 = **730px at 340**, 673px at 296. tdj.13 still holds: the card may fill the panel height and the panel body scrolls.
- Fits: sub-panel content is 304px (296px with a scrollbar), the dock 320px, the phone column 312px. So the card is 296 to 320px in every mount and 340px only in a wider one. It works down to 240px (slot text hits its 10.5px floor and clips with ellipsis); below that is unsupported.

### Window (bust)
- `.window`: region `window`; `mask-image: url(<v>-window.png); mask-size: 100% 100%; mask-repeat: no-repeat` (plus the `-webkit-` forms); `overflow: hidden`.
- Bust `<img>`: `width: 100%; height: 100%; object-fit: cover; object-position: center top`. The bust SVGs are transparent, so the art's own dark window shows behind them; there is no fill colour.
- Shade: `.window::after { content: ''; position: absolute; inset: 0; background: linear-gradient(180deg, transparent 55%, rgb(0 0 0 / 0.5)); pointer-events: none }`. It is masked with the window, gives the bust depth and darkens the zone above the banner.
- Empty state mark: the existing 40px hexagon outline, 1.5px `--card-metal-light` at 50% opacity, centred in the window.
- Bust swap: crossfade `opacity` over `var(--card-motion-swap)`; instant under reduced motion.

### Bust picker trigger (DM only) [amended]
The trigger stays on the portrait. The **window** is the button:
- When `pickable`: `<button type="button" class="pick">` in region `pick` (the window down to 4px above the banner, so a click on the name never opens it). Transparent background, no border, `border-radius: 8px` (the window's corner radius, about 8 crop px).
- Strip: `position: absolute; left: 0; right: 0; bottom: 0; height: 1.5rem; display: grid; place-items: center; background: rgb(0 0 0 / 0.6)`; text per the card type table. Hidden (`opacity: 0`) on a known bust; shown on hover and focus-visible; always shown when empty or unknown.
- When not pickable: no button, no strip; the bust `<img>` carries `alt` = bust label.

| state | shows |
|---|---|
| default, read-only | bust; `alt` = label |
| default, pickable | bust `alt=""` (the button is named); strip hidden |
| hover | strip visible; `var(--card-motion-hover)` |
| focus-visible | `outline: 2px solid var(--ink); outline-offset: 2px`, plus the strip |
| active | bust `filter: brightness(0.85)` |
| empty (no `portrait`) | hexagon mark; pickable: strip "choose a bust" always visible |
| unknown id | as empty; pickable: strip "unknown bust", `title` "stored bust: {id}"; never cleared automatically |
| loading | art window only, no spinner |
| error (`@error`) | falls back to empty |

### Name in the banner
- `<h3 class="name">` (level from `headingLevel`, default 3) in region `banner`. `margin: 0; padding: 0 3.6% 0 1.8%` (% of the banner, keeps the text off the sloped right end); `display: block; line-height` = the banner height (`calc(100cqw * 15 / 340)`, 14 for bronze); one line, `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`.
- `font: 600 max(11px, 3.53cqw) / inherit var(--card-name-font)`: 12px at 340, 11px at 312 and below. `color: var(--ink); text-shadow: 0 1px 1px rgb(0 0 0 / 0.9)` (lifts the text off JPEG noise).
- Capacity: about 15 characters at 296px, 17 at 340px. Longer names truncate. The full name is in `title`, in the article's `aria-label`, and in the ped.12 sub-panel header right above the card, so truncation loses nothing (Q4 answered (a)).
- **Font check (Inter Tight vs the art)**: kept. At 11 to 12px inside a 13 to 15px banner, a high-contrast or blackletter display face would break up at 1× and soften on HiDPI. Inter Tight's narrow 600 fits the most characters and reads as cleanly as the art's flat inset panels. No decision bead needed.

### Slots
- Each `.slot`: region `slots[i]`; `display: flex; align-items: center; justify-content: center; gap: 0.25em; padding-inline: 4%; white-space: nowrap; overflow: hidden`; `font: 600 max(10.5px, 3.24cqw) / 1 system-ui stack` (11px at 340); `font-variant-numeric: tabular-nums; text-shadow: 0 1px 1px rgb(0 0 0 / 0.9)`.
- Content comes from named slots `slot1`, `slot2`, `slot3`. An empty named slot renders nothing in the wrapper, and the art's empty slot shows.
- The content is `CardTally` (new, `src/components/CardTally.vue`; this extraction was optional before and is now required):
```ts
props: {
  word: string                    // 'lv', 'gp', 'pace', 'sight'
  value: number
  editable: boolean
  min: number; max: number; step: number
  label: string                   // input aria-label, e.g. "level", "gold, in coins"
  invalidTitle: string            // "a whole number from 1 to 20"
  format?: 'int' | 'compact' | 'decimal'   // default 'int'
}
emits: { commit: [value: number] }
```
  - Word: `--card-metal-light`, weight 400, lowercase. Value: `--ink`, 600.
  - Read-only: `<span>`s inside a `role="group"` with `aria-label` "{label} {value}". `compact` shows values ≥ 10000 as `Intl.NumberFormat('en', { notation: 'compact', maximumSignificantDigits: 3 })` ("12.5k"), with the full number in `title`. `decimal` shows up to one decimal place (pace 1.5).
  - Editable: `<label>` wrapping the word and `<input type="number" inputmode="numeric">`: `flex: 1 1 0; min-width: 0; height: 100%; padding: 0; border: 0; background: transparent; color: inherit; font: inherit; text-align: center`, spinners hidden (tdj.3 rules). While focused the word is hidden (`.slot:focus-within .word { display: none }`) so the full number has the whole slot (7 digits at 10.5px).
  - Commit on `change`, draft and invalid rules as tdj.3 (empty or non-numeric reverts; the store clamps).

| slot state | look |
|---|---|
| default | text on the art's slot |
| hover (editable) | slot `background: rgb(255 255 255 / 0.06); border-radius: 3px`, `var(--card-motion-hover)` |
| focus | `outline: 2px solid var(--ink); outline-offset: 1px; border-radius: 3px` on the slot wrapper (`:focus-within`) |
| invalid draft | `outline: 1px dashed var(--danger); outline-offset: 1px`; `aria-invalid="true"`; `title` = invalidTitle |
| disabled, loading, empty, error | none (read-only text, synchronous values; an empty slot shows bare art) |

**Slot content** (the mount fills the named slots; tdj.4 / ped.12):
| kind | slot 1 | slot 2 | slot 3 |
|---|---|---|---|
| party, npc | `lv` level: edit when `may('editCharacter', e)`, 1–20 | `gp` purse, `compact`: edit when `may('editCharacter', e)`, 0–999999 | `sight` (sight radius in hexes), read-only |
| caravan | `gp` caravan gold this turn (`suppliesOf(id).gold`), edit when `may('supplies')`, 0–1000 | `pace`, read-only | `sight`, read-only |
| ship | `pace`, read-only | `sight`, read-only | empty (bare art) |

Third slot for people: **sight** (Q5 answered (b)). Read-only, word `sight`, group label "sight {n} hexes" ("sight 1 hex" for n = 1). Edits to pace and sight stay in the DM entity rows.

Target size: a slot is 57×13px at 296. WCAG 2.2 SC 2.5.8 passes through the spacing exception: slot centres are at least 62px apart and nothing else is interactive within 12px above or below them. The whole slot is the label, so it is the click area.

### Plate (lower trapezoid) [Q6 answered (a)]
- `.plate`: region `plate` (the text box, inset from the trapezoid's slanted sides); `display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 2px; text-align: center; font-size: max(10.5px, 3.24cqw); line-height: 1.2; text-shadow: 0 1px 1px rgb(0 0 0 / 0.9)`. Each line is `max-width: 100%`, one line with ellipsis.
- New prop `plate?: readonly string[]`; the card renders up to 2 entries (line 1 in `--ink` 600, line 2 in `--card-metal-light` 400). An empty array or no prop leaves the art's bare plate.
- Content (mount):
  - Line 1, **who plays it**, DM view only: `played by {store.playerOf(id)}`, or `dm` when `owner === 'dm'`, or `no player` when player-owned and unseated. In the player view line 1 is left out; they know who they are.
  - Line 2, **what it is doing**, both views: `riding {carrier name}` when `carrierOf(id)` is set; else `{n} hexes to go` when the pending route has n > 0 hexes (`1 hex to go` for n = 1); else `standing`.

## Below the frame [amended]
Default slot, rendered only when given, with `margin-top: 0.5rem`. The tally rows of the old bodies moved into the frame's slots:
- `StatHexagon` (tdj.3): the hexagon box only.
- `CaravanCardBody`: **merchant list only**. The `gold` prop, `editable` prop and `gold` emit are removed (gold is in slot 1). The list rules stay as specified before (rows of 40px, 6 rows max, else 5 plus `+{n} more in merchants`, `no merchants`, `aria-label` per row). Width `min(100%, 16rem)`; restyled: row `background: var(--card-window); border: 1px solid var(--card-metal-dark); border-left: 3px solid <MERCHANT_INFO[type].color>`, level pill `background: var(--card-plate)` with a 1px `--card-metal-light` border. The box keeps `min-height: 284px` so every kind is the same height.
- `ShipCardBody`: **aboard list only**. `pacePerTurn` and `sight` props are removed (slots 1 and 2). Same row restyle, same capacity rules, `nobody aboard`, `min-height: 284px`.
- `cardBody.ts`: drop what only fed the removed tally rows. Keep the rest.

## Component contract [amended]
```ts
// src/components/CharacterCard.vue
props: {
  entity: Pick<Entity, 'id' | 'name' | 'kind' | 'owner' | 'hidden' | 'portrait'>
  pickable: boolean            // store.may('entitySettings', entity): DM only
  headingLevel?: 2 | 3 | 4     // default 3
  plate?: readonly string[]    // up to 2 lines, see Plate
}
emits: { bust: [id: string | null] }
slots: {
  slot1, slot2, slot3: the frame's small slots (CardTally, see Slot content)
  default: the body below the frame (StatHexagon, CaravanCardBody, ShipCardBody)
}
```
- Root `<article class="character-card" :data-variant="variant" :aria-label="`${entity.name}, ${entity.kind}`">`. The variant tokens are set on the root, so slotted children inherit them.
- Presentational: never reads the store, router, session or panel.

### `BustPicker.vue` [amended: tiles]
Unchanged behaviour. Tile thumbnail: `aspect-ratio: 23 / 21; border-radius: 6px; overflow: hidden; background: var(--surface-deep)`, image `object-fit: cover; object-position: center top` (about the steel window's shape). The "no bust" tile has a dashed 1px `--line-strong` border.

## Copy (English only; the repo ships no other language)
Lowercase, as the panels.
- Slot words: `lv`, `gp`, `pace`, `sight`. Input `aria-label`s: "level", "gold, in coins", "caravan gold, in coins". Read-only group labels: "level 3", "gold 1250", "pace 1.5 hexes a turn", "sight 3 hexes" ("sight 1 hex" for 1). Invalid titles: "a whole number from 1 to 20", "a whole number from 0 to 999999", "a whole number from 0 to 1000".
- Plate: `played by {name}`, `dm`, `no player`; `riding {name}`, `{n} hexes to go`, `1 hex to go`, `standing`.
- Strip: "choose a bust", "change bust", "unknown bust"; button `title` "stored bust: {id}".
- Pick button `aria-label`: `` `choose a bust for ${name}` `` or `` `change ${name}'s bust (now ${label})` ``.
- Picker title `` `${name}: bust` ``; first tile "no bust".
- Article `aria-label`: `` `${name}, ${kind}` ``.
- Lists: as before (`merchants`, `lv {n}`, `+{n} more in merchants`, `no merchants`; `aboard`, `+{n} more aboard`, `nobody aboard`).

## Accessibility
- Contrast (tokens.md, Card, measured on colours sampled from the art): `--ink` on the banner, slots and plate ≥ 14.9:1 in every variant. Slot words and plate line 2 in `--card-metal-light` ≥ 6.5:1 on the brightest slot or plate. The `text-shadow` is an aid, not counted.
- `img.art`, the window shade and the empty mark are `aria-hidden`. The name is a heading. The plate is plain text after the slots in DOM order.
- Focus order: pick button (DM), slot 1, slot 2, slot 3 (editable ones only), then the body (StatHexagon: STR to CHA).
- Keyboard: Enter or Space on the pick button opens the picker; Tab through tiles, Enter picks, Esc closes; focus returns to the button. Slots: type, Enter commits, arrows step.
- Alt text: read-only bust = bust label; pickable bust `alt=""` (the button is named).
- Reduced motion: no crossfade; colour-only hover stays.

## Assets
| asset | source | licence |
|---|---|---|
| `src/assets/frames/<v>-frame.webp`, `<v>-window.png` | cropped and keyed from `docs/reference/character-card-frame.jpg` by `design/tools/card-frames.mjs` | **user-supplied** art (see `docs/ASSETS.md`; Q1 answered (a): all rights with the user, not AGPL) |
| `src/assets/fonts/inter-tight/*` | unchanged | SIL OFL 1.1 |
| `src/assets/busts/*.svg` | unchanged, designer-made placeholders | AGPL with the repo |

- **Becoming unused** (grep on main `d7517cf`: their only importer is `src/entities/busts.ts`, through `FRAME_ART`): all nine `src/assets/frames/{steel,bronze,crimson}-{frame,crest,foot}.svg`. Delete them in the same change that adds the webp and png files. Also drop `.frame::after` border-image, `.crest`, `.foot`, `.oval` and the `--card-oval-*`, `--card-pad`, `--card-overhang`, `--card-fill-*`, `--card-field-h` declarations from `CharacterCard.vue`.
- Add `src/assets/frames/SOURCE.md` (next to the files, as `OFL.txt` sits next to the fonts):
  ```md
  # Card frame art
  `<variant>-frame.webp` and `<variant>-window.png` are cropped from `docs/reference/character-card-frame.jpg`,
  art supplied by the project owner, with `design/tools/card-frames.mjs`. Source and licence: `docs/ASSETS.md`.
  Rebuild: `node design/tools/card-frames.mjs docs/reference/character-card-frame.jpg src/assets/frames`.
  ```
- Bust crop rule [amended]: busts are 4:3 (256×192), shown with `cover` and `center top`. The narrowest window (bronze, 215×229) shows art x 38 to 218, so each bust's recognisable silhouette must sit within x 40 to 216. The wagon (x 40 to 216) now fits; the earlier wagon and ship redraw is no longer needed. The UI review checks all 14 in all three windows.

## Acceptance checks (UI review)
Screens: the ped.12 sub-panel (or the tdj.4 harness until it lands) at 360, 768 and 1280px; one card per variant; DM and player.
1. The frame is the cropped art, 340×438 scaled to the card width (296 to 320px in current mounts), never wider than 340px; no black box or dark halo around the ornaments on the panel; no ornament cut off.
2. Variant follows the rule table; hiding or revealing an entity, or assigning it to a player, recolours it.
3. The bust fills the window's exact shape (bronze arch included); it never covers the rim, the banner or the slots.
4. The name sits inside the banner, vertically centred, Inter Tight 600, 11 to 12px; a 40-character name ellipsizes before the banner's sloped end; `title` shows the full name.
5. The slot texts sit inside their art slots at all widths; "gp 999999" shows as "gp 1M" read-only and in full while editing; DM and owning player can edit lv and gp in place, other players cannot.
6. The plate shows the two lines (DM) or one line (player), centred within the trapezoid's slanted sides.
7. DM: the pick button takes focus with a 2px ring; Enter opens the picker; picking sets the bust and refocuses. Players: no button, no tab stop on the window.
8. StatHexagon or a list sits 8px under the frame; every kind's card has the same height at the same width.
9. The art looks soft but not pixelated on a DPR 2 screen (`image-rendering: auto`).
10. Reduced motion: no crossfade.

## Open questions
All answered by the user 2026-11-15 (decision beads tdj.21 to tdj.26).
- **Q1, art licence**: the frame art is user-supplied (the original file was named `Gemini_Generated_Image_…`, which suggests Google Gemini output). Confirm the project may use it commercially and under which terms it ships in this AGPL repo. **Answered (a)** (tdj.21). Options: (a) user owns or may use it, record as "user-supplied, all rights reserved by the user, not AGPL"; (b) record as AGPL with the repo; (c) placeholder only until licensed art arrives. Default (a).
- **Q2, hostile**: there is no hostile field, so crimson = hidden. **Answered (b)** (tdj.22): add the saved field, crimson = `hidden || hostile`; deferred to hexcrawl_web-tdj.30, this build stays hidden-only. Options: (a) keep hidden as the only crimson trigger; (b) add a saved `hostile: boolean` (DM only, all map-field touchpoints) and use `hidden || hostile`. Default (a).
- **Q3, player-owned carriers and UI-made npcs**: the add row creates every entity as `owner: 'player'`, so caravans and ships made in the UI are player-owned, and npcs made there come out blue, not "DM npc bronze". **Answered (a)** (tdj.23). Options: (a) carriers always bronze, people follow `owner` [default]; (b) owner first, so player-owned carriers are blue; (c) also make the add row create npcs as `owner: 'dm'` (they would then start hidden, so crimson, until a reveal control exists).
- **Q4, long names**: the banner holds about 15 characters at 296px. **Answered (a)** (tdj.24). Options: (a) ellipsis, full name in `title` and the sub-panel header [default]; (b) let the name run past the banner over the window bottom on a dark scrim (departs from "as drawn"); (c) shrink the font to fit, down to 9px.
- **Q5, third slot for people**: **Answered (b) sight** (tdj.25). Options: (a) pace; (b) sight; (c) empty.
- **Q6, lower plate**: **Answered (a)** (tdj.26). Options: (a) "played by" (DM) plus travel status [default]; (b) a free-text epithet the DM writes (new saved field); (c) bare art.
