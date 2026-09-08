---
title: The visitor's first five minutes, and what we measure
date: 2026-09-08
status: accepted
kind: vision
---

# The visitor's first five minutes

1. Land on the seed world. A short intro card: "This game has bugs. Real ones. Find them, hand them to Visdom, watch it fix them."
2. Play through the forest. Something is off.
3. Meet the creature. Feel the symptom. A ticket card names it in plain words with a module-level clue, never a file.
4. Find the evidence at the waterfall of logs; the card now names the bug and offers to raise a ticket.
5. Raise the ticket. Within two minutes: the refinement agent's analysis and a root-cause hypothesis.
6. Within twenty minutes: a pull request, a preview URL, a cross-model review. Play the preview. The symptom is gone. The creature is gone. The beacon burns.
7. On merge, the fix lands in the shared world; the trace stays browsable.

## Success metrics

| Metric | Target |
|---|---|
| Clean-merge rate on planted bugs, no human code edits | at least 70 % |
| Report to refined ticket with a root-cause hypothesis | under 2 minutes |
| Report to PR with a preview URL | under 20 minutes |
| Visitors who meet a creature within 3 minutes of play | at least 60 % |
| Trial visitors who complete the loop unassisted | 10 of 10 |

## Branch model

| Branch | Role | Deployed to |
|---|---|---|
| `seed` | every planted bug intact; visitors branch from here; updated only when a season ships | `play.<domain>` |
| `main` | merged fixes land here: the healed world | `main.<domain>` |
| `stable` | curated promotion from `main` | `stable.<domain>` |
| `fix/<bug-id>-<reporter>` | one per report, preview per commit, deleted on merge or after 14 days | `<alias>.<project>.workers.dev` |

Merge policy: automatic to `main` when CI passes, the manifest entry is removed and the review approves. Human approval only for promotion to `stable` and for any change to the simulation outside a planted-bug ticket.

## Seasons

Each season ships a region with its own planted bugs. Between seasons a maintenance flow scans `main` and proposes new creatures from real findings; a human approves them before they enter the manifest. The `seed` branch keeps every bug for new visitors.

## Later, not Season 1

A gateway Worker with GitHub sign-in, an in-game panel with live flow status and clarifying questions, a leaderboard, visitor feature requests, a second region.
