---
title: Rules for agents, the AGENTS.md of the game repository
date: 2026-09-10
status: accepted
kind: design
---

# Rules for agents

This is the content of `AGENTS.md` in the game repository, committed in M0 and kept current.

---

# Working in this repository

Hobby Wizard is a browser platformer that doubles as the Visdom sandbox codebase. Visitors find real planted bugs in the game and hand them to Visdom to fix. Keep the code readable: prospects inspect both the game and the process that built it.

## Layout

- `game/sim/` pure deterministic simulation. `tick(state, input)` is the only function that mutates `WorldState`. No timers, no `Math.random`, no `Date`, no DOM, no rendering imports. Randomness comes from `nextRandom(state)`.
- `game/render/` PixiJS rendering. Reads `WorldState`, never writes it. Animations are chosen from player state and `stateTimer`, never from wall time.
- `game/content/rooms/` text maps, one file per room, indexed by glob. Legend in `game/sim/room.ts`.
- `tools/asset-kit/` turns `assets/` into `public/assets/`. `tools/trace/` traces paintings to collision. `tools/bugs/check.ts` enforces the planted-bug pairing.
- `tests/sim/` Vitest replay tests, one file per movement rule group. `tests/tools/` for the kit and the trace model.
- `bugs/manifest.json` the planted bugs; `bugs/tests/` one failing test per entry.
- Tuning numbers live in `game/sim/constants.ts` and are frozen.

## Rules

1. Every change to `game/sim/` ships a replay test in `tests/sim/`.
2. Add content by adding a file or directory. Do not build central registries.
3. Assets go through `pnpm assets`; the build fails on files that skip it and on outputs nothing consumes.
4. Fixing a planted bug is one PR: correct the module the manifest names, remove the manifest entry, and the paired test passes. Never edit a paired test to make it pass; reviewers reject that.
5. The main suite (`pnpm test`) never asserts planted behaviour. Only the paired test under `bugs/tests/` knows what the bug does.
6. Never add code that detects developer tools or reads window size to change game behaviour.
7. `pnpm typecheck && pnpm lint && pnpm test && pnpm bugs:check` must pass before a PR, judged by exit code.
8. `window.wizard` on the page exposes `start`, `reset`, `paused`, `step(n, input)` and `state()` for automation. Use it in browser tests; do not remove it.
9. One source for each fact: tile order, prop sizes, crystal positions and art rows live in one module or in the asset manifest, never in two places.
10. Commit messages describe intent in plain sentences; PRs carry the preview URL.

## Commands

```
pnpm dev        # http://localhost:5173
pnpm assets     # rebuild public/assets from assets
pnpm test       # sim replay tests
pnpm build      # assets + vite build into dist/
```
