---
title: Asset provenance for the raw art in assets/
date: 2026-09-16
kind: asset-brief
---

# Asset provenance

Written for the prototype repository, whose `assets/` layout this repository keeps. Extend it for every new raw: the table below carries one row per file in this directory, and `pnpm assets:report` names any raw that has none.

Every file here is generated art that the asset kit (`tools/asset-kit`) turns into
`public/assets`. Backgrounds, the wizard sheets, the tileset, the prop sheet and the
splash were generated with ElevenLabs Image (Nano Banana) on 2026-09-08 and 2026-09-09
from the prompts in the prototype repository's `docs/plans/2026-09-08-mvp-forest-spec.md`, section 5
(VirtusLab/visdom-sandbox), at 1280×720; the prompts are kept in `docs/plan/03-assets/prompts/`.
The level panels and the walk, jump, fall and victory sheets were generated with GPT Image 2
on 2026-09-09 and 2026-09-10 from the prompts recorded in the same spec and in the rebuild
brief. Only files the build consumes live in this directory; the build fails on any
output it cannot account for. Sheets may come with a real alpha channel or on a
solid magenta or dark page; the kit reads the alpha when it is there and keys the
page colour when it is not.

| File | What it is | Becomes |
|---|---|---|
| bg-mountains-big.png | detailed far mountain range, magenta sky | bg/mountains-big.png, 4 px pitch, mirror-tiled, 120 px base extension |
| bg-forest.png | tall forest, trunks and canopy | bg/trees.png, 4 px pitch, 120 px base extension. Keys to 143 rows of art against the asset list's 142, so the kit's cut from the bottom drops the topmost canopy row (3 pixels) on every build |
| bg-undergrowth.png | near undergrowth | bg/undergrowth.png, 4 px pitch, and its top 76 rows mirrored as bg/foreground.png |
| splash-textless.png | title screen without lettering | splash.png, 4 px pitch; the wordmark is drawn in code |
| wizard-idle.png | idle, 4 frames | sprites/wizard-idle.png, 8 px pitch |
| wizard-charge.png | wand charge, 5 frames | sprites/wizard-charge.png, 8 px pitch |
| wizard-walk.png | walk cycle, 8 labelled frames; first of four variants | sprites/wizard-run.png, 7 px pitch so the frames match the idle height |
| wizard-jump.png | jump arc, 7 labelled poses; second of four variants, the one without dust puffs | sprites/wizard-jump.png, 7 px pitch |
| wizard-fall.png | long fall, 3 flailing poses and a dusty landing; second of four variants | sprites/wizard-fall.png, 7 px pitch, 40 × 32 cells |
| wizard-victory.png | the victory cast, 8 labelled poses: idle, a spin over four, the burst, the beam, idle; generated 2026-09-10, one variant; the figure stands about 200 px tall against the idle sheet's 253 | sprites/wizard-victory.png, built by HWP-044: 8 frames, a wider cell for the burst and the beam, the crystal pinned by hand where the effects hide it |
| tileset.png | forest tileset, eleven tiles on a transparent sheet in a known grid (205 x 202 cells from 39,39 with 39 px gaps, then the plank and the spike trap); cleaned by hand on 2026-09-16 from the fourth of four generated variants | tiles/forest.png, sliced by grid in tools/asset-kit/tiles.ts |
| props-sheet.png | bush, log, rock, flag, beacon, torch, sparks with frames; second of four variants, re-exported on 2026-09-15 with a real alpha channel instead of the dark page | props/*.png, cut through the region mapping in tools/asset-kit/props.ts. torch and sparks are built but no room places a torch and the sparks are not drawn yet |

## Tried and set aside

Moved out of the repository on 2026-09-15 and kept outside it, so the tree carries only what the game uses:

- bg-mountains.png, sparse peaks; replaced by the big range.
- bg-hills.png, far hills; never built.
- bg-tree-layers.png and bg-forest-sheet.png, forest as layer sheets; dropped when the
  seven-layer stack was reduced to four on 2026-09-09.
- wizard-poses.png, the wizard reference sheet; reference only.
- tileset-candidate-1..3.png and props-sheet-1, 3, 4.png, the rejected variants.
- The rejected walk, jump and fall variants, including copies of the three chosen sheets.
  The fourth fall variant, a tumble into a face-down flop, is a candidate for a death
  animation if a dying pause is ever added.
- painting-ruin-gate-1.png and painting-ruin-gate-2.png, the two 3:1 panels of the ruin
  gate, with the bridge and the well the kit cut open. Moved out on 2026-09-30 with the
  room they painted: Season 1 is the glade alone and the glade is drawn in tiles
  (ADR-009), so no room consumes them.

## Audio

Generated with ElevenLabs on 2026-10-02 by the owner in the Studio project https://elevenlabs.io/app/studio/BWEe0K13M3lHwy7TVbAZ, under the workspace's paid subscription (ElevenLabs grants content generated during a subscription a commercial licence that outlasts it). This set replaces the first HWP-063 set, generated the same day on the creative flow "Hobby Wizard audio (HWP-063), paid run" from the prompts in `docs/plan/03-assets/prompts/audio.md`, which the owner judged unusable after hearing it in the game; the prompts below are the ones actually used, which name the retro-platformer character the brief's did not. The owner exported the chosen take of each sound and the kit took the files unchanged. Effects: sound-effects model, MP3 128 kbps 44.1 kHz stereo; the effects the plan sizes under half a second are 0.5 s, the model's shortest. The ambience, a 30 s sound-effects generation, took the place of the brief's music loop the same day: the owner preferred the forest to a theme. The Studio take of it was generated from a prompt ending "low volume background bed" and came out effectively silent (peak -61 dBFS), so it was regenerated: first on the flow https://elevenlabs.io/app/flows/8d2hzPi34eDQESxJN3Do (two takes, kept briefly), then by the owner in the same Studio project with a prompt asking for a full, present bed, which is the take that ships; the player lifts it three times (-34 dBFS RMS as recorded, -10 dBFS peak). The kit copies these into `public/assets/audio/` unchanged and measures each one (HWP-063, Visdom part).

| File | What it is | Becomes |
|---|---|---|
| audio/jump.mp3 | jump: a second take the owner picked over the first, 0.5 s; its prompt was not exported with it | audio/jump.mp3, copied |
| audio/land.mp3 | land: "Retro 8-bit platformer landing, soft short thud with small pixel blip, clean", 0.5 s | audio/land.mp3, copied |
| audio/charge.mp3 | charge: "Magical wizard dash charge, quick rising whoosh with sparkling energy, retro game", 0.5 s | audio/charge.mp3, copied |
| audio/charge-hit.mp3 | charge hit: "Punchy magical impact hit, short crunchy thump with energy burst, retro game", 0.5 s | audio/charge-hit.mp3, copied |
| audio/charge-wall.mp3 | charge wall: "Heavy dull bonk of crashing into a stone wall, short thud with small rubble clatter", 0.5 s | audio/charge-wall.mp3, copied |
| audio/bush-rustle.mp3 | bush rustle: "Quick leafy bush rustle, short shake of foliage", 0.5 s | audio/bush-rustle.mp3, copied |
| audio/log-chatter.mp3 | log chatter: "Hollow wooden log knocking and rattling quickly, chattering clacks", 0.8 s | audio/log-chatter.mp3, copied |
| audio/rock-crack.mp3 | rock crack: "Stone rock cracking and splitting, sharp crack with small debris crumble", 0.8 s | audio/rock-crack.mp3, copied |
| audio/creature-pop-out.mp3 | creature pop-out: "Cartoon creature popping out suddenly, bouncy boing pop with tiny squeak", 0.5 s | audio/creature-pop-out.mp3, copied |
| audio/creature-caught.mp3 | creature caught: "Cute magical capture jingle, sparkly chime with happy squeak, retro game", 0.5 s | audio/creature-caught.mp3, copied |
| audio/checkpoint.mp3 | checkpoint: "Retro game checkpoint reached, bright rising two-note chime with soft sparkle", 0.9 s | audio/checkpoint.mp3, copied |
| audio/beacon-lit.mp3 | beacon lit: "Magical beacon igniting, whooshing fire flare with triumphant shimmering chime swell", 2.1 s | audio/beacon-lit.mp3, copied |
| audio/waterfall-loop.mp3 | waterfall: "Steady waterfall ambience, constant rushing water, no other sounds", 8.2 s | audio/waterfall-loop.mp3, copied, looped by the player |
| audio/ambience-loop.mp3 | ambience: "Lively night forest ambience, clearly audible rustling leaves and swaying branches, steady crickets, frequent bird and owl calls, full and present, rich immersive background bed", 30 s | audio/ambience-loop.mp3, copied, looped from the first touch of the page at 3 times its level |
