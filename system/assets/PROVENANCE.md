---
title: Asset provenance for the raw art in assets/
date: 2026-09-16
kind: asset-brief
---

# Asset provenance

Written for the prototype repository, whose `assets/` layout this repository keeps. Extend it for every new raw.

Every file here is generated art that the asset kit (`tools/asset-kit`) turns into
`public/assets`. Backgrounds, the wizard sheets, the tileset, the prop sheet and the
splash were generated with ElevenLabs Image (Nano Banana) on 2026-09-08 and 2026-09-09
from the prompts in the prototype repository's `docs/plans/2026-09-08-mvp-forest-spec.md`, section 5
(VirtusLab/visdom-sandbox), at 1280×720; the prompts are kept in `docs/plan/03-assets/prompts/`.
The level panels and the walk, jump, fall and victory sheets were generated with GPT Image 2
on 2026-09-09 and 2026-09-10 from the prompts recorded in the same spec and in the rebuild
brief. Only files the build consumes live in this directory; the build fails on any
output it cannot account for. Sheets may come with a real alpha channel or on a
solid magenta or dark page; the kit reads the alpha when it is there and keys the
page colour when it is not.

| File | What it is | Becomes |
|---|---|---|
| bg-mountains-big.png | detailed far mountain range, magenta sky | bg/mountains-big.png, 4 px pitch, mirror-tiled, 120 px base extension |
| bg-forest.png | tall forest, trunks and canopy | bg/trees.png, 4 px pitch, 120 px base extension. Keys to 143 rows of art against the asset list's 142, so the kit's cut from the bottom drops the topmost canopy row (3 pixels) on every build |
| bg-undergrowth.png | near undergrowth | bg/undergrowth.png, 4 px pitch, and its top 76 rows mirrored as bg/foreground.png |
| splash-textless.png | title screen without lettering | splash.png, 4 px pitch; the wordmark is drawn in code |
| wizard-idle.png | idle, 4 frames | sprites/wizard-idle.png, 8 px pitch |
| wizard-charge.png | wand charge, 5 frames | sprites/wizard-charge.png, 8 px pitch |
| wizard-walk.png | walk cycle, 8 labelled frames; first of four variants | sprites/wizard-run.png, 7 px pitch so the frames match the idle height |
| wizard-jump.png | jump arc, 7 labelled poses; second of four variants, the one without dust puffs | sprites/wizard-jump.png, 7 px pitch |
| wizard-fall.png | long fall, 3 flailing poses and a dusty landing; second of four variants | sprites/wizard-fall.png, 7 px pitch, 40 × 32 cells |
| wizard-victory.png | the victory cast, 8 labelled poses: idle, a spin over four, the burst, the beam, idle; generated 2026-09-10, one variant; the figure stands about 200 px tall against the idle sheet's 253 | sprites/wizard-victory.png, built by HWP-044: 8 frames, a wider cell for the burst and the beam, the crystal pinned by hand where the effects hide it |
| tileset.png | forest tileset, eleven tiles on a transparent sheet in a known grid (205 x 202 cells from 39,39 with 39 px gaps, then the plank and the spike trap); cleaned by hand on 2026-09-16 from the fourth of four generated variants | tiles/forest.png, sliced by grid in tools/asset-kit/tiles.ts |
| props-sheet.png | bush, log, rock, flag, beacon, torch, sparks with frames; second of four variants, re-exported on 2026-09-15 with a real alpha channel instead of the dark page | props/*.png, cut through the region mapping in tools/asset-kit/props.ts. torch and sparks are built but no room places a torch and the sparks are not drawn yet |
| painting-ruin-gate-1.png | ruin gate level panel, 3:1 at 3840×1280 | left half of paintings/ruin-gate.png; the kit cuts the bridge open before keying (tools/asset-kit/paintings.ts) |
| painting-ruin-gate-2.png | collapsed courtyard continuation, generated with panel 1 as reference | right half of paintings/ruin-gate.png; the kit cuts the well open before keying (tools/asset-kit/paintings.ts) |

## Tried and set aside

Moved out of the repository on 2026-09-15 and kept outside it, so the tree carries only what the game uses:

- bg-mountains.png, sparse peaks; replaced by the big range.
- bg-hills.png, far hills; never built.
- bg-tree-layers.png and bg-forest-sheet.png, forest as layer sheets; dropped when the
  seven-layer stack was reduced to four on 2026-09-09.
- wizard-poses.png, the wizard reference sheet; reference only.
- tileset-candidate-1..3.png and props-sheet-1, 3, 4.png, the rejected variants.
- The rejected walk, jump and fall variants, including copies of the three chosen sheets.
  The fourth fall variant, a tumble into a face-down flop, is a candidate for a death
  animation if a dying pause is ever added.
