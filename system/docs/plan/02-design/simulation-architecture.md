---
title: Simulation and renderer architecture
date: 2026-09-10
status: accepted
kind: design
---

# Simulation and renderer architecture

## The split

```
game/
  main.ts          loop: accumulate real time, run whole 60 Hz ticks, render once per frame;
                   ?room=<name> selection; window.wizard for automation
  sim/             pure, deterministic; the only place WorldState changes
  render/          PixiJS; reads WorldState, never writes it
  content/         tile-order.ts (the atlas order) and order.ts (the room order), outside the glob
  content/rooms/   one text map per room, indexed by glob
```

`game/sim/` has no timers, no `Math.random`, no `Date`, no DOM, no import from `render/`. Randomness comes from `nextRandom(state)` over a seed held in state. `tick(state, input)` is the only function that mutates `WorldState`.

`game/render/` selects animations from the player's state and `stateTimer`, never from wall time, so a replay always shows the same frames.

## WorldState

JSON-serialisable. Fields, all required:

| Field | Meaning |
|---|---|
| `roomName` | the room's file name |
| `tick` | ticks since the run started |
| `seed`, `rng` | seed and current generator word |
| `room` | `{ width, height, tiles: Uint8Array, spawn }`, tiles in row-major order |
| `player` | position (top-left of the hitbox), velocity, facing, `state`, `stateTimer`, `onGround`, `coyote`, `jumpBuffer`, `jumpHeld`, `chargeCooldown`, `invuln`, `fellFor`, `checkpoint` |
| `props` | `{ id, kind, x, y, w, h, hitTick, active }` for every prop in the room |
| `creature` | `{ at, travelTo, travelUntil, carriedSince, firstCarried }`, see [bug quest](bug-quest.md) |
| `deaths` | count |
| `victoryTick` | tick the beacon was reached, −1 until then; the run clock stops here |
| `events` | strings emitted this tick, cleared every tick; consumed by audio and particles |
| `lastInput` | the frame applied this tick |

`InputFrame` is `{ left, right, jump, charge, down }`, booleans, recorded per tick. A recorded session is an array of frames plus the seed; it replays anywhere.

`createWorld(roomText, options)` takes a `creature` option so the main test suite can build a world with or without a creature independently of the bug manifest.

## Planted bugs in the simulation

Each planted bug lives in its own small module named by the manifest, for example `game/sim/input-map.ts`. The module documents the intended behaviour in a comment and implements the defect in a way that reads as a plausible mistake, not a switch. See [bug quest](bug-quest.md) for the manifest.

## The loop

Real time is accumulated; the simulation runs in whole steps; the renderer draws once per frame with no interpolation. Positions are rounded to whole pixels only in the camera and sprite placement, never in the simulation.

## Automation surface

`window.wizard` on the page exposes:

| Member | Does |
|---|---|
| `start()` | leaves the title screen |
| `reset()` | restarts the current room |
| `paused` | boolean, stops the loop from ticking |
| `step(n, input)` | runs n ticks with a fixed input frame while paused |
| `state()` | the current `WorldState` |

Browser tests and every renderer change are verified through it. It is never removed.

## Content by convention

Content is added by adding a file: a room module, a test, a raw asset. The rooms index is a glob over `game/content/rooms/*.ts`; the game plays `?room=<name>` and defaults to `forest-glade`. There are no central registries.
