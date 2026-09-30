---
title: Prompts, the wizard
date: 2026-09-10
kind: asset-brief
---

# Prompts, the wizard

Start every prompt with the sprite style block from [art direction](../art-direction.md). Generate at 2048 px for 2 px blocks, four variants, pick one, attach the approved idle frame as the reference on every later prompt. Ask for labelled pose sheets; the kit cuts the frames. The wizard is on foot in every state except the charge and the recoil ([ADR-002](../../01-decisions/ADR-002-wand-ride-becomes-the-charge.md)).

**Character description, appended to the style block on every wizard prompt**

> A short, stout, cheerful old wizard with a long grey beard, an oversized crooked pointed hat in dark green with a brass buckle, brass goggles pushed up on the hat brim, an emerald green robe cut short above the knee, a wide brown belt, sturdy brown boots. He holds an oversized gnarled wooden wand in both hands at hip height, tip pointing forward and glowing pale blue like a crystal. Confident, slightly ridiculous.

| Sheet | Last sentence of the prompt |
|---|---|
| idle, 4 frames | "Four frames of a standing idle in a row, side view, wand held level at the hip, breathing, the hat brim tilting slightly, labelled 1 to 4." |
| run, 8 frames | "Eight frames of a walk cycle in a row, side view, leaning forward, robe swinging, wand held level and forward, labelled 1 to 8." |
| jump, 7 poses | "Seven poses in a row: standing, crouch squash, take-off, rising in the air, falling, landing crouch, recovery. Side view, labelled." |
| fall, 4 poses | "Three flailing poses of a long fall, arms out, hat lifting, then a hard landing in a puff of dust. Side view, labelled." |
| charge, 5 frames | "One wind-up pose standing upright with the wand pulled back, then four frames charging forward astride the wand like a hobby horse, body low, legs trailing behind, the crystal tip leading with a trail of pale blue sparks and two frames with speed lines. Side view, labelled." The 1x sheet that exists has five riding frames and no upright pose; the renderer holds frame 1 for the wind-up either way. |
| recoil, 1 | "Recoiling after hitting a wall while astride the wand, hat pushed over the eyes, wand tip up, small stars." |
| hurt, 2 | "Two frames knocked back, side view, flashing pale, hat askew." |
| victory, 8 | done 2026-09-10 as the cast that lights the beacon: idle, a spin over four, the burst, the beam, idle (`wizard-victory.png`, HWP-044). The earlier brief was "Four frames with the wand raised overhead, sparks bursting from the crystal, a little hop of joy." |

Do not ask for: bouncing on the wand as movement, a fireball, an orb at the wand tip, a spin. Those were the concept's first draft and are out.
