---
title: Prompts, props and the tileset
date: 2026-09-10
kind: asset-brief
---

# Prompts, props and the tileset

Sprite style block first. One sheet per family, each prop's frames left to right in its own row, on a solid magenta page or with a real alpha channel. Generate at 2048 px for 2 px blocks. The kit finds objects as connected regions and cuts strips through a hand-written mapping in `tools/asset-kit/props.ts`, so a regenerated sheet either keeps the object count per prop exactly as listed or updates the mapping in the same PR. The counts below are the ones the 1x sheet holds and the renderer plays.

| Prop | Prompt subject | Frames |
|---|---|---|
| bush | "A round dense forest bush, two-tone green with a few gold leaves, dark outline, sitting on flat ground. Side view, wide and low." | idle 1, rustle 2 |
| hollow log | "A fallen hollow log, warm brown bark with moss on top, dark open end facing the viewer's left. Side view, long and low." | idle 1, chatter 2 |
| cracked rock | "A grey boulder with a visible zigzag crack, a faint pale blue glow leaking from the crack, moss at the base. Side view." | idle 1, crack 4 (the last frame open) |
| checkpoint flag | "A wooden pole with a green pennant bearing a small gold emblem, planted in grass." | down 1, raise 2, wave 2 |
| beacon | "A stone beacon tower two tiles wide and four tall, an iron brazier on top, ornamental gold trim, moss on the stones." | unlit 1, lighting 2, lit loop 2 |
| torch | "A wall-mounted iron torch with a small gold flame, tall and narrow." | 1 |
| lantern | "A hanging iron lantern with a pale blue flame, on a short chain." | 4-frame loop |
| glowing mushrooms | "A cluster of three small mushrooms with pale blue glowing caps, on moss." | 2-frame loop |
| charge sparks | "Tiny pale blue spark shapes and two short horizontal speed lines." | 3 + 2 |

## Tileset

> [style block] A tileset for a forest platformer on a 32 pixel grid: grass top surface, grass corner left, grass corner right, earth fill, earth with roots, stone block, stone edge left, stone edge right, mossy stone, a wooden plank platform, a spike trap, earth fill with a cluster of small stones set in it, stone block with earth showing through its upper left corner, earth fill with one large stone set in it. Arranged on a grid with clear separation, consistent lighting from the top left, transparent background.

The kit slices the sheet by its known grid in the order of the shared tile-order module; a sheet with a different tile count fails the build. The last three subjects are the sixth column the owner drew by hand on 2026-10-02, after the first eleven had shipped, and are listed here so the prompt describes the whole sheet; they were appended to the order so that nothing already cut moved.
