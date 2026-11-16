# hexcrawl_web design tokens

This file is the single source of design tokens for hexcrawl_web.
- Every token lives as a CSS custom property on `:root` in `src/style.css`. Components read `var(--…)` and never repeat a literal value listed here.
- Add new tokens here, in the same change that adds them to `style.css`.
- The app has one theme: dark (`color-scheme: dark`). There is no light theme.

Each section notes which bead introduced its tokens:
- `[existing]`: already in the code before the panel dock epic
- `tb0`: one left column
- `q55`: panel restyle
- `17y`: smooth folding
- `1a1.10`: character card (see Card)

## Color
| token | value | role | bead |
|---|---|---|---|
| `--surface` | `#14161a` | page; section trays | existing |
| `--surface-raised` | `#1d2026` | panels, buttons | existing |
| `--surface-deep` | `#0f1114` | text, number, select and textarea fields | q55 |
| `--ink` | `#e6e8ec` | primary text | existing |
| `--ink-dim` | `#8b929e` | labels, meta, chevrons | existing |
| `--line` | `#2b303a` | panel border, dividers (decorative, no contrast duty) | existing |
| `--line-strong` | `#666e7d` | borders that identify a control (inputs, buttons) | q55 |
| `--accent` | `#7aa2c8` | focus, selection, primary button; replaces the `#7aa2c8` literals | q55 (value existing) |
| `--accent-hover` | `#93b5d6` | primary button hover | q55 |
| `--accent-press` | `#6890b7` | primary button active | q55 |
| `--on-accent` | `#14161a` | text on `--accent` | q55 |
| `--danger` | `#e07a6a` | errors, destructive buttons; replaces the `#e07a6a` literals | q55 (value existing) |
| `--sun` | `#f7c766` | day phase ink (dial only) | existing literal; not tokenised by q55 |
| `--panel-bg` | `color-mix(in srgb, var(--surface-raised) 94%, transparent)` | panel fill over the map (was 88%) | q55 |

### Measured contrast (WCAG 2.x)
| pair | ratio | need |
|---|---|---|
| `--ink` on `--surface-raised` | 14.0 | 4.5 text |
| `--ink-dim` on `--surface-raised` | 5.2 | 4.5 text |
| `--ink-dim` on `--surface` | 5.8 | 4.5 text |
| `--ink-dim` on `--surface-deep` (placeholder) | 6.0 | 4.5 text |
| `--on-accent` on `--accent` | 6.7 | 4.5 text |
| `--danger` on `--surface-raised` | 5.6 | 4.5 text |
| `--danger` on `--surface` | 6.2 | 4.5 text |
| `--accent` on `--surface-raised` (focus ring) | 6.1 | 3 non-text |
| `--line-strong` on `--surface-raised` | 3.2 | 3 non-text |
| `--line-strong` on `--surface` | 3.5 | 3 non-text |
| `--line-strong` on `--surface-deep` | 3.7 | 3 non-text |

## Type
Font family: `system-ui, -apple-system, 'Segoe UI', sans-serif` (existing). One self-hosted web font, for the character card name only: Inter Tight 600 (`--card-name-font`, see Card type). No other web fonts.

| token | size / line-height | weight | use |
|---|---|---|---|
| `--text-title` | `1rem / 1.25` | 600 | panel title |
| `--text-heading` | `0.875rem / 1.3` | 600 | section title |
| `--text-body` | `0.8125rem / 1.4` | 400 | controls, list rows, dd |
| `--text-meta` | `0.75rem / 1.3` | 400 | labels, dt, counts, hints |

These are shorthand values for `font` sizing only: `font-size` plus `line-height`. Numbers are always `font-variant-numeric: tabular-nums`. Titles are not uppercased and get no letter-spacing.

## Space (4px grid)
| token | value |
|---|---|
| `--space-1` | `0.25rem` |
| `--space-2` | `0.5rem` |
| `--space-3` | `0.75rem` |
| `--space-4` | `1rem` |
| `--space-5` | `1.5rem` |

## Radius
| token | value | use |
|---|---|---|
| `--radius-panel` | `0.625rem` | panel |
| `--radius-tray` | `0.375rem` | section tray |
| `--radius-control` | `0.25rem` | input, button, list row |

## Elevation
| token | value | use |
|---|---|---|
| `--shadow-panel` | `0 6px 24px -8px rgb(0 0 0 / 0.6)` | panels only; never trays or controls |

