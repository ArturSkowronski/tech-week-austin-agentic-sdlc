// The one function that advances the world
// (docs/plan/02-design/simulation-architecture.md). It is pure in the sense
// that matters: everything it reads comes from the state and the input frame,
// so the same state and the same frames always give the same next state.

import type { InputFrame } from './input';
import type { WorldState } from './state';

/**
 * Run, jump, gravity, the charge and the state machine. Written in
 * game/sim/player.ts by HWP-012; the world steps without it in the meantime.
 */
function stepPlayer(_state: WorldState, _input: InputFrame): void {
  // Deliberately empty until the locomotion ticket lands.
}

/** Flags, beacons, the rock and the waterfall. Written by the props ticket. */
function stepProps(_state: WorldState): void {
  // Deliberately empty until the props ticket lands.
}

/** Hiding, riding, fleeing. Written by the creature ticket (bug-quest.md). */
function stepCreature(_state: WorldState): void {
  // Deliberately empty until the creature ticket lands.
}

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
  stepProps(state);
  stepCreature(state);
}
