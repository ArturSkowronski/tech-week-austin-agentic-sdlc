---
title: "ADR-006: The report path is a prefilled GitHub issue"
date: 2026-09-09
status: accepted
kind: decision
supersedes: "Jira project HW as the ticket system"
modules: [render]
---

# ADR-006: The report path is a prefilled GitHub issue

## Decision

- The in-game ticket card carries a button, **Raise ticket on GitHub**, also on the T key, that opens a prefilled issue in the public repository named by the `VITE_GITHUB_REPO` build variable.
- The issue body holds the symptom, where it happened (room, tick, position), the reproduction steps, expected and actual behaviour, the clue and the waterfall log lines. It deliberately does not name the defect's file. Labels: `bug`, `planted`.
- The window opens inside the key or pointer event handler so browsers allow it.
- Visdom picks issues up from the repository. Until a gateway Worker exists this is the whole report path; the gateway, when built, replaces the URL behind the button, not the card.

## Why

Visdom reasons from symptoms to location; the location is the payoff after the fix. GitHub Issues keep the ticket next to the code and the PR, and need no server. Jira was the fallback if Context Fabric lacked a GitHub task connector; it is not used.
