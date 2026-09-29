---
title: Level design, Season 1
date: 2026-09-10
status: accepted
kind: design
---

# Level design, Season 1

One level, the Forest, designed in three beats, each its own room. About 280 tiles in total. The demo plays the first beat only: the glade's beacon ends the run, and the other rooms are played on their own with `?room=<name>`. Rooms are text maps with an optional painting ([ADR-004](../01-decisions/ADR-004-painted-levels-traced-to-collision.md)). The two rooms that exist are in [rooms/](rooms/) as reference maps.

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
- At least one checkpoint flag per beat, near the start; another before any hazard that would send the player far back.
- Every beat ends at a beacon at its right end, and that beacon ends the run: a room is played on its own.
- Hiding places sit on flat ground away from pits so the creature encounter is never a death.
- Nothing above the middle of a painting except named landmarks; the camera's vertical range is small.

## The three beats

| Room | Width | Beat | Hiding places | Hazards | Painting |
|---|---|---|---|---|---|
| `forest-glade` | 80 | learn to jump on three low ledges, a plateau with a bush and a log, the waterfall of logs in the charge gap, a ledge climb on one-way platforms over spikes, the cracked rock on the path, steps up to the beacon | bush, log, rock | two pits, spikes, water | tiled in the prototype; two panels to generate |
| `ruin-gate` | 132 | the broken gate tower climbed on its ledges or walked under at ground level, with the cracked rock at its foot; the flag before the pit and the two-tile parapet; the waterfall pit, six tiles wide and level with the parapet, crossed by a jump and a charge to the road beyond; the road with the bush where the creature waits, the log and the second flag; the second gate climbed over the banner beam and descended by the stair; the well, a dry six-tile drop, and the spike hole; the bastion with the beacon | rock, bush by the road, log | the pit, the well, spikes, water | two panels, exist |
| `cliff-ruins` | about 66 | floating ruin ledges under a giant stone face, lanterns, the beacon on the summit | rock on a ledge | drops between islands | one panel to generate |

Rooms are not chained: a run plays one room and ends at its beacon. The boot with no `?room=` plays the glade, the first beat; every other room is reached by name. [HWP-046](../tickets/HWP-046.md) chained the rooms through an order module `game/content/order.ts` and a `room:next` event; HWP-083 rolled that back so the demo sticks to the first beat, and the module is gone. Room edges are walls, never exits. Each room has one waterfall, which carries the log lines of that beat's planted bug.

## The beacon ends the run

Every room's beacon is the end of its run. Touching it puts the wizard in `victory`, stops the run clock and shows the banner with time and deaths. This does not depend on the planted bugs: the healed world shows itself through the missing creature and the ticket card's "the logs are clean" state ([bug quest](bug-quest.md)). This supersedes the concept's beacon that lit only when the region was healed; a run must always be completable.

## Painting a room

1. Generate up to three 3:1 panels with the panel prompt in [prompts/paintings.md](../03-assets/prompts/paintings.md), each with the previous panel as the reference image.
2. Save them as `assets/painting-<room>-1.png`, `-2.png`, ... and run `pnpm assets`: each is keyed, fitted to 22 tiles tall at 32 px per tile, the panels are joined left to right, and the result is written to `public/assets/paintings/<room>.png` with a manifest entry carrying density 2 and its tile extent.
3. Open the trace tool at `/tools/trace/index.html` on the dev server, pick the room or start a new one, auto-trace from opacity, fix edges by hand with the legend brushes, place props, save. The room module is written through the dev server; names match `^[a-z][a-z0-9-]*$`.
4. Play it with `?room=<name>`; F1 shows the traced tiles over the painting.
5. The scripted playthrough test for the room must reach its beacon.
