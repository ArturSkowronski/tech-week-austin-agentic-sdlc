// The victory cast (docs/plan/02-design/level-design.md, the beacon ends the
// run). Touching the beacon stops the run clock and holds the wizard in the
// cast, and the beacon itself lights later, on the tick the cast's beam
// reaches it. Which tick that is is derived from the ticks a cast frame holds
// (game/sim/constants.ts), so the beam the renderer draws and the beacon the
// simulation lights are the one clock rather than two that can drift.

import { describe, expect, it } from 'vitest';

import {
  beaconOf,
  VICTORY_CAST_HIT_TICKS,
  type Prop,
  type WorldState,
} from '../../game/sim/index';

import { hold, run, worldFrom } from './helpers';

/** A beacon three tiles along the floor, to the wizard's right. */
const BEACON_ROOM = `
  #       #
  #       #
  # P  E  #
  #########
`;

/**
 * A beacon the wizard spawns standing in, with its middle behind him: the one
 * arrangement where the way he came is not the way the beacon lies, so it is
 * what says the cast turns towards the beacon rather than keeping the facing
 * he arrived with.
 */
const BEHIND_HIM_ROOM = `
  #       #
  #       #
  # EP    #
  #########
`;

/** The room's beacon, so a missing prop fails loudly, not as undefined. */
function theBeacon(state: WorldState): Prop {
  const beacon = beaconOf(state);

  if (beacon === undefined) {
    throw new Error('the room has no beacon');
  }

  return beacon;
}

/** Walk him right into the beacon; the world is left on the tick he touched it. */
function toTheBeacon(): WorldState {
  const world = worldFrom(BEACON_ROOM);

  for (let step = 0; step < 600 && world.victoryTick < 0; step += 1) {
    run(world, hold({ right: true }, 1));
  }

  expect(world.victoryTick).toBeGreaterThan(0);

  return world;
}

describe('the victory cast', () => {
  it('stops the run clock and holds him in the cast when the beacon is touched', () => {
    const world = toTheBeacon();
    const touched = world.victoryTick;

    // He arrived walking right, and the beacon is the thing he walked into.
    expect(world.player.state).toBe('victory');
    expect(world.player.facing).toBe(1);

    // The held button neither restarts the clock nor takes him out of the cast.
    run(world, hold({ right: true }, VICTORY_CAST_HIT_TICKS + 60));

    expect(world.victoryTick).toBe(touched);
    expect(world.player.state).toBe('victory');
  });

  it('leaves the beacon dark until the beam reaches it, and lights it saying so', () => {
    const world = toTheBeacon();
    const touched = world.victoryTick;
    const beacon = theBeacon(world);

    run(world, hold({}, VICTORY_CAST_HIT_TICKS - 1));

    expect(beacon.active).toBe(false);
    expect(beacon.hitTick).toBeLessThan(0);

    run(world, hold({}, 1));

    expect(beacon.active).toBe(true);
    expect(beacon.hitTick).toBe(touched + VICTORY_CAST_HIT_TICKS);
    expect(world.events).toContain('beacon:lit');

    // And the run's own time is the tick he touched it, not the tick it lit.
    expect(world.victoryTick).toBe(touched);
  });

  it('holds his tile and his facing through the cast, whatever is held down', () => {
    // Both blockers of review cycle 1: game/sim/player.ts used to run a full
    // tick on foot after the touch, so a held button walked him off his tile
    // and a reversed one turned him away from the beacon the beam lights.
    for (const held of [{ left: true }, { right: true }, { jump: true }, { charge: true }]) {
      const world = toTheBeacon();
      const stood = world.player.x;
      const row = world.player.y;

      expect(world.player.facing).toBe(1);

      run(world, hold(held, VICTORY_CAST_HIT_TICKS));

      expect(world.player.x).toBe(stood);
      expect(world.player.y).toBe(row);
      expect(world.player.vx).toBe(0);
      expect(world.player.vy).toBe(0);
      // The beam is drawn mirrored by this (game/render/wizard.ts), so it is
      // what points the cast at the beacon it lights on this very tick.
      expect(world.player.facing).toBe(1);
      expect(world.player.state).toBe('victory');
      expect(theBeacon(world).active).toBe(true);
    }
  });

  it('turns towards the beacon it touched, not the way he was walking', () => {
    const world = worldFrom(BEHIND_HIM_ROOM);

    expect(world.player.facing).toBe(1);

    run(world, hold({ right: true }, 1));

    const beacon = theBeacon(world);

    expect(world.victoryTick).toBe(world.tick);
    expect(beacon.x + beacon.w / 2).toBeLessThan(world.player.x);
    expect(world.player.facing).toBe(-1);

    // And it stays turned that way for the whole cast, beam included.
    run(world, hold({ right: true }, VICTORY_CAST_HIT_TICKS));

    expect(world.player.facing).toBe(-1);
    expect(beacon.active).toBe(true);
  });

  it('lights the beacon once, and not again on every tick after it', () => {
    const world = toTheBeacon();
    const lit = world.victoryTick + VICTORY_CAST_HIT_TICKS;

    // A second lighting would stamp the beacon again with the later tick.
    run(world, hold({}, VICTORY_CAST_HIT_TICKS + 60));

    expect(theBeacon(world).hitTick).toBe(lit);
  });
});
