---
title: Bug Quest, the planted-bug loop
date: 2026-09-10
status: accepted
kind: design
---

# Bug Quest, the planted-bug loop

Planted, real defects show up in the game as a creature. The player feels the symptom, finds the evidence in the waterfall of logs, raises a ticket, and Visdom fixes it with a reviewed pull request. Rules of the manifest are in [ADR-005](../01-decisions/ADR-005-planted-bugs-manifest.md); the report path in [ADR-006](../01-decisions/ADR-006-report-path-github-issue.md); the Season 1 set in [ADR-008](../01-decisions/ADR-008-season-one-scope.md).

## Manifest schema

`bugs/manifest.json`:

```json
{
  "bugs": [
    {
      "id": "HW-001",
      "title": "Left and right swap while the creature rides",
      "symptom": "Left and right feel swapped.",
      "clue": "input handling",
      "module": "game/sim/input-map.ts",
      "test": "bugs/tests/hw-001-input-map.test.ts",
      "rooms": ["forest-glade"],
      "creature": { "hides": "bush" },
      "steps": ["Walk through the bush; the creature jumps on.", "Hold right."],
      "expected": "The wizard walks right.",
      "logs": [
        "[input] left/right mapping: INVERTED",
        "[input] axis sign flipped while carrying",
        "[bug] hides in: input handling"
      ]
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `id` | `HW-` and three digits, stable forever |
| `title`, `symptom` | plain words for the ticket and the card |
| `clue` | a module-level hint, never a file |
| `module` | the file that holds the real defect; the fix touches this file |
| `test` | the paired test that fails while the entry exists |
| `rooms` | the rooms whose creature carries the bug; each room's waterfall shows its logs |
| `creature.hides` | `bush`, `log` or `rock`; one creature per room |
| `steps`, `expected` | the reproduction the ticket carries, after "start a run in <room>" |
| `logs` | the lines the waterfall shows |

The simulation reads the manifest through `game/sim/bugs.ts`: `bugsForRoom(room)` and `bugForRoom(room)`. When the list is empty the world is clean.

## The creature

State in `WorldState.creature`: `at` (prop id it hides in, −1 while carried or travelling), `travelTo`, `travelUntil`, `carriedSince`, `firstCarried` (has the bug been felt yet?).

1. **Hiding.** Red eyes blink at the hiding place named in the manifest. A glitch aura at the spot intensifies as the wizard approaches (Season 1 atmosphere pass).
2. **Riding.** Walking through the hiding place puts the creature on the wizard's hat and the symptom starts. It lets go after 600 ticks, or when the wizard charges, and runs to the nearest hiding place in 30 ticks.
3. **Fleeing.** Charging its hiding place makes it flee to another hiding place in the room.
4. A death drops it at its nearest hiding place, after the respawn position has been computed, so a bug in the checkpoint code is felt on the respawn that follows a carried death.

The symptom is the defect itself: the creature does nothing but set a flag the bugged module reads.

## Evidence

Each beat's waterfall carries that beat's bug's log lines, drawn behind the water and readable only while the water is parted: disturbed by touch or a charge hit, it stays parted 150 ticks. Fictional flavour lines and real evidence are visibly distinct; only the manifest's lines are real.

## The ticket card

Three states, chosen from `creature.firstCarried` and the manifest:

| State | Text | Button |
|---|---|---|
| bug felt, logs not yet read | "Something is wrong with <clue>." | none |
| logs read, bug not yet felt | "The logs mention a bug in <clue>. It hides in the <hiding place>." | none |
| logs read and bug felt | "The logs name your bug: <id> <title>. Raise a ticket." | Raise ticket on GitHub, T |
| no bug in the manifest | "The logs are clean." | none |

The card can be waved away after three seconds.

## The issue

Opened in the repository named by `VITE_GITHUB_REPO`, inside the key or pointer event. Title: `<id>: <title>`. Labels `bug`, `planted`. Body sections: Symptom; Where (room, tick, player position); Steps (from the manifest, after "Start a run in <room>"); Expected; Actual; Clue; Logs (the manifest's lines). Never the module path.

## Season 1 planted bugs

| Id | Beat | Hides in | Symptom | Real defect, hidden from the player | Paired test asserts |
|---|---|---|---|---|---|
| HW-001 | glade | bush | left and right swap while the creature rides | the input axis is read in the creature's backward-facing orientation in `game/sim/input-map.ts` | holding right while carried moves right |
| HW-002 | ruin gate | log | respawn lands one tile left of the flag | off-by-one in tile-to-world conversion in `game/sim/checkpoint.ts` | respawn position equals the flag's |
| HW-003 | cliff ruins | rock | the charge passes through a thin wall | swept collision skipped for the charge hitbox in `game/sim/charge-hit.ts` | a charge at full speed stops at a one-tile wall |

Each defect is written as a plausible mistake with a comment stating the intended behaviour, in its own small module, so the fix is one file. HW-002 shares its module family with a later flag-adjacent bug in Season 2, which is the scripted engineering-memory demonstration.

## Backlog from the original catalogue

For the maintenance flow and Season 2: jump stutter near ledges (position rounded before collision resolve), torch frame off-by-one, bush animating every tick, console flood in the collision loop (log gremlin), waterfall scroll tied to refresh rate, discovery counter double-count, camera jitter at the world edge (pairs with the memory demonstration), duplicated creature movement code (smell).

## Definition of done for a fix

One PR that corrects the module the manifest names, deletes the manifest entry, and makes the paired test pass; `pnpm typecheck && pnpm lint && pnpm test && pnpm bugs:check` green; the preview URL shows the world without that creature. Editing the paired test to pass is rejected in review.
