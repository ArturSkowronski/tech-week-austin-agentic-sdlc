---
title: Prompts, level paintings
date: 2026-09-10
kind: asset-brief
---

# Prompts, level paintings

A room is up to three 3:1 panels joined by the kit and fitted to 22 tiles tall at 32 px per tile ([ADR-004](../../01-decisions/ADR-004-painted-levels-traced-to-collision.md)). A 4K 3:1 render fits about 66 tiles. Use the previous panel as the reference image for the next.

**Panel prompt skeleton, proven on the ruin gate**

> Wide 3:1 pixel art strip as if drawn at 1980 by 660 with one consistent pixel size. [Subject in three sections, left to right.] All standing surfaces flat, walls vertical, steps at most two blocks up and three wide. The floor at 85 % of the height on both edges. Nothing above the middle of the image except [named landmarks]. Flat magenta #FF00FF for all open air. [Background style block's palette sentence.] No characters, no text, no frame.
> Negative: blur, gradients, sky, trees, slopes, purple haze.

| Room | Panel | Subject |
|---|---|---|
| forest-glade | 1 | forest floor with roots and moss, three low mossy ledges rising left to right, a flat plateau with room for a bush and a log, ending at a cliff edge over an open drop |
| forest-glade | 2 | the far cliff of the drop, a climb of stone ledges over a spike pit, a boulder-sized gap in a root wall, steps up to a stone beacon plinth at the right edge |
| ruin-gate | 1 and 2 | exist: the broken gate tower, the parapet, the pit, the road, the second gate, the collapsed courtyard with the hall and a well pit; the kit cuts the bridge open |
| cliff-ruins | 1 | floating ruin ledges under a giant carved stone face, hanging lanterns, a summit plinth for the beacon at the right; the face is generated separately as a landmark image and placed as a mid-layer |

Paintings must obey the geometry rules in [level design](../../02-design/level-design.md). When a generator draws something intact that must be open (a bridge, a wall), declare the edit in the kit; do not repaint the raw.
