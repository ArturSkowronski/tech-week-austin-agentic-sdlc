---
title: Hobby Wizard and the Hidden Bug, game concept
date: 2026-09-08
status: accepted concept
kind: vision
---

# Hobby Wizard and the Hidden Bug

A browser pixel-art platformer whose codebase is the public sandbox for Visdom. Real, planted defects show up in the game world as creatures. The player feels the symptom, finds the evidence, raises a ticket, and Visdom fixes the game with a reviewed pull request. The game is the codebase. Visdom is the hero.

Working title: **Hobby Wizard and the Hidden Bug**, short form **Hobby Wizard**, slug `hobby-wizard`.

## 1. Purpose

Prospects should be able to, in five minutes and without help:

1. play a short, polished forest level,
2. meet a bug and feel that something is wrong,
3. read the evidence in the game world,
4. hand the problem to Visdom,
5. watch Visdom refine, implement, review and ship a fix,
6. play the fixed world.

Everything else in the concept exists to make that sequence reliable and pleasant. The game must be fun enough that the planted bugs read as clues, not as jank.

## 2. Fantasy

An original, slightly ridiculous old wizard with an oversized magical wand explores a forest at dusk. Software jokes live in the world: literal bugs hide in bushes, hollow logs and cracked rocks; a waterfall hides a cascade of green system logs; a beacon at the end of the level burns when the world is healed.

The wizard is short and stout, with a long grey beard, an oversized crooked pointed hat in dark green with a brass buckle, brass goggles pushed up on the brim, an emerald robe cut above the knee, a wide brown belt and sturdy boots. His wand is a gnarled wooden pole taller than he is, with a pale blue crystal at the tip. The crystal is the light source in every scene.

## 3. Movement: the wand ride

The signature of the game is **the wand ride**. The wizard sits astride the wand like a child on a hobby horse, tip pointing forward, and **bounces** through the level. Bouncing is the locomotion. Walking exists only as a slow shuffle when the player lets go of the wand, for lining up in tight spots.

- Each landing rebounds automatically to a fixed **bounce height** of about two tiles.
- Holding jump on landing performs a **charged bounce**: the wizard sinks lower for a moment and springs to about four tiles. The longer the button is held before the landing, up to a cap, the higher the bounce. This is what "charging" means in the movement model: building energy for the next spring.
- **Chained bounces** on enchanted mushrooms and on enemies reach hidden routes.
- Mid-air steering is soft, so rhythm matters more than precision.

The reference feeling is the pogo movement of early console platformers, reproduced with an original character and original levels. The movement must be prototyped and approved before any other work: if the bounce does not feel good, nothing else will.

## 4. Attack: the aerial wand shot

From a bounce, pressing attack launches the wizard slightly higher, he swings the wand out from between his legs, spins once, and fires a **blue fireball** in the facing direction, then tucks the wand back before landing.

> Bounce, launch, spin, fire, remount, land.

- Holding the attack button charges the orb at the wand tip; releasing fires. A fully charged shot travels the whole screen and parts the waterfall.
- The spin is visual flair. The player never has to time the firing frame.
- Tiny blue sparks trail the crystal on every bounce; during a charge they gather into a blue-white orb.

## 5. Hidden bugs

Attackable scenery hides creatures: bushes, hollow logs and cracked rocks. Each has a tell that is the defect itself: a bush rustles without wind, a log chatters, a crack glows. A fireball that hits a hiding place flushes the creature out; it scurries away and can be caught.

Catching a creature **discovers** its quest. It does not fix anything. A ticket card appears with the symptom in plain words and a module-level clue, never a file or a line. Only a fix through Visdom removes the creature, and only on that fix's own preview: the shared world keeps it for the next visitor (ADR-010).

Three creature types map to three kinds of engineering work:

| Creature | Real thing | Example |
|---|---|---|
| Bug | a failing behaviour test | a jump stutters near ledges |
| Smell | a refactor ticket protected by behaviour tests | duplicated collision code |
| Log gremlin | noisy or leftover logging | the waterfall chatters |

## 6. The waterfall of logs

A forest waterfall that, from a distance, is ordinary water with faint green flickers. A fireball through it parts the water and reveals a dark rock face with scrolling green diagnostic text. Fictional flavour lines and real, useful evidence are visibly distinct; the real lines name the symptom and the module the bug lives in. A creature hiding among the lines jumps out.

## 7. The beacon

The level ends at a stone beacon. It lights when the region has no living creatures on the current branch. On a fix branch's preview, the beacon burns and the fixed creature is gone. In the shared world it stays dark.

## 8. MVP scope

- One short forest level.
- The wand ride, the charged bounce, the aerial wand shot.
- Three hiding-place types and one creature type with an expressive escape.
- Three initial quests: two bounded functional bugs and one refactor.
- One waterfall reveal as the clue for one of them.
- Checkpoints, hazards, restart, discovered and repaired counters.
- A ticket card that links symptom, clue, task, PR, evidence and preview.

## 9. Visual direction

Retro fantasy, 16-bit-inspired pixel art. Forest greens, aged gold, charcoal, warm browns, pale blue for magic. Ornamental gold interface borders with a leaf motif on charcoal panels. Clear gameplay silhouettes and readable interface text.

## 10. Constraints

- Runs entirely in the browser as a static site.
- Small, readable, open-source codebase; prospects inspect the code and the process that built it.
- Every visitor plays from an isolated snapshot, so a quest stays available after someone else solves it.
- Original characters, geography, music and branding; no franchise names anywhere, including in art prompts.
