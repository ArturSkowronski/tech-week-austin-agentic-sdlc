---
title: Prompts, level paintings
date: 2026-09-10
kind: asset-brief
---

# Prompts, level paintings

Season 1 has one room, the glade, which stays tiled ([ADR-009](../../01-decisions/ADR-009-one-room.md)); no panel is planned. The skeleton and the table are kept for a later season's room.

A room is up to three 3:1 panels joined by the kit and fitted to 22 tiles tall at 32 px per tile ([ADR-004](../../01-decisions/ADR-004-painted-levels-traced-to-collision.md)). A 4K 3:1 render fits about 66 tiles. Use the previous panel as the reference image for the next.

**Panel prompt skeleton, proven on the ruin gate**

> Wide 3:1 pixel art strip as if drawn at 1980 by 660 with one consistent pixel size. [Subject in three sections, left to right.] All standing surfaces flat, walls vertical, steps at most two blocks up and three wide. The floor at 85 % of the height on both edges. Nothing above the middle of the image except [named landmarks]. Flat magenta #FF00FF for all open air. [Background style block's palette sentence.] No characters, no text, no frame.
> Negative: blur, gradients, sky, trees, slopes, purple haze.

| Room | Panel | Subject |
|---|---|---|
| ruin-gate | 1 and 2 | existed, retired with the room by HWP-084: the broken gate tower, the parapet, the pit, the road, the second gate, the collapsed courtyard with the hall and a well pit; the kit cut the bridge open |

Paintings must obey the geometry rules in [level design](../../02-design/level-design.md). When a generator draws something intact that must be open (a bridge, a wall), declare the edit in the kit; do not repaint the raw.
