---
title: Rendering and look
date: 2026-09-10
status: accepted, settled after seven iterations; do not restart
kind: design
---

# Rendering and look

PixiJS 8, rendering only. World units are a 320 by 180 view; the world is drawn into a 640 by 360 render texture at density 2 and shown at the largest integer scale that is a multiple of two ([ADR-003](../01-decisions/ADR-003-render-density-two.md)). Nearest-neighbour everywhere. UI text draws at full window resolution.

All constants below live in `game/render/config.ts` and nowhere else.

## Camera

Follows the player with a small dead zone, clamps to the room bounds, and rounds to whole pixels **last**, after the clamp. Vertical range is small; climbing lifts the camera and brings the canopy and the mountains into view.

## Layer stack, back to front

Every layer is anchored to the main floor line with a fixed bottom offset and its own horizontal and vertical parallax factor. Backgrounds loop horizontally; the mountains are mirror-tiled for a seamless loop.

| Layer | Horizontal | Vertical | Bottom offset | Treatment |
|---|---|---|---|---|
| Sky | fixed | fixed | anchored to the mountains' art base | stepped gradient drawn in code, redrawn only when the horizon moves |
| Mountains | 0.05 | 0.05 | +100 | 85 % alpha; 103 art rows plus a 120-row base in its own colour, which is also the fill below the horizon |
| Tall forest | 0.30 | 0.60 | +124 | tinted to 70 %; at rest only trunks and gold light are on screen |
| Bushes behind | 0.60 | 1.00 | +62 | tinted to 70 % so the player pops |
| Tiles or painting | 1.00 | 1.00 | | the room; a painting hides the tiles, F1 shows them over it |
| Props, creature eyes, player | 1.00 | 1.00 | | |
| Wand light | | | | additive, positioned per frame from the manifest's crystal coordinates, mirrored with facing |
| Bushes in front | 1.30 | 1.00 | +64 | full colour, mirrored, the top 76 rows of the undergrowth generation |
| Dusk overlay | | | | translucent dark at 0.08, then a soft vignette |
| UI | | | | ticket card, banner, HUD line, title |

Everything below the horizon is painted forest-dark so nothing pale shows between layers when the camera climbs.

## Dusk

Early dusk, "magic and mysterious" without being dark; the wizard is the light.

- Sky: three stops, amber at the horizon, mauve, indigo at the top, in bands of 6 units.
- Depth-haze tints on the far layers; cool stone on the ruins.
- The wand's crystal carries an additive light; placed light props (lantern, glowing mushrooms) add to the same light layer.

## Tiles

For rooms without a painting the renderer picks atlas variants by context: moss surface with corner pieces at ledge ends, two rows of earth with scattered roots, stone below with edge pieces and mossy blocks, a plank for one-way platforms, a spike trap. The atlas order is one shared module, `game/content/tile-order.ts`, that the asset kit and the renderer both import.

## Sprites

Wizard strips are loaded by the manifest's cell size and frame count; animation frame comes from `stateTimer` and the state's frame rate. Every frame is drawn facing right and flipped by facing. The wizard and props are drawn two units below their collision line so feet meet the drawn ground.

Prop frame logic per kind: bush rustles, log chatters, rock cracks and opens, flag raises then waves, beacon lights then loops; a hit shakes the prop for a few frames. The creature is two red eyes blinking at its hiding place and riding on the hat while carried.

## The waterfall

Drawn in code, not from a sprite: a dark rock face with a rounded right edge, a base blue with thin scrolling strands of a second blue, water streaks falling 3 to 5 units per tick in fixed columns, foam along the lip, mist at the base. Behind the water, columns of log text fall at 0.9 to 1.6 units per tick; the lines come from the manifest for the bug that lives in this room. The water is near opaque with faint green flickers until touched or charge-hit, then parts for 150 ticks. Drawn only when on screen. The prop is 96 units wide and runs from its surface row, the row of its map character, down to the bottom of the room.

## UI

- **Ticket card**: panel chrome shared with the completion banner; text states from [bug quest](bug-quest.md); the button "Raise ticket on GitHub" and the T key. It can be waved away after three seconds.
- **Completion banner**: time and deaths, shown at the beacon.
- **Title screen**: the textless splash with a wordmark drawn in code; Enter, Space or Z starts.
- **HUD line**: room name, discoveries, and the debug state label behind F1.

## Acceptance

Screenshots at the glade start, over the waterfall and from the beacon match the reference look within reason; text is crisp at every window size; no rendering code reads wall time; a replay produces the same frames twice.