## Layout (tb0)
| token | value | use |
|---|---|---|
| `--panel-width` | `22rem` | panel column width (existing) |
| `--dock-gap` | `0.375rem` | gap between panels |
| `--dock-row` | `2.5rem`, phone `2.75rem` | panel header min-height |
| `--section-row` | `2rem`, phone `2.5rem` | section header min-height (0zz) |
| `--control-h` | `2rem`, phone `2.5rem` | input and button height (q55) |
| `--subpanel-width` | `21rem` | width of sub-panel columns 2 and 3 (ped.12) |
| `--column-gap` | `0.75rem` | gap between the dock and column 2, and between columns 2 and 3 (ped.12) |
| `--sub-columns` | `0` | sub-panels shown beside the dock (0, 1 or 2). MapView sets it inline on `<main>`; always 0 in stacked mode and for players (ped.12) |
| `--dock-reserve` | `calc(1rem + min(var(--panel-width), 100vw - 2rem) + var(--column-gap) + var(--sub-columns) * (var(--subpanel-width) + var(--column-gap)))` | left edge of the free map area, after any open columns (380px, 728px, 1076px with 0, 1, 2 columns). Declared on `:root, main`: a custom property resolves its `var()`s where it is declared, so `<main>` must declare it again to pick up its own `--sub-columns` |
| `--minimap-reserve` | `calc(1rem + 176px + 0.75rem)` | right edge kept for the minimap |

The phone values apply under `@media (max-width: 720px)`.

## Motion (17y)
| token | value | use |
|---|---|---|
| `--motion-fold` | `200ms` | panel open/fold, chevron |
| `--motion-fold-section` | `160ms` | section open/fold, chevron |
| `--ease-fold` | `cubic-bezier(0.2, 0, 0, 1)` | all folds |

Under `prefers-reduced-motion: reduce`, both `--motion-fold` and `--motion-fold-section` are `0ms`.

## Card (1a1.10, tdj.3)
Used by `CharacterCard`, `CardTally`, `StatHexagon`, `CaravanCardBody` and `ShipCardBody` (`design/hexcrawl_web-1a1.10.md`, `design/hexcrawl_web-tdj.3.md`). Reference art: `docs/reference/character-card-frame.jpg`, the frame itself, cropped into `src/assets/frames/<variant>-frame.webp`. Shape: `docs/reference/player-card-sketch-2026-11-14.png`.

**[amended 2026-11-14, art frame rework]** The card's frame is now the supplied art (a bitmap), so there are no frame-drawing tokens. The colour tokens below style what is drawn **in CSS on or under the art**: slot and plate text, the stat hexagon, the list rows. Their values were sampled from the art (`design/tools/card-frames.mjs` crops; sample boxes listed under the table).

**Exception to the `:root` rule**: the colour tokens below change per frame variant, so they are set on `.character-card[data-variant='steel' | 'bronze' | 'crimson']` in `CharacterCard.vue`, not on `:root`. Slotted children inherit them. Any component that reads them outside a card gives the steel value as the `var()` fallback.

### Variant colours [amended]
| token | steel | bronze | crimson | sampled from | role |
|---|---|---|---|---|---|
| `--card-metal-light` | `#a5b2bf` | `#b39879` | `#c98674` | ornament highlights, 98th luminance percentile of crest pixels (crimson lifted from `#a96a59`, same hue, to reach 4.5:1 on its slots) | slot words, plate line 2, stat abbreviations, small hex outline, modifier ring, level pill border |
| `--card-metal-mid` | `#7e8c9c` | `#907860` | `#865244` | ornament body, 90th percentile | large hexagon rim stroke, list icons; decorative only, never text |
| `--card-metal-dark` | `#17293d` | `#392013` | `#380c06` | shield plate between window and slots | inner rims, list row borders, modifier stud shadow |
| `--card-plate` **[new]** | `#1a314d` | `#422416` | `#450e09` | shield plate below the trapezoid (lit part) | large hexagon fill, modifier circle fill, level pill fill |
| `--card-window` | `#0b1014` | `#160b03` | `#150601` | mean of the art's window | small hex fill, hexagon well, list row fill (darkest surface) |

Removed: `--card-fill-top`, `--card-fill-bottom` (there is no CSS frame fill any more).

Art surfaces that text sits on (measured means, used in the contrast table; not tokens): banner steel `#0c1116`, bronze `#1e0e05`, crimson `#180701`; brightest slot steel `#0c161f`, bronze `#200f07`, crimson `#1e0802`; plate steel `#0c1217`, bronze `#1b0d05`, crimson `#190703`.

Which variant an entity gets: `frameVariant()` in `src/entities/busts.ts` (rule in the 1a1.10 spec).

### Card sizes [amended]
Set on `.character-card` (not variant dependent):
| token | value | use |
|---|---|---|
| `--card-width` | `21.25rem` (340px) | card max width = the art crop's width, so the 1× art is never shown above 1 CSS px per source px; the card is `width: min(100%, var(--card-width))` |

Removed with the hand-built frame: `--card-pad`, `--card-overhang`, `--card-oval-w`, `--card-oval-h`, `--card-field-h`. Region positions come from `FRAME_ART[variant].regions` (% of the frame box), not from tokens.

