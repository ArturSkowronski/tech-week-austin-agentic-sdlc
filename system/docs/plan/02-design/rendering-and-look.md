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
- The wand's crystal carries an additive light. Placed light props were planned for the cliff ruins and are not built (HWP-062 closed).

## Tiles

For rooms without a painting the renderer picks atlas variants by context: moss surface with corner pieces at ledge ends, two rows of earth with scattered roots, stone below with edge pieces and mossy blocks, a plank for one-way platforms, a spike trap. The atlas order is one shared module, `game/content/tile-order.ts`, that the asset kit and the renderer both import.

Roots take about a twelfth of the earth cells and mossy blocks about a twelfth of the stone, the `TILE_SCATTER` shares in `game/render/config.ts`. Both are occasional features of the ground rather than its pattern: a root or two and a handful of mossy blocks to a screen, and as a rule no two of either in cells that touch. A quarter and a fifth, the shares Season 1 shipped with, read as paving instead.

The atlas has no earth side-edge piece, so an earth cell that stands open at a side draws the moss surface tile turned to face that side instead: a quarter turn counter-clockwise for an open left, clockwise for an open right, a half turn for an open bottom. The fringe then runs on from the corner piece above, down both earth rows, to the stone edge, which has a piece of its own, and a plateau or a tower reads as ground with a side rather than as ground cut off. An earth cell open on both sides takes the left, the tie-break the one-tile ledge already uses.

Each cell is also turned, by its own place in the map and nothing else, so a run of ground does not read as wallpaper. How far a tile may turn follows from its art: one with no up at all — the earth, the stone, and the mossy stone, whose moss runs along the crevices between the cobbles and reads the same whichever way round the cell is — takes any of the four quarter turns, mirrored or not, rolled from a hash of the position. One that reads one way up only — the roots, which hang down — is mirrored and no further, and takes that flip from the parity of its coordinates rather than from the hash, so that no cell of it ever stands beside its own copy. One whose orientation is its meaning is left standing. Which of the three each atlas tile takes is the `TILE_TURN` table in `game/render/config.ts`. The earth side edge above is the one turn that table does not decide: the moss surface is fixed as the surface it usually is, and the earth edge turns it by the open side instead. Its three quarter turns are `EDGE_QUARTER` in `game/render/tiles.ts`, beside the one helper that reads which side a cell stands open at, rather than in `config.ts` with the table: they are geometry off the open side, not a choice per atlas tile.

## Sprites

Wizard strips are loaded by the manifest's cell size and frame count; animation frame comes from `stateTimer` and the state's frame rate. Every frame is drawn facing right and flipped by facing. The wizard and props are drawn two units below their collision line so feet meet the drawn ground.

Prop frame logic per kind: bush rustles, log chatters, rock cracks and opens, flag raises then waves, beacon lights then loops; a hit shakes the prop for a few frames. The creature is two red eyes blinking at its hiding place and riding on the hat while carried.

## The waterfall

Drawn in code, not from a sprite: a dark rock face with a rounded right edge, a base blue with thin scrolling strands of a second blue, water streaks falling 3 to 5 units per tick in fixed columns, churned foam along the lip and down that right edge — a band with round blobs of two to three units stepping along it and white pixels catching the light among them — and mist at the base, bands of it with blobs rolling through them.

The face has a texture of its own behind the sheet: a rain of log glyphs, one column every six units across the whole face, each column a slice of this room's log lines falling at its own speed and wrapping. It is ambience rather than something to read. In front of it are those log lines drawn whole, each as one horizontal row of glyphs across the face, in reading order; the roll of them creeps downward at 0.6 units per tick the way credits roll, one or two lines in sight at a time. A 40-character line is 79.5 of the 96 units with a margin of eight on each side.

A parting thins the water, it never cuts a hole in it. The sheet, its strands, its streaks, its foam and its mist are drawn over the whole face whatever the parting, and the sheet fades from near opaque with faint green flickers to a thin 0.22 that the rain reads through; the rows of text step in front of it while it is parted, so a line reads as plainly as it did when a parting emptied a band of the face. It parts when the wizard stands within a tile and a half of it, touches it or charge-hits it, and stays parted for 150 ticks after the last of those. Drawn only when on screen. The prop is 96 units wide and runs from its surface row, the row of its map character, down to the bottom of the room.

## UI

- **Ticket card**: panel chrome shared with the completion banner; text states from [bug quest](bug-quest.md); the button "Raise ticket on GitHub" and the T key. It can be waved away after three seconds.
- **Completion banner**: time and deaths, shown at the beacon.
- **Title screen**: the textless splash, fitted the way the world's view is, with the wordmark, tagline and prompt drawn in code over it, each on a thin band of the panel's charcoal so the gold reads against the art; Enter, Space or Z starts.
- **HUD line**: nothing in the corner during a run — no room name, no discoveries, which were never drawn. Behind F1 it is the debug line: room name, player state and timer, position, tick and deaths.

## Acceptance

Screenshots at the glade start, over the waterfall and from the beacon match the reference look within reason; text is crisp at every window size; no rendering code reads wall time; a replay produces the same frames twice.
