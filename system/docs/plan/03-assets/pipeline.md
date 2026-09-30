---
title: The asset pipeline
date: 2026-09-10
status: accepted
kind: asset-brief
---

# The asset pipeline

Raw generated images live in `assets/` with `PROVENANCE.md`. `pnpm assets` runs `tools/asset-kit/build.ts` and writes `public/assets/` plus `public/assets/manifest.json`. That is the only way art enters `public/`. The build fails on a file in `public/assets` the kit did not write and on a kit output nothing in the renderer or a room consumes.

## What the kit does

| Stage | Behaviour |
|---|---|
| pitch estimation | finds the drawn block size of a generated image (2, 4, 7 or 8 px) and resamples at block centres so one drawn block becomes one pixel at the target density |
| keying | reads the alpha channel when the sheet has one; otherwise keys magenta and its purple fringe, or a solid page colour, with despill |
| palette | reduces backgrounds to 32 colours and sprites to the palette file; saves indexed PNGs |
| backgrounds | mirror-tiles the mountains for a seamless loop, extends each layer's base by 120 rows in its own bottom colour, records art rows in the manifest |
| wizard strips | splits a labelled pose sheet row by row and then into columns, places each frame bottom-centre in its cell, detects the crystal's centre per frame and records it. A sheet that draws an effect out to one side of the wizard names the cell column he stands on instead: its poses line up by their feet on that column, the manifest records it as `anchor` in world units, and the renderer puts it on the player rather than the cell's middle. Such a sheet may also pin the crystal of a frame whose effect outshines it, as a pixel of the cell, which the build checks is pale blue |
| tile atlas | slices the tileset by its known grid, in the order of the shared tile-order module |
| props | finds objects as connected regions of non-page pixels (by alpha when the sheet has it, else by distance from the page colour, bridging gaps of up to 6 px), groups them into bands by top edge, and cuts strips through a hand-written mapping in `tools/asset-kit/props.ts` that names each strip by band and position and splits touching objects into a stated number of columns; keys the page with a flood fill from outside; fits each frame into the simulation's prop cell, bottom-centre; fails loudly when a band holds fewer objects than the mapping needs |
| paintings | applies declared edits to a raw (for example a magenta rectangle that cuts a bridge open), keys it, fits it to 704 px tall, posterises, joins numbered panels left to right, writes a manifest entry with density 2 and tile extent |
| manifest | one entry per output: size, density, cell, frames, crystal positions, art rows, colour count |

Hand edits to raws are code: declared in `tools/asset-kit/paintings.ts`, never made in an image editor without a record.

## Manifest entries

```json
"bg/mountains-big": { "width": 640, "height": 223, "artRows": 103, "colours": 3064 },
"sprites/wizard-idle": { "cell": 32, "cellW": 32, "frames": 4, "crystal": [[51, 18], [48, 17], [51, 18], [49, 18]] },
"sprites/wizard-victory": { "cell": 32, "cellW": 64, "anchor": 16, "frames": 8, "crystal": [[49, 24], "..."] },
"tiles/forest": { "width": 352, "height": 32, "density": 2, "artRows": 32, "colours": 32 }
```

## Invariants

- `pnpm assets` is idempotent: running it twice changes no bytes.
- Every output is consumed, or the build fails. An output is consumed when its name is in the renderer's static consumer list exported from `game/render/sprites.ts`, or a room names it as its painting or landmark. The list is the renderer's declaration of what it loads; a ticket that adds an output adds its consumer in the same PR.
- Every raw in `assets/` produces at least one output, or the build fails. A raw nobody wants leaves the repository; there are no skipped raws.
- `pnpm assets:report` lists every output with its consumer, and names any raw in `assets/` that `PROVENANCE.md` has no row for.

## Unit tests

`tests/tools/` covers the raster helpers on synthetic images (pitch estimation, keying, connected components), the tile slicer and the prop detector on fixture sheets, and the trace model (parse, resize, set, fill, serialise keeping headers, auto-trace).
