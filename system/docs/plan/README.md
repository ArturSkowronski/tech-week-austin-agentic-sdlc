---
title: Hobby Wizard, the plan for rebuilding it through Visdom
date: 2026-09-16
kind: process
---

# Hobby Wizard, the plan for rebuilding it through Visdom

This folder, `docs/plan/` of the game repository, is everything Visdom needs to rebuild *Hobby Wizard and the Hidden Bug* from an empty repository without supervision: the vision, the decisions, the design, the art briefs and raw art, and one ticket per pull request. It is also the corpus a Context Fabric wiki is compiled from, which is why every document carries the date it was written and the plan is committed in that order.

The reference implementation is the prototype at `visdom-sandbox` (VirtusLab/visdom-sandbox). Consult it, do not copy it blindly; where it and this plan differ, the plan wins.

## Layout

| Path | What | Read when |
|---|---|---|
| [00-vision/](00-vision/) | the game concept and the visitor journey with its metrics | first |
| [01-decisions/](01-decisions/) | ADR-001 to ADR-008, the settled decisions; on any conflict the newest ADR wins | before any design doc |
| [02-design/](02-design/) | movement and physics, architecture, rendering, level design, bug quest, CI, the rules for agents | per ticket, as listed in its `docs` |
| [03-assets/](03-assets/) | art direction, the asset list, the pipeline, prompts, provenance | art tickets |
| [04-glossary.md](04-glossary.md) | terms | any time |
| [tickets/](tickets/) | HWP-001 to HWP-082, one file per PR, with dependencies and the docs to read | to work |
| [assets/](../../assets/) | the generated art that exists, with its [provenance](../../assets/PROVENANCE.md) | M3, M4 |

## The process

1. The plan, this folder and `assets/`, is in the repository before anything else. A human then does HWP-004: secrets, labels, Visdom access.
2. Every milestone becomes an epic issue and every ticket an issue, as described in [tickets/README.md](tickets/README.md).
3. Visdom takes tickets in dependency order. For each: read the `docs`, refine into a task plan, implement as one PR that touches the listed `files`, prove the acceptance lines, pass `pnpm typecheck && pnpm lint && pnpm test && pnpm bugs:check`, carry the preview URL.
4. A human reviews each PR, supplies art where a ticket says `human`, approves the tuning table before M1 starts, and merges anything that touches `game/sim/` outside a planted-bug ticket.
5. When M5 is merged, the planted bugs are live and M7 puts Visdom on the other side of the loop: fixing them from the game's own tickets.

## Milestones

| Milestone | Tickets | Done when |
|---|---|---|
| M0 Repository, toolchain, CI, deploy | HWP-001 to 004 | green CI on `main`; a PR gets a preview URL |
| M1 Deterministic simulation | HWP-010 to 016 | every tuning rule has a replay test; the glade playthrough reaches the beacon |
| M2 Renderer | HWP-020 to 027 | the settled look at 640 by 360; nothing reads wall time |
| M3 Asset kit and trace tool | HWP-030 to 036 | `pnpm assets` idempotent; unreferenced outputs fail the build; a room round-trips through the trace tool |
| M4 Season 1 content | HWP-040 to 046, 083, 084 | one room, the glade, tile-drawn and complete; the other rooms retired |
| M5 Bug Quest | HWP-050 to 057 | the planted bugs proven both ways by `bugs:check`; the world heals per branch |
| M6 Atmosphere and audio | HWP-060 to 064 | 60 fps; sounds follow simulation events |
| M7 Visdom integration | HWP-070 to 073 | each seed bug goes from issue to merged PR through Visdom alone |
| M8 Launch hygiene | HWP-080 to 082 | ten trial visitors complete the loop unassisted |

## Conventions in these documents

- Every document has frontmatter with a `date`; the compiled wiki uses it to decide which statement is current.
- Decision records are named `ADR-nnn-*.md` and say what they supersede.
- Numbers live in one place each: the tuning table in [movement and physics](02-design/movement-and-physics.md), sizes in the [asset list](03-assets/asset-list.md), the legend in [level design](02-design/level-design.md).
- "Charge" always means the wand charge, the dash attack, in every document dated after 2026-09-09.
