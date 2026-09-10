---
title: Prompts, backgrounds
date: 2026-09-10
kind: asset-brief
---

# Prompts, backgrounds

The layer stack is settled ([rendering and look](../../02-design/rendering-and-look.md)); the 1x set exists and is reused. Regenerate only if the 1x layers show at density 2. Background style block first, then:

| Layer | Subject |
|---|---|
| mountains | "A detailed far mountain range with snow on the peaks and forest at the base, evening haze, no foreground." |
| tall forest | "A tall pine and beech forest seen from inside, straight trunks with gold evening light between them, canopy at the top, no ground plane." |
| undergrowth | "Dense forest undergrowth, ferns and low bushes with a few gold leaves, a fallen branch, no ground plane." |

Constraints appended to every background prompt: seamlessly tileable horizontally so the left and right edges match exactly; very wide format; plain solid magenta where the sky would be; no ground plane; no characters; no text.

The near layer's fallen branch repeats every screen in both the undergrowth and the foreground; the next generation of that layer should omit it. Generate the mountains first with the style block only, clean them, then attach them as the reference for the rest.
