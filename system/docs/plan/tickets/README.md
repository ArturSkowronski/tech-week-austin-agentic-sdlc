---
title: Tickets, how they are organised and consumed
date: 2026-09-16
kind: process
---

# Tickets

One file per ticket, `HWP-<nnn>.md`, with frontmatter Visdom reads before the body:

| Field | Meaning |
|---|---|
| `id` | `HWP-` and three digits; the tens digit is the milestone (0 to 8) |
| `title` | one line |
| `epic` | the milestone name; one GitHub issue with the `epic` label per milestone |
| `owner` | `visdom`, `human`, or `human then visdom` when a person supplies art or secrets first |
| `depends_on` | tickets that must be merged first |
| `docs` | the plan documents to read before starting, relative to the plan root |
| `files` | the files the ticket may create or change; anything else needs a note in the PR |

The body has Goal or Work, Acceptance, and where relevant the test file that proves it. Acceptance is the definition of done; the PR description quotes it and says how each line was checked.

## Order

```
M0 ──► M1 ──► M2 ──► M4 ──► M5 ──► M6
  └───► M3 ───┘        │      └──► M7 ──► M8
                        └─(M3 too)
```

M1 and M3 can run in parallel after M0. M2 needs M1 and parts of M3 (HWP-031 to HWP-034). M4 needs M2 and M3. M5 needs M4. M6 and M7 follow M5. M8 last.

## Creating the issues

For each milestone create an epic issue titled with the epic name, then one issue per ticket: title `HWP-nnn: <title>`, body is the ticket file with the `docs` paths turned into links to this plan repository, labels `M<n>` and, for `human` tickets, `needs-human`. Link each ticket to its epic and to its `depends_on` issues. Visdom refines each issue into a task plan before implementation; a human reviews every PR and supplies art where a ticket says so.

## Rules that apply to every ticket

The [rules for agents](../02-design/agents-rules.md), the [tuning table](../02-design/movement-and-physics.md), and the decision records in [docs/01-decisions](../01-decisions/). Where a ticket and a decision record disagree, the decision record wins and the ticket gets fixed.
