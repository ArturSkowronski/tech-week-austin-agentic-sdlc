---
title: "ADR-005: Planted bugs live in a manifest paired with failing tests"
date: 2026-09-09
status: accepted
kind: decision
modules: [sim, bug-quest]
---

# ADR-005: Planted bugs live in a manifest paired with failing tests

## Decision

- `bugs/manifest.json` lists every planted bug: id, title, symptom, clue, the module that holds the real defect, the paired test, the rooms it lives in, the hiding place its creature uses, the reproduction steps and expected result the ticket carries, and the log lines the waterfall shows. The schema will be in the bug quest design document.
- Each paired test under `bugs/tests/` describes the **correct** behaviour and therefore **fails** while the entry exists.
- `pnpm bugs:check` runs in CI and enforces the pairing both ways: a listed bug whose test passes fails the build; a delisted test that still fails fails the build; a listed test must fail on an assertion, not on a load error.
- **Fixing a bug is exactly one PR**: correct the module, delete the manifest entry, and the paired test passes. Nothing else can pass CI.
- The main suite never asserts planted behaviour. Only the paired test knows what the bug does.
- **The world heals per branch.** The game reads the manifest at build time; a branch whose manifest no longer lists a bug has no creature for it, so the preview of a fix shows the fixed world.

## Why

A fix that is one PR with a machine-checked definition of done is what makes the Visdom loop reliable and the "you planted them" objection answerable: every creature links to its test, and after the fix to its code.

## What the check cannot do

It cannot detect a paired test edited to pass. Reviewers reject that; the Visdom review step is told so.
