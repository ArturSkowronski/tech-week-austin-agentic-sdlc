---
title: Prompts, audio
date: 2026-09-10
kind: asset-brief
---

# Prompts, audio

Sound effects with a text-to-sound model, one prompt per effect, all with "no music, no voice, dry, single sound" appended. Triggered from simulation events, never from render timing. There is no bounce or fireball sound ([ADR-002](../../01-decisions/ADR-002-wand-ride-becomes-the-charge.md)).

| Effect | Prompt | Length |
|---|---|---|
| jump | "soft whoosh of cloth with a tiny magical chime" | 0.3 s |
| land | "a small soft thud on grass" | 0.2 s |
| charge | "a quick magical whoosh with a rising sparkle" | 0.4 s |
| charge hit | "a soft magical thump with a few sparks" | 0.3 s |
| charge wall | "a short wooden clonk and a dizzy chime" | 0.4 s |
| bush rustle | "a leafy bush shaking briefly" | 0.5 s |
| log chatter | "a hollow wooden rattle like something small inside a log" | 0.6 s |
| rock crack | "stone cracking sharply then crumbling" | 0.6 s |
| creature pop-out | "a squeaky cartoon chirp, surprised" | 0.3 s |
| creature caught | "a cheerful two-note chime" | 0.5 s |
| checkpoint | "a short bright bell with a soft echo" | 0.8 s |
| beacon lit | "a rising magical swell ending in a warm bloom" | 2 s |
| waterfall | "a steady small waterfall, seamless loop" | 8 s loop |

**Music, one loop**: "Gentle adventurous forest theme for a retro platformer, light chiptune-influenced instrumentation with a warm woodwind melody, moderate tempo, loops cleanly, playful and slightly mysterious." Behind a settings toggle; confirm the licence tier before it enters the repository.

**What shipped (2026-10-02):** the set made from these prompts was replaced the day it landed; the owner found it flat in the game. The shipped sounds were generated in an ElevenLabs Studio session from revised prompts that name the retro-platformer character ("Retro 8-bit pixel platformer jump, short bouncy rising chirp, clean, no music", and so on), listed sound by sound in [assets/PROVENANCE.md](../../../../assets/PROVENANCE.md). The event mapping and lengths are unchanged, with two exceptions: the music loop and its settings toggle were dropped for a night-forest ambience bed that plays from the first touch of the page, and the waterfall's loop is no longer played flat but swells and fades with the wizard's distance from the fall.
