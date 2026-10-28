# Lesson 3: Context L1-L5 (12 min)

😬 **Problem:** a player writes "left and right are swapped". The words sound like a keyboard problem, so the agent fixes the keyboard code. The build is green, and the real bug is somewhere else.

🛠️ **What we do:** we write down which part of the game owns which idea: the simulation is responsible for the creature, the controls and the movement. The factory turns that into a short guide the agent reads before it starts.

✅ **What you get:** the fix goes to the right place. You got there by correcting a list of facts, and the prompt stayed short.

## How it works

An agent that explores the repo from scratch for every task is slow, expensive, and lands somewhere different
each time. So the factory collects what it knows about the system once, on five levels:

| Level | What it says | Where it comes from |
|---|---|---|
| L1 system | which modules exist and what they depend on | `system/**/module.json` |
| L2 code | conventions and architecture rules | `system/AGENTS.md`, `system/architecture/rules.js` (ESLint) |
| L3 people | who actually changes each module, beside the nominal owner | `git log` versus `CODEOWNERS` |
| L4 decisions | ADRs (short design decision records) | `system/docs/plan/01-decisions/` |
| L5 operations | incidents | `ops/incidents/` |

`sdlc/context.py` builds two files from this: `AGENTS.md` (the guide for the agent) and `.sdlc/route.json`
(which module a task goes to). It is plain code without a model, so the same commit always gives the same result.

## Look around first

1. Set up the lesson: `factory lesson 3`.
2. Rebuild the guide: `make agents-md`. Open `AGENTS.md` and find section L3.
   👀 You should see: `sim` belongs to `@hobby-wizard/gameplay` on paper, but about 90% of its commits come from `visdomorchestrator[bot]`, an agent.
3. Ask where bug HW-001 would go: `make route O=hw-001`.
   👀 You should see: it goes to `render` (the screen code), because the report is full of "keys", "keyboard" and "arrow".

The bug is in `game/sim/input-map.ts`. Sent to `render`, the builder would look in the wrong module, and
ADR-011 and INC-2026-09-30, which apply to `sim`, would never reach its prompt.

## ✏️ Exercise: concept ownership (8 min)

1. Run `factory check 3`.
   🔴 You should see: `routing points to render: fill in owns in system/game/sim/module.json`.
2. Read why `sim` matters: `system/docs/plan/01-decisions/ADR-011-the-simulation-is-the-critical-path.md`.
3. Open `system/game/sim/module.json`.
4. Fill in the `owns` field with the concepts this module owns: the creature, the controls, movement, physics,
   the simulation. Shortcut: the ready block in the [README, lesson 3](../README.md#-lesson-3-context-l1l5).
5. Run `make route O=hw-001` again.
   👀 You should see: the bug now goes to `sim`, because `sim` owns "creature".

   ![`make route O=hw-001` before (it goes to `render`) and after you fill in `owns` (it goes to `sim`).](images/gif/l03-route-render-to-sim.gif)
   <sub>`make route O=hw-001` before (it goes to `render`) and after you fill in `owns` (it goes to `sim`).</sub>

6. Rebuild the guide: `make agents-md`.
7. Run `git diff --stat`.
   👀 You should see: two files changed, `module.json` and `AGENTS.md`.
8. Run `factory check 3`.
   🟢 You should see: `routing: HW-001 goes to sim` and `AGENTS.md is up to date with its sources`.
9. Commit.

Stuck? `factory solve 3`.

Why it works: one hit in `owns` counts more than ten in `keywords`. `critical: true` in `sim` works the same
way: the routing reports that the change touches the critical path.

## To discuss

- Why does routing by data matter with ten agents, and not with one?
- After your commit you show up in the L3 table for `sim`. Who knows `sim`, if nine commits in ten are an agent's?
- A task that touches concepts from two modules is usually two tasks (lesson 4).
