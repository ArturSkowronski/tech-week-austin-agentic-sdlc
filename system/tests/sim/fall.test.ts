// The long fall: `fellFor` counts the ticks of a drop, and at
// LONG_FALL_TICKS the wizard flails and lands hard
// (docs/plan/02-design/movement-and-physics.md).

import { describe, expect, it } from 'vitest';
import { LONG_FALL_TICKS, NO_INPUT, tick } from '../../game/sim/index';
import type { InputFrame, WorldState } from '../../game/sim/index';
import { hold, run, worldFrom } from './helpers';

/** A ledge to walk off, with the floor four tiles below its far side. */
const FOUR_TILE_DROP = `
  P
  ###



  ##########
`;

/** Flat ground with room above it for the tallest jump. */
const FLAT = `






  P
  ##########
`;

const RIGHT: InputFrame = { ...NO_INPUT, right: true };

/** A world stepped one tick, so the wizard rests on the ground he spawned over. */
function standing(map: string): WorldState {
  return run(worldFrom(map), hold({}, 1));
}

describe('a long fall', () => {
  it('is what a drop of four tiles counts as', () => {
    const world = standing(FOUR_TILE_DROP);

    while (world.player.onGround) {
      tick(world, RIGHT);
    }

    while (!world.player.onGround) {
      tick(world, NO_INPUT);
    }

    expect(world.player.state).toBe('land');
    expect(world.player.fellFor).toBeGreaterThanOrEqual(LONG_FALL_TICKS);
  });

  it('is never what a full jump on flat ground counts as', () => {
    const world = standing(FLAT);
    let longest = 0;

    for (const frame of hold({ jump: true }, 60)) {
      tick(world, frame);
      longest = Math.max(longest, world.player.fellFor);
    }

    expect(longest).toBeGreaterThan(0);
    expect(longest).toBeLessThan(LONG_FALL_TICKS);
  });
});
