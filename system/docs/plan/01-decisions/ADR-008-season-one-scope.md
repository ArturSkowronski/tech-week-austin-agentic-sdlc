---
title: "ADR-008: Season 1 ships three planted bugs, one per beat"
date: 2026-09-09
status: accepted
kind: decision
supersedes: "the ten-bug seed catalogue as the launch set"
---

# ADR-008: Season 1 ships three planted bugs, one per beat

## Decision

Season 1 is one level, the Forest, in three beats (the glade, the ruin gate, the cliff ruins), with **three** planted bugs, one per beat, each with a creature, a felt symptom, evidence in that beat's waterfall, and a paired failing test. The set will be listed in the bug quest design document.

The earlier ten-bug catalogue is kept as the **backlog** for later seasons and for the maintenance flow. Only the Bug creature type ships in Season 1; the Smell and the Log gremlin follow in Season 2.

## Why

The best planted bug in the prototype was felt within a second, explained by the logs, and fixed in one file. Bugs that only show in a counter or a corner case read as jank. Three bugs of that quality are worth more than ten of mixed quality, and each still takes a full Visdom run to demonstrate.

## Selection rule for a planted bug

Design the symptom before the code: felt within thirty seconds of meeting the creature, explained by log lines a player can read, fixed in one small module the manifest names, proven by one replay test.
