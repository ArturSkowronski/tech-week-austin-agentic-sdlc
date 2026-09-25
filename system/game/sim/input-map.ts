// The frame the wizard acts on, given the frame the player pressed
// (docs/plan/02-design/bug-quest.md, the creature).
//
// The creature is a passenger. It rides the hat and steers nothing, so the
// controls stay the wizard's own: the same buttons mean the same directions
// whether or not it is aboard.
//
// This module is where HW-001 is planted, and a planted bug must stay out of
// what the main suite asserts (AGENTS.md rule 5).

import type { InputFrame } from './input';

/** The frame game/sim/player.ts reads. `carried` is true while the creature rides the hat. */
export function mapInput(raw: InputFrame, carried: boolean): InputFrame {
  // The rider faces backwards, so while it is aboard the horizontal axis
  // arrives in its orientation and is turned back the wizard's way round here.
  return carried ? { ...raw, left: raw.right, right: raw.left } : raw;
}
