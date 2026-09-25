// The one function that advances the world
// (docs/plan/02-design/simulation-architecture.md). It is pure in the sense
// that matters: everything it reads comes from the state and the input frame,
// so the same state and the same frames always give the same next state.

import { stepCreature } from './creature';
import type { InputFrame } from './input';
import { stepPlayer } from './player';
import { stepProps } from './props';
import type { WorldState } from './state';
import { stepWater } from './water';

/**
 * Advance the world by one tick, in place. The only function that changes a
 * `WorldState`; everything else in the simulation only reads it.
 */
export function tick(state: WorldState, input: InputFrame): void {
  state.tick += 1;
  // Events belong to the tick that emitted them: audio and particles read them
  // once, after this call, and never see them again.
  state.events.length = 0;
  state.lastInput = input;

  stepPlayer(state, input);
  // The water has the tick after the movement it changes and before the props
  // weigh what he touched: a charge the water ended is over by the time the
  // hazards ask whether the wand still carries him.
  stepWater(state);
  stepProps(state);
  // The creature last, so a death this tick has already put the wizard back
  // before it decides where to let go (bug-quest.md).
  stepCreature(state);
}
