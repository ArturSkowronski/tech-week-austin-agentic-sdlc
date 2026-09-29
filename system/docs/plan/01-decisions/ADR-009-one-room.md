---
title: "ADR-009: Season 1 is one room, the glade, drawn in tiles"
date: 2026-09-29
status: accepted
kind: decision
supersedes: "the three beats of ADR-008 and the three-room level of the level design"
---

# ADR-009: Season 1 is one room, the glade, drawn in tiles

## Decision

- The game is one room, the forest glade, 80 tiles wide, drawn from its text map with the tileset. No painting is generated for it. [ADR-004](ADR-004-painted-levels-traced-to-collision.md) stays in force for any later room.
- The ruin gate and the cliff ruins are not part of Season 1. The cliff ruins is never built. The ruin gate room, its two panels and its playthrough leave the repository ([HWP-084](../tickets/HWP-084.md)); its text map stays under `docs/plan/02-design/rooms/` as a reference.
- Every planted bug lives in the glade. The glade has three hiding places, so the season holds up to three bugs, one per hiding place. The room shows one creature at a time: `bugForRoom` returns the first manifest entry for the room, and fixing that bug on `main` reveals the next. HW-002 moves from the ruin gate's log to the glade's log (HWP-084); HW-003 is dropped with the cliff ruins.
- The first-level-only boot of [HWP-083](../tickets/HWP-083.md) stands. `?room=` keeps selecting any room that exists.

## Why

The owner decided on 2026-09-29 that the demo needs one good room, not a level. The glade already carries every mechanic the bug quest needs: three hiding places, two flags, a waterfall in a charge gap, spikes and a beacon. The ruin gate doubled the content to maintain for a room the demo never reached, and every remaining art ticket served rooms two and three.

## Consequences

- [ADR-008](ADR-008-season-one-scope.md) keeps its selection rule and its backlog; its three beats are superseded here. "Beat" now means the glade.
- HWP-040, HWP-042, HWP-056 and HWP-062 are closed as not planned. HWP-043, HWP-045, HWP-073 and HWP-081 are reworded for one room. HWP-084 does the code work.
- The `seed` branch of HWP-081 shows the first creature, and each fix reveals the next.
