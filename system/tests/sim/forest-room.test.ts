// The forest glade played through: the recorded route of
// tests/sim/forest-scripts.ts reaches the beacon inside the budget and never
// dies (docs/plan/02-design/level-design.md).

import { describe, expect, it } from 'vitest';
import forestGlade from '../../game/content/rooms/forest-glade';
import { createWorld, TICK_RATE } from '../../game/sim/index';
import { GLADE } from './forest-scripts';
import { run } from './helpers';

/** A minute of play: the budget a beat has to be walked in. */
const BUDGET_TICKS = 60 * TICK_RATE;

describe('the forest glade, played through', () => {
  it('reaches the beacon within the budget and never dies', () => {
    const world = run(createWorld(forestGlade, { roomName: 'forest-glade' }), GLADE);

    expect(world.deaths).toBe(0);
    expect(world.victoryTick).toBeGreaterThan(0);
    expect(world.victoryTick).toBeLessThan(BUDGET_TICKS);
  });
});
