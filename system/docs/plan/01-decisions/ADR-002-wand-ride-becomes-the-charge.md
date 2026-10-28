---
title: "ADR-002: The wand ride is the attack, not the locomotion"
date: 2026-09-09
status: accepted
kind: decision
supersedes: "game-concept.md sections 3 and 4"
modules: [sim]
---

# ADR-002: The wand ride is the attack, not the locomotion

## Context

The [game concept](../00-vision/game-concept.md) defines the wand ride as the way the wizard moves: he bounces through the level astride the wand, a held jump button charges a higher bounce, and the attack is an aerial fireball fired from a bounce.

The Phase 0 movement spike built the bounce and played it for a day. Automatic rebound made ledges hard to stop on, the charged bounce asked the player to plan a landing two hops ahead, and precise stops next to a bush or a log, which the hidden-bug loop needs constantly, were frustrating. The fireball added a projectile system, a second hitbox model and a full set of orb animations for a game that has no enemies to shoot.

## Decision

1. **The wizard walks and jumps.** Locomotion is a conventional platformer model: run, variable-height jump, coyote time, jump buffer. There is no automatic rebound, no charged bounce, no bounce height. The tuning table will live in one movement and physics design document, written from this record.
2. **The wand ride is the attack.** Pressing attack makes the wizard leap astride the wand and dash forward a short way with the crystal tip leading, gravity off, then dismount. This move is called the **wand charge**, or **charge** for short. It is how the wizard strikes a hiding place or parts the waterfall from a distance, and, after a jump, how he crosses a gap the jump alone cannot clear.
3. **"Charge" means the dash and nothing else.** It no longer means holding a button to build energy, whether for a higher bounce or for a bigger orb. There is no held-button build-up anywhere in the game. Any document, ticket, prompt or test that uses "charge" for a build-up is to be read as superseded by this record.
4. **The fireball is dropped.** There is no projectile. The crystal tip during the charge is the hitbox.
5. **Riding imagery survives only in the charge frames.** The wizard is astride the wand in the charge and recoil animations and in no other state.

## Consequences

- Player states are `idle, run, jump, fall, charge, chargeRecoil, land, hurt, victory`. There is no `bounce`, `bounceCharge` or `shoot` state.
- The animation list loses the bounce cycle, the charged-bounce squash and the orb frames, and gains the charge frames, the first held as the wind-up, and the recoil frame. The asset list follows from this.
- Sound effects lose the bounce and fireball sounds and gain `charge`, `charge hit` and `charge wall`.
- Art prompts for the wizard describe him standing, running and jumping on foot; only the charge pose describes him astride the wand.
- Replay tests cover jump height, variable jump, coyote and buffer, and the charge's distance, gravity-off, wall recoil and cooldown. Nothing tests a bounce.
- Level geometry rules derive from the jump and the charge: a jump clears three tiles up and about four across; a jump followed by a charge crosses a six-tile gap. The numbers are the tuning table's. Mushrooms and enemies as bounce pads are out.

## Kept for later

A downward wand slam from the air, as a Season 2 candidate, if the level design wants a way to break through floors. It would be a new state, not a return of the bounce.
