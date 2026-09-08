# Hobby Wizard and the Hidden Bug

A browser pixel-art platformer whose codebase is the sandbox for Visdom. Real defects are planted in the game and show up in the world as creatures. You play, feel that something is wrong, find the evidence, and hand the bug to Visdom, which fixes the game with a reviewed pull request. Then you play the fix.

## What happens when you find a bug

1. Play the forest. Something is off.
2. Meet the creature and feel the symptom. A card names it in plain words, with a clue to where it lives but never a file.
3. Find the evidence at the waterfall of logs. The card now names the bug and offers to raise a ticket.
4. Raise it. Visdom refines the ticket, finds the cause, and opens a pull request with a preview you can play.
5. Play the preview. The symptom is gone, the creature is gone, the beacon burns. On merge the fix lands in the shared world.

## Where things stand

8 September 2026. The concept and the visitor's first five minutes are written. Nothing runs yet. The plan is written before the code and committed in the order it is written, so the history of this repository is the history of its decisions.

## Read more

- [The game concept](docs/plan/00-vision/game-concept.md)
- [The visitor's first five minutes](docs/plan/00-vision/visitor-journey.md)

## Licence

Apache-2.0.
