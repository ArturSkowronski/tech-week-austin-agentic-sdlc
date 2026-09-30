---
title: Level design, Season 1
date: 2026-09-10
status: accepted
kind: design
---

# Level design, Season 1

One level, one room: the forest glade, 80 tiles wide, drawn in tiles ([ADR-009](../01-decisions/ADR-009-one-room.md)). Rooms are text maps with an optional painting ([ADR-004](../01-decisions/ADR-004-painted-levels-traced-to-collision.md)); the glade has none and none is planned. Its map is in [rooms/](rooms/) as a reference, next to the map of the retired ruin gate.

## Text map legend

One character per tile, rows top to bottom, one module per room exporting one string.

| Char | Meaning |
|---|---|
| `#` | solid |
| `-` | one-way platform, passable from below |
| `=` | one-way platform half a tile down, for ledges a painting draws mid-tile |
| `^` | spike |
| `P` | player spawn, feet on the tile below |
| `B` | bush |
| `L` | hollow log |
| `R` | cracked rock |
| `F` | checkpoint flag |
| `E` | beacon |
| `T` | torch |
| `W` | waterfall, the surface tile at the water's left edge |
| `N` | lantern, a light without a trigger |
| `M` | glowing mushrooms, a light without a trigger |
| space | empty |

Props occupy their own tile and are placed with their bottom on the tile below. Prop sizes are one table in the simulation, shared with the asset kit and the renderer:

| Prop | Size in units |
|---|---|
| bush | 32 by 24 |
| log | 48 by 16 |
| rock | 32 by 24 |
| flag | 16 by 32 |
| beacon | 32 by 64 |
| torch | 16 by 32 |
| lantern | 16 by 32 |
| mushrooms | 16 by 16 |
| waterfall | 96 wide, from its surface row down to the room's bottom row |

The waterfall is anchored by its surface: `W` marks the surface tile at the water's left edge, the water is six tiles wide and fills down to the bottom row of the room. Put `W` on the row of the ledge you jump from, in the first column of the pit, so the surface sits level with the ledge and a fall into the pit ends on the room's bottom row, which is a death in water. 96 units is the six-tile charge gap.

## Geometry rules

Derived from the tuning table in [movement and physics](movement-and-physics.md); every ledge in a painting must obey them.

- A jump clears three tiles up and four tiles across at take-off height. Paintings draw steps at most three tiles apart; a two-tile rise fits a one-tile gap.
- A six-tile gap is crossed by a jump and a wand charge above the surface; a plain jump falls a tile short and a short jump lands in the water. Gaps of four tiles or fewer are plain jumps; five-tile gaps are not used, they are too close to call.
- Every climb is at most three tiles; nothing needs a pixel-perfect landing.
- At least one checkpoint flag near the start; another before any hazard that would send the player far back.
- The room ends at a beacon at its right end, and that beacon ends the run.
- Hiding places sit on flat ground away from pits so the creature encounter is never a death.
- Nothing above the middle of a painting except named landmarks; the camera's vertical range is small.

## The room

| Room | Width | Beat | Hiding places | Hazards | Painting |
|---|---|---|---|---|---|
| `forest-glade` | 80 | learn to jump on three low ledges, a plateau with a bush and a log, the waterfall of logs in the charge gap, a ledge climb on one-way platforms over spikes, the cracked rock on the path, steps up to the beacon | bush, log, rock | two pits, spikes, water | none, tiles by decision |

A run plays the glade and ends at its beacon. The boot with no `?room=` plays the glade; `?room=<name>` selects any other room that exists in `game/content/rooms/`. Room edges are walls, never exits. The waterfall carries the log lines of the room's live planted bug ([bug quest](bug-quest.md)).

**Retired rooms.** The level was designed as three beats. The ruin gate, 132 tiles wide with two painted panels, was built as the second beat and is removed by [HWP-084](../tickets/HWP-084.md); its map stays in [rooms/ruin-gate.txt](rooms/ruin-gate.txt). The cliff ruins, the third beat under a carved stone face, was never built (HWP-042 closed). [HWP-046](../tickets/HWP-046.md) chained the rooms through an order module and a `room:next` event; [HWP-083](../tickets/HWP-083.md) rolled that back.

## The beacon ends the run

The beacon is the end of the run. Touching it puts the wizard in `victory` and stops the run clock. He then casts: a spin, a burst at the wand tip and a beam into the beacon, eight frames played once; the beacon lights as the beam lands and the banner with time and deaths follows ([HWP-044](../tickets/HWP-044.md)). This does not depend on the planted bugs: the healed world shows itself through the missing creature and the ticket card's "the logs are clean" state ([bug quest](bug-quest.md)). This supersedes the concept's beacon that lit only when the region was healed; a run must always be completable.

## Painting a room

The glade stays tiled by decision (ADR-009). This procedure is kept for a later season's room.

1. Generate up to three 3:1 panels with the panel prompt in [prompts/paintings.md](../03-assets/prompts/paintings.md), each with the previous panel as the reference image.
2. Save them as `assets/painting-<room>-1.png`, `-2.png`, ... and run `pnpm assets`: each is keyed, fitted to 22 tiles tall at 32 px per tile, the panels are joined left to right, and the result is written to `public/assets/paintings/<room>.png` with a manifest entry carrying density 2 and its tile extent.
3. Open the trace tool at `/tools/trace/index.html` on the dev server, pick the room or start a new one, auto-trace from opacity, fix edges by hand with the legend brushes, place props, save. The room module is written through the dev server; names match `^[a-z][a-z0-9-]*$`.
4. Play it with `?room=<name>`; F1 shows the traced tiles over the painting.
5. The scripted playthrough test for the room must reach its beacon.
