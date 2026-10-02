---
title: Asset list, Season 1
date: 2026-09-10
status: accepted
kind: asset-brief
---

# Asset list, Season 1

Every asset the game draws, with its cell size in world units, frame count, and status. Raw generated files that exist are in [`assets/`](../../../assets/) with their record in [PROVENANCE.md](../../../assets/PROVENANCE.md). "1x" means drawn for 16-unit tiles at one pixel per unit; "2x" for two pixels per unit ([ADR-003](../01-decisions/ADR-003-render-density-two.md)). Prompts are in [prompts/](prompts/).

## Wizard

Cell 32 by 32 units (64 px at 2x), drawn roughly 24 by 30. All frames face right. States per [ADR-002](../01-decisions/ADR-002-wand-ride-becomes-the-charge.md); there is no bounce, orb or fireball art.

| State | Frames | Notes | Status |
|---|---|---|---|
| idle | 4 | breathing, hat brim tilts, crystal sparks on frame 3 | density 2 from the 1x raw, `wizard-idle.png` |
| run | 8 at 10 fps | walk cycle, wand held forward | density 2 from the 1x raw, `wizard-walk.png` |
| jump | 3 | take-off for four ticks, then air up, then air down for the descent of the hop; the sheet has seven poses: idle, squash, take-off, air up, air down, landing, recovery | density 2 from the 1x raw, `wizard-jump.png` |
| fall | 1 + 3 | air down, drawn only once he is below the height he left the ground from — the descent of his own hop keeps the jump sheet's air down; after 20 ticks three flailing poses | density 2 from the 1x raw, `wizard-fall.png`, 40-unit cells |
| charge | 5 at 15 fps | astride the wand, legs trailing, spark trail behind the crystal; frame 1 is held for the 2-tick wind-up, frames 2 to 5 loop. The 1x sheet has no upright wind-up pose; the 2x regeneration may add one as frame 1, the renderer's logic is the same | density 2 from the 1x raw, `wizard-charge.png` |
| chargeRecoil | 1 | bounced back off a wall, hat over the eyes | not drawn; borrows the first charge frame, which passes for its 3 ticks |
| land | 2 + 1 | landing and recovery from the jump sheet; hard landing with dust from the fall sheet | density 2 from the 1x raw |
| hurt | 2 | flash, knocked back | not drawn; borrows the first idle frame for the moment before the respawn |
| victory | 8 at 10 fps, played once, the last held | the cast: idle, a spin over four, the burst, the beam, idle; the beacon lights on the beam frame. Drawn four poses across and two down, so the kit reads the sheet row by row | density 2 from the 1x raw, `wizard-victory.png`, 64-unit cells: the burst and the beam reach out to the right of him, so the cell records the column he stands on and the crystal is pinned by hand on those two poses |
| all of the above at density 2 | | 64 px cells from the existing raws, which hold finer outlines than their 6 to 10 px blocks | done by HWP-043, read at half the recorded pitch; finer drawing would need new sheets and is not planned |

## Props

Cell sizes are the simulation's prop table. All static or looped.

| Prop | Size | Frames | Status |
|---|---|---|---|
| bush | 32 by 24 | 3: idle 1, rustle 2 | density 2 from the 1x raw, `props-sheet.png` |
| hollow log | 48 by 16 | 3: idle 1, chatter 2 | density 2 from the 1x raw |
| cracked rock | 32 by 24 | 5: idle 1, crack 4, the last frame open | density 2 from the 1x raw |
| checkpoint flag | 16 by 32 | 5: down 1, raise 2, wave 2 | density 2 from the 1x raw |
| beacon | 32 by 64 | 5: unlit 1, lighting 2, lit loop 2 | density 2 from the 1x raw |
| torch | 16 by 32 | 1, static | density 2 from the 1x raw; no room places one yet |
| charge sparks | 24 by 8 | 5: 3 trail, 2 speed-line | density 2 from the 1x raw; not drawn yet |
| lantern | 16 by 32 | 4-frame loop | not planned; no room places one (HWP-062 closed) |
| glowing mushrooms | 16 by 16 | 2-frame loop | not planned; no room places one |
| waterfall | 96 wide, down to the room bottom | drawn in code | none |
| creature eyes and wisp | 5 by 1 including the glow pixels (1-unit eyes 3 apart centre to centre), 16 by 16 | drawn in code in Season 1 | none; each hiding place seats the eyes off its own strip (HWP-089), re-measured for the smaller eyes (HWP-097) |

The sheet `props-sheet.png` is not laid out in rows: the bushes, logs, rocks and flags stack on its left, the beacons, the torch and the sparks on its right, and touching objects, the five beacons and the five rocks, form one region each. The kit cuts it through a hand-written mapping of region band and position in `tools/asset-kit/props.ts`, described in the [pipeline](pipeline.md). The frame counts above are what the sheet holds and what the renderer plays; a regenerated sheet keeps them or changes the mapping in the same PR.

## Tiles

| Asset | Content | Status |
|---|---|---|
| forest tileset | eleven tiles: grass surface, grass corners left and right, earth, earth with roots, stone, stone edges left and right, mossy stone, plank (one-way), spike trap | density 2 from the 1x raw, `tileset.png`, cleaned to a transparent sheet on 2026-09-16; its 205 px cells cut to 32 px tiles by HWP-043 |

## Backgrounds

The layer stack is settled; reuse at density 1, regenerate at 2 px later only if it shows.

| Layer | Native size | Source | Status |
|---|---|---|---|
| mountains | 640 by 223, 103 art rows + 120-row base | `bg-mountains-big.png` | done |
| tall forest | 320 by 262, 142 art rows + 120-row base | `bg-forest.png` | done |
| undergrowth behind | 320 by 110 | `bg-undergrowth.png` | done |
| undergrowth in front | top 76 rows of the same, mirrored | `bg-undergrowth.png` | done |

## Paintings

| Room | Panels | Status |
|---|---|---|
| forest-glade | none | the glade stays tiled ([ADR-009](../01-decisions/ADR-009-one-room.md)) |
| ruin-gate | 2, 3:1 at 3840 by 1280; the kit cut the bridge open before keying | retired with the room by HWP-084 |
| cliff-ruins | 1 plus the stone face as a landmark | not planned (HWP-042 closed) |

## Interface

| Asset | Status |
|---|---|
| splash, textless; wordmark drawn in code | done, `splash-textless.png` |
| ornamental frame for the card and banner | drawn in code in Season 1; a nine-slice sheet is optional |

## Audio

Generated with the prompts in [prompts/audio.md](prompts/audio.md); none exists yet.

| Effect | Length |
|---|---|
| jump, land, charge, charge hit, charge wall | 0.2 to 0.4 s |
| bush rustle, log chatter, rock crack | 0.5 to 0.6 s |
| creature pop-out, creature caught, checkpoint | 0.3 to 0.8 s |
| beacon lit | 2 s |
| waterfall loop | 8 s |
| music loop | one theme, behind a settings toggle |
