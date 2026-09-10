---
title: Art direction
date: 2026-09-10
status: accepted
kind: asset-brief
---

# Art direction

Retro fantasy, 16-bit-inspired pixel art, drawn for 2 px blocks ([ADR-003](../01-decisions/ADR-003-render-density-two.md)). Early dusk. The wizard's crystal is the light.

## Palette

Forest greens, aged gold, charcoal, warm browns, pale blue for magic. Backgrounds are reduced to 32 colours by the kit; sprites and props to the palette in `tools/asset-kit/palette.json`. Named anchors:

| Role | Colour |
|---|---|
| mountains base and fill below the horizon | `#7b9682` |
| tall forest base | `#213a2d` |
| magenta key, all open air in generated art | `#ff00ff` |
| sky stops at dusk | amber horizon, mauve, indigo |

## Character

A short, stout, cheerful old wizard with a long grey beard, an oversized crooked pointed hat in dark green with a brass buckle, brass goggles pushed up on the brim, an emerald robe cut short above the knee, a wide brown belt, sturdy brown boots. He holds an oversized gnarled wooden wand with a pale blue crystal tip. He stands, runs and jumps on foot; he is astride the wand only in the charge and recoil frames ([ADR-002](../01-decisions/ADR-002-wand-ride-becomes-the-charge.md)). The crystal is visible in every frame.

## Prompting rules

- Never name a franchise, character, studio or game in a prompt. Describe traits.
- Every prompt starts with the shared style block, then the subject, then output constraints.
- Generate four variants, pick one, run the kit, and record prompt, model, date and choice in `assets/PROVENANCE.md`.
- After the first approved wizard frame, attach it as the reference image on every later prompt.
- Ask the model for labelled pose sheets, not for frame sequences; frames are cut from the sheet by the kit.
- Backgrounds and panels: flat magenta where the sky or open air would be; no characters, text or frame.

**Shared style block, sprites**

> 16-bit pixel art, side-view platformer sprite, chunky cartoon proportions with a large head and short stout body in the manner of early-1990s console platformer heroes, clean dark outlines, flat shading with a single highlight tone, limited palette of forest greens, aged gold, charcoal, and warm browns with pale blue for magic, crisp square pixels on a uniform grid, no anti-aliasing, no gradients, no text, no watermark, plain solid magenta background.

**Shared style block, backgrounds and panels**

> 16-bit pixel art forest background for a side-scrolling platformer at dusk, flat shapes with clean edges, limited palette of forest greens with aged gold light and charcoal shadows, amber to indigo sky, crisp square pixels on a uniform grid, no anti-aliasing, no gradients, no characters, no text, plain solid magenta where the sky would be.

## Licensing

Original character, original geography, original music. The two mockups in `assets/reference/` (a fantasy workflow map and a wizard portrait) are internal inspiration for palette and ornament only; they are never shipped, and their compositions are not reproduced. Code is Apache-2.0; generated art and audio carry their provenance. Do not rely on "AI-generated" or "a joke" as clearance.
