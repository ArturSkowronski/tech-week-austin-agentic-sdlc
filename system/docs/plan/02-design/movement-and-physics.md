---
title: Movement and physics
date: 2026-09-10
status: frozen tuning, per ADR-002
kind: design
---

# Movement and physics

The wizard walks and jumps; the wand ride is the attack ([ADR-002](../01-decisions/ADR-002-wand-ride-becomes-the-charge.md)). Everything here is in world units and seconds at 60 Hz ([ADR-003](../01-decisions/ADR-003-render-density-two.md)): a tile is 16 units, the player's hitbox is 12 by 28.

These values are frozen. They live in one module, `game/sim/constants.ts`, and every replay test asserts against them. Changing one is a design decision, not a tuning tweak.

## Tuning table

| Rule | Value |
|---|---|
| Tick rate | 60 Hz, `DT = 1/60` |
| Tile | 16 |
| Run speed | 110 |
| Ground acceleration / deceleration | 900 / 1300 |
| Air acceleration | 600 |
| Gravity / terminal velocity | 1200 / 380 |
| Jump velocity | −370 (about three and a third tiles held, so a ledge three tiles up is reachable) |
| Jump cut | releasing jump while rising clamps upward speed to −120 |
| Coyote time | 6 ticks after leaving a ledge |
| Jump buffer | 6 ticks before landing |
| Wand charge | 2-tick wind-up, then 14 ticks at 260 in the facing direction, gravity off |
| Charge hitbox | 12 by 8 at the crystal tip, leading the body; triggers bush, log, rock; parts the waterfall |
| Charge into a wall | stops with a 3-tick recoil |
| Charge cooldown | 24 ticks |
| Vulnerability during charge | none |
| Landing | 4 ticks, no input lock |
| Long fall | falling 20 ticks or more makes the wizard flail and land hard (a full jump's descent lasts about 19, so a jump on flat ground never counts) |
| Hurt | 30 ticks invulnerable, 90 knockback away from the source |
| Player hitbox | 12 by 28 |
| Water pull | at least 160 downward while overlapping water |
| Water drag | horizontal speed times 0.85 per tick |
| Water reveal | disturbed water stays parted 150 ticks |
| Creature travel | 30 ticks between hiding places |
| Creature carry | 600 ticks on the wizard before it lets go |

## Player states

`idle, run, jump, fall, charge, chargeRecoil, land, hurt, victory`

Transitions are a table in `game/sim/player.ts` so a reviewer can read them:

| From | Event | To |
|---|---|---|
| idle, run | jump pressed, on ground or within coyote, or buffered | jump |
| idle, run | walk off a ledge | fall (coyote counting) |
| jump | vertical speed becomes positive | fall |
| jump, fall | attack pressed, cooldown zero | charge |
| idle, run | attack pressed, cooldown zero | charge |
| charge | 16 ticks elapsed | fall (or idle if on ground) |
| charge | hitbox meets a solid tile | chargeRecoil |
| chargeRecoil | 3 ticks | idle or fall |
| fall | touches ground | land |
| land | 4 ticks, or any movement input | idle or run |
| any except victory | spikes, water bottom, or falls out of the room | hurt, then respawn at the checkpoint |
| any | touches the beacon of the last room in the order | victory |
| any | touches the beacon of an earlier room | the room ends: `room:next` is emitted and the next room loads at its spawn ([level design](level-design.md)) |

The state timer counts ticks in the current state and drives every animation; the renderer never keeps a timer of its own.

## Collision

- Swept AABB against the tile grid, resolved per axis, X then Y, in 1-unit steps. This is what later lets a bug remove the sweep from the charge hitbox.
- Tile kinds: solid, one-way (from above only), half-height one-way (surface half a tile down), spike, empty.
- Ceiling bump zeroes upward speed. Landing zeroes downward speed and sets `onGround`.
- Props are not collision; they are overlap triggers for the charge hitbox and the player box.

## Water

Any overlap with a waterfall prop's water column pulls the wizard down at 160 or faster, damps horizontal speed, forbids jumping, ends a charge, and stamps the prop's `hitTick`, which reveals the logs. Reaching the room's bottom row in water is a death. Reach at the run speed of 110: a full jump carries about 68 units, four tiles, at take-off height, and coyote time adds up to 11 more; a jump followed by a charge carries about 128. So a six-tile gap, 96 units, needs the charge and a four-tile gap does not; five-tile gaps are not used because they are too close to call. A short jump into a charge gap lands in the water.

## Death and respawn

Deaths return the wizard to the checkpoint: the last raised flag, or the room's spawn before any flag. The death counter increments. The respawn position is computed first, while a carried creature still rides, and only then is the creature dropped at its nearest hiding place; this order is what lets a planted checkpoint bug be felt on the respawn that follows. The run clock stops at the final beacon.

## Input

Keyboard only in Season 1:

| Action | Keys |
|---|---|
| left / right | arrows or A / D |
| jump | Z, Space, up arrow or W |
| charge (attack) | X or J |
| down | down arrow or S |
| raise ticket | T |
| restart | R |
| hitboxes and tiles over a painting | F1 |
| start | Enter, Space or Z on the title |

Enter never restarts a run. Gamepad and touch come later.

## Replay tests

One file per rule group under `tests/sim/`, using a helper that builds a world from a text map and steps it with recorded input frames. Required files and what each proves:

| File | Proves |
|---|---|
| `world.test.ts` | same inputs and seed give identical state after 600 ticks; parser places spawn and props; spikes and out-of-room kill; a death after raising a flag respawns at the checkpoint, not the spawn (the respawn position to the unit is asserted only by the paired test of HW-002) |
| `physics.test.ts` | swept X then Y; one-way from above only; half-height surface; ceiling bump |
| `jump.test.ts` | jump height about three and a third tiles held, shorter when cut; coyote within 6 ticks; buffer lands and jumps |
| `fall.test.ts` | long-fall threshold; landing pose selection value |
| `charge.test.ts` | wind-up, distance, gravity off, wall recoil, cooldown, hitbox hits props; a charge into a wall three tiles thick recoils (the one-tile wall is asserted only by the paired test of HW-003) |
| `oneway-half.test.ts` | the `=` tile |
| `water.test.ts` | pull, drag, no jump, charge ended, death at the bottom, reveal stamp |
| `creature.test.ts` | hiding, riding, fleeing, ten-second release |
| `forest-room.test.ts` | a scripted playthrough of each Season 1 room reaches its beacon |

The whole suite runs in under a second. Nothing in `tests/sim` asserts what a paired test under `bugs/tests/` asserts: the respawn position to the unit belongs to HW-002 and the one-tile wall to HW-003.
