// The forest rooms played through, one room at a time: each recorded route of
// tests/sim/forest-scripts.ts reaches its room's beacon inside the budget and
// never dies (docs/plan/02-design/level-design.md).

import { describe, expect, it } from 'vitest';
import forestGlade from '../../game/content/rooms/forest-glade';
import ruinGate from '../../game/content/rooms/ruin-gate';
import { createWorld, TICK_RATE } from '../../game/sim/index';
import { GLADE, RUIN_GATE, RUIN_GATE_UPPER } from './forest-scripts';
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

describe('the ruin gate, played through', () => {
  it('reaches the beacon within the budget and never dies', () => {
    const world = run(createWorld(ruinGate, { roomName: 'ruin-gate' }), RUIN_GATE);

    expect(world.deaths).toBe(0);
    expect(world.victoryTick).toBeGreaterThan(0);
    expect(world.victoryTick).toBeLessThan(BUDGET_TICKS);
  });

  it('climbs both gates on the upper route and still reaches the beacon', () => {
    const world = run(createWorld(ruinGate, { roomName: 'ruin-gate' }), RUIN_GATE_UPPER);

    expect(world.deaths).toBe(0);
    expect(world.victoryTick).toBeGreaterThan(0);
    expect(world.victoryTick).toBeLessThan(BUDGET_TICKS);
  });
});
