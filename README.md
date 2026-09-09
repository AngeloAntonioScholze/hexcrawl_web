# hexcrawl_web

A 3D hexcrawl sandbox for the web — players and dungeon masters run hexcrawl-style maps for tabletop RPG campaigns in the browser.

## Overview

Hexcrawls are exploration-driven RPG campaigns played on a hex grid: the party moves hex to hex, revealing terrain, encounters, and points of interest as they go. This project turns that into a shared 3D sandbox in the browser.

Intended shape:

- **3D hex map** rendered in the browser — terrain, elevation, features.
- **DM tools** — author and edit maps, place encounters and POIs, control what players can see.
- **Player view** — move the party, reveal hexes, track travel.
- **Shared session** — DM and players on the same map at the same time.

Nothing is built yet; this is the starting point.

## Status

Early scaffolding. Not runnable.

## Stack

Undecided. Leaning TypeScript (strict) + Bun; 3D layer TBD.

## Development

Issue tracking uses [beads](https://github.com/gastownhall/beads), kept **local only** — no Dolt remote, `.beads/issues.jsonl` is a passive export.

```bash
bd ready       # available work
bd show <id>   # issue detail
```

## License

TODO
