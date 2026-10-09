---
title: Glossary
date: 2026-09-10
kind: reference
---

# Glossary

| Term | Meaning |
|---|---|
| beat | a section of a level with its own planted bugs; Season 1 has one, the glade ([ADR-009](01-decisions/ADR-009-one-room.md)) |
| beacon | the stone tower that ends the run; touching it is `victory` |
| creature | the in-world form of a planted bug: red eyes at a hiding place, a passenger on the hat while the symptom is active |
| density | pixels per world unit of a texture; 1 or 2, recorded in the asset manifest |
| hiding place | a bush, hollow log or cracked rock a creature hides in |
| manifest, asset | `public/assets/manifest.json`, what the kit built and how |
| manifest, bugs | `bugs/manifest.json`, the planted bugs and their paired tests |
| painting | one continuous image drawn in place of tiles for a room, at 32 px per tile |
| paired test | the test under `bugs/tests/` that describes correct behaviour and fails while its bug is planted |
| planted bug | a real defect placed in a small module on purpose, listed in the bugs manifest |
| raw | a generated image in `assets/`, the kit's input |
| replay test | a Vitest test that steps the simulation with recorded input frames and asserts on state |
| room | a text map, one character per tile, optionally with a painting |
| shared world | `main` as deployed: the game with its planted bug intact, which every visitor plays and no fix PR changes (ADR-010) |
| symptom | what the player feels while the creature rides; it is the defect itself |
| tick | one 60 Hz simulation step |
| trace | painting collision onto a text map in the browser tool |
| waterfall of logs | the code-drawn waterfall whose parted water shows a bug's log lines |
| world heals | a branch whose manifest lacks a bug shows no creature for it |
| world unit | one pixel of the 320 by 180 view; a tile is 16 units |

The terms **wand ride** and **charge** are deliberately not defined here. Their meaning changed between the [game concept](00-vision/game-concept.md) and [ADR-002](01-decisions/ADR-002-wand-ride-becomes-the-charge.md); the compiled wiki is expected to define them from those sources.
