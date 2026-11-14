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
Font family: `system-ui, -apple-system, 'Segoe UI', sans-serif` (existing). No web fonts.

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
| `--dock-reserve` | `calc(1rem + min(var(--panel-width), 100vw - 2rem) + 0.75rem)` | left edge of the free map area |
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
Used by `CharacterCard` and `StatHexagon` (`design/hexcrawl_web-1a1.10.md`, `design/hexcrawl_web-tdj.3.md`). Reference art: `docs/reference/character-card-frame.jpg` (style), `docs/reference/player-card-sketch-2026-11-14.png` (shape).

**Exception to the `:root` rule**: the colour tokens below change per frame variant, so they are set on `.character-card[data-variant='steel' | 'bronze' | 'crimson']` in `CharacterCard.vue`, not on `:root`. Slotted children (`StatHexagon`) inherit them. Any component that reads them outside a card gives the steel value as the `var()` fallback.

### Variant colours
| token | steel | bronze | crimson | role |
|---|---|---|---|---|
| `--card-metal-light` | `#a9c0d8` | `#e0b27a` | `#e8927a` | metal highlight; label and modifier-ring ink; stat hex outline |
| `--card-metal-mid` | `#5b7898` | `#9a6a36` | `#a8402e` | metal body; decorative strokes only, never text, never a control's only boundary |
| `--card-metal-dark` | `#24344a` | `#3e2914` | `#451812` | metal shadow; inner rims; modifier circle fill |
| `--card-fill-top` | `#22324a` | `#33241a` | `#37160f` | card interior, top of the gradient |
| `--card-fill-bottom` | `#131b27` | `#1a120b` | `#1c0b08` | card interior, bottom of the gradient |
| `--card-window` | `#0b1119` | `#120c07` | `#140806` | oval, stat hex and field fill (darkest surface) |

Which variant an entity gets: `frameVariant()` in `src/entities/busts.ts` (rule in the 1a1.10 spec). The frame SVGs hard-code the same hex values, so they stay standalone files.

### Card sizes
Set on `.character-card` (not variant dependent):
| token | value | use |
|---|---|---|
| `--card-width` | `18rem` (288px) | card max width; the card is `width: min(100%, var(--card-width))` |
| `--card-pad` | `1rem` | content inset from the frame's outer edge |
| `--card-overhang` | `1rem` | crest above and blades below the frame rectangle |
| `--card-oval-w` | `10rem` (160px) | portrait oval width |
| `--card-oval-h` | `12.5rem` (200px) | portrait oval height (4:5) |
| `--card-field-h` | `1.75rem` (28px) | level and gold field height |

### Measured contrast (WCAG 2.x)
| pair | steel | bronze | crimson | need |
|---|---|---|---|---|
| `--ink` on `--card-window` | 15.5 | 15.8 | 16.1 | 4.5 text |
| `--ink` on `--card-fill-top` (name) | 10.6 | 12.1 | 13.3 | 4.5 text |
| `--ink` on `--card-metal-dark` (modifier) | 10.4 | 11.1 | 12.2 | 4.5 text |
| `--card-metal-light` on `--card-window` | 10.1 | 10.0 | 8.3 | 4.5 text |
| `--card-metal-light` on `--card-fill-top` (labels; stat hex outline) | 7.0 | 7.7 | 6.9 | 4.5 text / 3 non-text |
| `--danger` on `--card-window` (invalid outline) | 6.4 | 6.6 | 6.7 | 3 non-text |
| `--card-metal-mid` on `--card-fill-top` | 2.9 | 3.2 | 2.7 | decorative only |

### Card type
System stack (no display face; open question in 1a1.10).
| use | size / line-height | weight | colour |
|---|---|---|---|
| name | `1.125rem / 1.33` | 600 | `--ink` |
| stat score | `1.25rem / 1` | 600 | `--ink` |
| level, gold value | `1rem / 1` | 600 | `--ink` |
| level, gold label | `0.75rem / 1` | 400 | `--card-metal-light` |
| stat abbreviation | `0.625rem / 1`, `letter-spacing: 0.06em` | 600 | `--card-metal-light` |
| modifier | `0.75rem / 1` | 600 | `--ink` |
| bust strip | `0.72rem / 1` | 400 | `--ink` |

All numbers `font-variant-numeric: tabular-nums`.

### Card motion
| token | value | use |
|---|---|---|
| `--card-motion-hover` | `120ms ease-out` | stroke, border and strip colour/opacity on hover |
| `--card-motion-swap` | `150ms ease-out` | bust crossfade |

Under `prefers-reduced-motion: reduce`, `--card-motion-swap` is `0ms`. The hover change is colour only and stays.

### Card error colour
Invalid drafts use `--danger`, plus a dashed outline so the state never relies on colour alone (crimson frames are already red). This replaces the old local `#ff8a7a`.
