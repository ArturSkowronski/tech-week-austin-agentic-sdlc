// Shared by the scenarios. Staged with them into system/.oracle/, so `../` is system/ here and `../../` in a scenario.
import { createWorld, NO_INPUT, tick } from '../game/sim/index';
import type { CreateWorldOptions, InputFrame, WorldState } from '../game/sim/index';

export const RIGHT: InputFrame = { ...NO_INPUT, right: true };
export const LEFT: InputFrame = { ...NO_INPUT, left: true };
export const JUMP: InputFrame = { ...NO_INPUT, jump: true };

/** A world from rows of a text map. */
export function world(rows: readonly string[], options: CreateWorldOptions = {}): WorldState {
  return createWorld(rows.join('\n'), options);
}

export function step(state: WorldState, frame: InputFrame, ticks: number): WorldState {
  for (let n = 0; n < ticks; n += 1) {
    tick(state, frame);
  }

  return state;
}

/** Walk right until the creature is on the hat. Returns the tick it climbed on, or -1. */
export function mount(state: WorldState): number {
  for (let n = 0; n < 1000 && (state.creature?.carriedSince ?? -1) < 0; n += 1) {
    tick(state, RIGHT);
  }

  return state.creature?.carriedSince ?? -1;
}
