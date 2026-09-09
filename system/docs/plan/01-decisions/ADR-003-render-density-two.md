---
title: "ADR-003: World units of a 320 by 180 view, rendered at two pixels per unit"
date: 2026-09-09
status: accepted
kind: decision
---

# ADR-003: World units of a 320 by 180 view, rendered at two pixels per unit

## Decision

- **World units** are the pixels of a 320 by 180 view. A tile is 16 units. The wizard's hitbox is 12 by 28 units in a 32-unit sprite cell. Every tuning number, every room map and the camera work in these units. This never changes.
- **Render density** is 2: the world is drawn into a 640 by 360 render texture, two pixels per unit, then shown at the largest integer scale that is a multiple of two and fits the window, letterboxed, nearest-neighbour.
- Every texture carries a **density** in the asset manifest. 1x art (16 px tiles, 32 px wizard cells) and 2x art (32 px tiles, 64 px cells, paintings at 32 px per tile) coexist; the renderer scales by the manifest's density.
- UI text draws at full window resolution on top of the scaled world.

## Why

Generated art at 2 px blocks looks right; at 4 px blocks it looked cheap. Text stays crisp. Keeping world units at the 1x view means the movement model, the tests and the maps are untouched by the art resolution.

## Consequence for art

All new art is generated for 2 px blocks: 32 px tiles, 64 px wizard cells, level paintings fitted to 704 px tall (22 tiles at 32 px). The 1x backgrounds and wizard sheets already built remain valid at density 1 until regenerated.
