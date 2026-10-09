---
title: The visitor's first five minutes, and what we measure
date: 2026-09-08
status: accepted
kind: vision
---

# The visitor's first five minutes

1. Land on the game. A short intro card: "This game has bugs. Real ones. Find them, hand them to Visdom, watch it fix them."
2. Play through the forest. Something is off.
3. Meet the creature. Feel the symptom. A ticket card names it in plain words with a module-level clue, never a file.
4. Find the evidence at the waterfall of logs; the card now names the bug and offers to raise a ticket.
5. Raise the ticket. Within two minutes: the refinement agent's analysis and a root-cause hypothesis.
6. Within twenty minutes: a pull request, a preview URL, a cross-model review. Play the preview. The symptom is gone. The creature is gone. The beacon burns.

That is the whole loop. The pull request stays open as the record: the refinement, the diff, the reviews, the preview. The shared world keeps its bug for the next visitor ([ADR-010](../01-decisions/ADR-010-the-loop-is-issue-to-pull-request.md)).

## Success metrics

| Metric | Target |
|---|---|
| Planted bugs that reach a green, approved pull request with no human code edits | at least 70 % |
| Report to refined ticket with a root-cause hypothesis | under 2 minutes |
| Report to PR with a preview URL | under 20 minutes |
| Visitors who meet a creature within 3 minutes of play | at least 60 % |
| Trial visitors who complete the loop unassisted | 10 of 10 |

## One world

| Branch | Role | Deployed to |
|---|---|---|
| `main` | the game, with its planted bug intact | the production URL |
| `bug/<bug-id>` | one per report, a preview per push; not merged by the loop, closed when it falls behind `main` | `<alias>-<project>.workers.dev`, in the PR's comment |

Fix pull requests are not merged by the loop; a human decides if and when anything lands on `main`, and the simulation changes only through a reviewed pull request ([ADR-010](../01-decisions/ADR-010-the-loop-is-issue-to-pull-request.md)).

## Seasons

Each season ships a region with its own planted bugs. Between seasons a maintenance flow scans `main` and proposes new creatures from real findings; a human approves them before they enter the manifest.

## Later, not Season 1

A gateway Worker with GitHub sign-in, an in-game panel with live flow status and clarifying questions, a leaderboard, visitor feature requests, a second region.