### Measured contrast (WCAG 2.x) [amended]
| pair | steel | bronze | crimson | need |
|---|---|---|---|---|
| `--ink` on banner (name) | 15.5 | 15.3 | 16.0 | 4.5 text |
| `--ink` on brightest slot (slot value) | 14.9 | 15.1 | 15.7 | 4.5 text |
| `--ink` on plate (plate line 1) | 15.4 | 15.5 | 16.0 | 4.5 text |
| `--card-metal-light` on brightest slot (slot word) | 8.5 | 6.8 | 6.5 | 4.5 text |
| `--card-metal-light` on plate (plate line 2) | 8.7 | 7.0 | 6.7 | 4.5 text |
| `--ink` on `--card-window` (stat score, list names) | 15.6 | 15.8 | 16.2 | 4.5 text |
| `--card-metal-light` on `--card-window` (abbreviation, list type) | 8.9 | 7.1 | 6.7 | 4.5 text |
| `--ink` on `--card-plate` (modifier, level pill) | 10.8 | 11.5 | 13.0 | 4.5 text |
| `--card-metal-light` on `--card-plate` (small hex outline against the plate) | 6.1 | 5.1 | 5.4 | 3 non-text |
| `--danger` on brightest slot / `--card-window` (invalid outline) | 6.2 / 6.5 | 6.3 / 6.6 | 6.6 / 6.8 | 3 non-text |
| `--card-metal-mid` on panel `#1d2026` | 4.8 | 3.9 | 2.6 | decorative only |

Text on the art also gets `text-shadow: 0 1px 1px rgb(0 0 0 / 0.9)` against JPEG noise. It is not counted in the ratios.

### Card type
**[amended after a3e3baa, tdj.16]** The name uses a display face; everything else on the card uses the app's system stack.

| token | value |
|---|---|
| `--card-name-font` | `'Inter Tight', system-ui, -apple-system, 'Segoe UI', sans-serif` |

`--card-name-font` lives on `:root` in `src/style.css` (not variant dependent), next to these rules:
```css
@font-face {
  font-family: 'Inter Tight';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url('./assets/fonts/inter-tight/inter-tight-latin-600-normal.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD;
}
@font-face {
  font-family: 'Inter Tight';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url('./assets/fonts/inter-tight/inter-tight-latin-ext-600-normal.woff2') format('woff2');
  unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF;
}
```
Only weight 600 ships. Names in other scripts fall back to the system stack per glyph. Files and licence: `src/assets/fonts/inter-tight/` (`OFL.txt`, SIL OFL 1.1).

**[amended 2026-11-14, art frame]** Text inside the frame scales with the card (container query units on `.character-card`, which is `container-type: inline-size`) and has a pixel floor. The art's banner and slots are 13 to 16px tall, so these sizes are set by the art, not by the app's type scale. Inter Tight stays: at 11 to 12px its narrow 600 fits the banner best (1a1.10, font check).

| use | size / line-height | weight | colour |
|---|---|---|---|
| name, in the banner **[amended]** | `max(11px, 3.53cqw)` (12px at 340) / banner height, `var(--card-name-font)` | 600 | `--ink` |
| slot value **[new]** | `max(10.5px, 3.24cqw)` (11px at 340) / 1 | 600 | `--ink` |
| slot word (`lv`, `gp`, `pace`, `sight`) **[new]** | same as slot value | 400 | `--card-metal-light` |
| plate line 1 **[new]** | `max(10.5px, 3.24cqw)` / 1.2 | 600 | `--ink` |
| plate line 2 **[new]** | same | 400 | `--card-metal-light` |
| bust strip **[amended]** | `max(11px, 3.53cqw)` / 1 | 400 | `--ink` |
| merchant / rider name | `0.8125rem / 1.2` | 600 | `--ink` |
| merchant type, rider kind | `0.6875rem / 1.2` | 400 | `--card-metal-light` |
| level pill | `0.75rem / 1` | 600 | `--ink` on `--card-plate` **[amended]** |
| stat score | `1.25rem / 1` | 600 | `--ink` |
| stat abbreviation | `0.625rem / 1`, `letter-spacing: 0.06em` | 600 | `--card-metal-light` |
| modifier | `0.75rem / 1` | 600 | `--ink` on `--card-plate` **[amended]** |

Removed: the "level, gold value" (1rem) and "level, gold label" (0.75rem) rows; level and gold now use the slot rows.

All numbers `font-variant-numeric: tabular-nums`.

### Card motion
| token | value | use |
|---|---|---|
| `--card-motion-hover` | `120ms ease-out` | stroke, border, slot background and strip colour/opacity on hover |
| `--card-motion-swap` | `150ms ease-out` | bust crossfade |

Under `prefers-reduced-motion: reduce`, `--card-motion-swap` is `0ms`. The hover change is colour only and stays.

### Card error colour
Invalid drafts use `--danger`, plus a dashed outline so the state never relies on colour alone (crimson frames are already red). This replaces the old local `#ff8a7a`.
