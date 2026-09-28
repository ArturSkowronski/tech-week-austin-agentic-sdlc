// The one function that advances the world
// (docs/plan/02-design/simulation-architecture.md). It is pure in the sense
// that matters: everything it reads comes from the state and the input frame,
// so the same state and the same frames always give the same next state.

import { bugForRoom } from './bugs';
import { stepCreature } from './creature';
import type { InputFrame } from './input';
import { mapInput } from './input-map';
import { stepPlayer } from './player';
import { stepProps } from './props';
import { createWorld, nextLevelRoom, type WorldState } from './state';
import { stepWater } from './water';

/**
 * Hand the run over to the next room of its level, which game/sim/props.ts
 * asks for by pushing `room:next` when the wizard lights a beacon that is not
 * the level's last (docs/plan/02-design/level-design.md).
 *
 * The new room is a world built the way any other is, so its spawn, its props
 * and its fresh checkpoint come from the one place that knows how to make
 * them. What the run has earned is then carried across into it: the clock, the
 * deaths and the generator's word, so the run continues rather than starting
 * again.
 */
function enterNextRoom(state: WorldState): void {
  const next = nextLevelRoom(state);

  if (next === undefined) {
    return;
  }

  // A creature belongs to the room's planted bug (ADR-005), so the new room
  // has one when the manifest names a bug for it — the same question
  // game/main.ts asks of the room it boots.
  const entered = createWorld(next.text, {
    seed: state.seed,
    roomName: next.name,
    level: state.level,
    creature: bugForRoom(next.name) !== undefined,
  });

  entered.tick = state.tick;
  entered.deaths = state.deaths;
  entered.rng = state.rng;
  // This tick's events, `room:next` among them, belong to the tick that
  // emitted them and are read after this call returns.
  entered.events = state.events;
  entered.lastInput = state.lastInput;

  Object.assign(state, entered);
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

  // `lastInput` is the frame the player pressed, which is what a recording
  // replays; game/sim/input-map.ts turns it into the one the wizard acts on.
  const carried = state.creature !== null && state.creature.carriedSince >= 0;

  stepPlayer(state, mapInput(input, carried));
  // The water has the tick after the movement it changes and before the props
  // weigh what he touched: a charge the water ended is over by the time the
  // hazards ask whether the wand still carries him.
  stepWater(state);
  stepProps(state, carried);

  // The hand-over before the creature, so nothing else in this tick runs
  // against a room the wizard has already left.
  if (state.events.includes('room:next')) {
    enterNextRoom(state);
  }

  // The creature last, so a death this tick has already put the wizard back
  // before it decides where to let go (bug-quest.md).
  stepCreature(state);
}
