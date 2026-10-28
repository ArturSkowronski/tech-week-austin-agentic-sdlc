---
title: "ADR-011: game/sim is the critical path; every change to it waits for a human"
date: 2026-10-20
status: accepted
kind: decision
modules: [sim]
---

# ADR-011: game/sim is the critical path; every change to it waits for a human

## Decision

- `game/sim/` is the critical path of the game. A change to it is accepted only after a human approves it, whoever wrote it, a person or an agent. This holds for a planted-bug fix too: the fix pull request stays open for a human (ADR-010).
- `game/sim/constants.ts` is frozen. A tuning number changes in a design decision, never as a side effect of a ticket.
- Anything that holds the wizard still (victory, a cast, a startle, a cutscene) holds his input only. Gravity, the water and the props go on (INC-2026-09-30).
- Every change to `game/sim/` ships a replay test in `tests/sim/` (AGENTS.md rule 1).

## Why

The plan already said it: a human "merges anything that touches `game/sim/` outside a planted-bug ticket" (docs/plan/README.md), and ADR-010 keeps every fix pull request open for a human. The simulation is what a visitor feels in the first ten seconds, and what every replay test, the bug quest and the waterfall of logs are built on. INC-2026-09-30 shows the shape of the risk: a short, readable change to the player step froze the wizard in the air, and the replay tests of the day did not play through it.

## Consequences

- The factory classifies every change under `system/game/sim/` as the critical path: risk high or critical, a human node in the line.
- The renderer, the content and the tools do not wait for a human when the risk is low and the work order has its own scenarios.
