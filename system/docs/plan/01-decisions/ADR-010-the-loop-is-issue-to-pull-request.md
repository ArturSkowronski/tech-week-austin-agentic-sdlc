---
title: "ADR-010: The loop is issue to pull request; one world, no branch ladder, no auto-merge"
date: 2026-10-09
status: accepted
kind: decision
supersedes: "the branch model, the merge policy and step 7 of the visitor journey; the seed/main/stable plan of HWP-081; the merge policy of HWP-072"
---

# ADR-010: The loop is issue to pull request; one world, no branch ladder, no auto-merge

## Decision

- The whole story is: a visitor plays the game, meets the creature, finds the evidence, raises the ticket, waits, and gets a pull request with the fix and a preview to play. The loop ends at the pull request. Nothing in it merges.
- There is one deployed world: `main`, at the production URL, with the planted bug intact. Each fix lives on its own branch with its own preview URL, as ADR-007 already gives it. No `seed` branch, no `stable` branch, no custom domains, no promotion.
- Fix pull requests are not merged by the loop. They stay open as the record a visitor can read: the refinement, the diff, the two reviews, the preview. A human decides if and when anything lands on `main`, and `main` keeps its bug so the next visitor meets the same creature.
- No auto-merge, no `CODEOWNERS` gate, no branch protection for the loop's sake. The simulation still changes only through a reviewed pull request, which is how every change has landed so far.

## Why

The owner found the planned branch ladder overcomplicated for what the demo has to show. Two runs of the planted-bug flow (#149 on 5 October, #153 on 9 October) proved the part that matters: issue in, reviewed PR with a playable preview out, no human code edits. Merging a fix into the shared world would remove the only planted bug (ADR-009, amendment of 8 October) and leave the next visitor nothing to find; a `seed` branch existed in the plan only to work around that, and a `stable` branch only to curate merges that no longer happen. Dropping all three leaves the story a visitor can hold in one breath.

## Consequences

- HWP-072 (merge policy) and HWP-081 (seed, main, stable and their domains) are closed as not planned. HWP-082 (ten trial visitors) plays the game at the production URL instead of `seed`.
- The visitor journey loses its branch model, merge policy and step 7; its first metric becomes a green, approved pull request with no human code edits rather than a clean merge. README, the plan README, the glossary, the game concept and ci-and-deploy are corrected to one world; the CI workflow builds `main` and pull requests only.
- A fix PR that falls behind `main` is closed, not merged; a new visitor raises the bug again and the flow opens a fresh one. That is what happened to #149 and #153.
- If a merge policy or a second world is ever wanted, it starts from a new ticket against this record.
