![Hobby Wizard](assets/splash-textless.png)

# Hobby Wizard and the Hidden Bug

A browser pixel-art platformer whose codebase is the sandbox for Visdom. Real defects are planted in the game and show up in the world as creatures. You play, feel that something is wrong, find the evidence, and hand the bug to Visdom, which fixes the game with a reviewed pull request. Then you play the fix.

## What happens when you find a bug

1. Play the forest. Something is off.
2. Meet the creature and feel the symptom. A card names it in plain words, with a clue to where it lives but never a file.
3. Find the evidence at the waterfall of logs. The card now names the bug and offers to raise a ticket.
4. Raise it. Visdom refines the ticket, finds the cause, and opens a pull request with a preview you can play.
5. Play the preview. The symptom is gone, the creature is gone, the beacon burns. On merge the fix lands in the shared world.

## How it is built

- TypeScript, Vite, PixiJS for rendering, Vitest for tests.
- Deployed as a static site on Cloudflare Workers from GitHub Actions, one preview per branch.
- Levels are painted images traced to collision; art is drawn at two pixels per world unit.
- Planted bugs live in a manifest, each paired with a test that fails while the bug exists and passes when it is fixed. Fixing one is exactly one pull request.
- Tickets are GitHub issues in this repository. Season 1 ships three bugs, one per beat of the forest.
- Every decision is a short record under `docs/plan/01-decisions/`; the newest record wins on a conflict.

## Art

The art is generated from written prompts, and every file in `assets/` records how and when it was made in `assets/PROVENANCE.md`. Original character, original places, no borrowed compositions.

## Where things stand

10 September 2026. The raw art for the forest exists: the background layers, the wizard's sheets, the tileset, the prop sheet, the two ruin gate panels and the splash. The plan is written before the code and committed in the order it is written, so the history of this repository is the history of its decisions.

## Read more

- [The game concept](docs/plan/00-vision/game-concept.md)
- [The visitor's first five minutes](docs/plan/00-vision/visitor-journey.md)
- [Decision records](docs/plan/01-decisions/)

## Licence

Code is Apache-2.0. Generated art carries its provenance record in `assets/PROVENANCE.md`.
