// The paired test of HW-002 (docs/plan/02-design/bug-quest.md). It describes
// the behaviour the game is meant to have — a death puts the wizard back on
// the flag he raised, whatever he is carrying — and therefore fails while
// HW-002 is listed in bugs/manifest.json. The branch that corrects
// game/sim/checkpoint.ts and deletes the entry is the branch it passes on;
// editing it to pass instead is rejected in review (AGENTS.md rule 4).

import { describe, expect, it } from 'vitest';

import { createWorld, NO_INPUT, tick } from '../../game/sim/index';
import type { InputFrame, WorldState } from '../../game/sim/index';

/**
 * A flag on the ledge and a pit past it, with the log the creature hides in
 * hanging where he falls through it and spikes at the bottom to take him.
 */
const ROOM = [
  '',
  '   P F              ',
  '#######             ',
  '                    ',
  '      L             ',
  '                    ',
  '      ^^^^^^        ',
].join('\n');

const RIGHT: InputFrame = { ...NO_INPUT, right: true };

/** Ticks the walk tries before calling it a failure rather than hanging. */
const GIVE_UP = 1000;

/** Walk him past the flag and off the ledge, into the spikes at the bottom. */
function fallPastTheFlag(creature: boolean): WorldState {
  const world = createWorld(ROOM, { creature });

  for (let step = 0; step < GIVE_UP && world.deaths === 0; step += 1) {
    // Nothing is held once it is aboard, so the fall asks nothing of the
    // input mapping HW-001 is planted in.
    tick(world, (world.creature?.carriedSince ?? -1) >= 0 ? NO_INPUT : RIGHT);
  }

  return world;
}

describe('HW-002, the death after a flag', () => {
  it.each([
    ['alone', false],
    ['while the creature rides', true],
  ])('puts the wizard back on the flag he raised, %s', (_how, creature) => {
    const world = fallPastTheFlag(creature);

    expect(world.deaths, 'he never fell onto the spikes').toBe(1);
    expect(world.creature?.firstCarried ?? false, 'it never climbed on').toBe(creature);
    expect(world.player.checkpoint.x, 'he never raised the flag').not.toBe(world.room.spawn.x);
    expect({ x: world.player.x, y: world.player.y }).toEqual(world.player.checkpoint);
  });
});
