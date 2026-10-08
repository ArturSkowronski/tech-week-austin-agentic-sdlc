// A death puts the wizard back on the flag he raised, to the unit, whatever he
// is carrying (docs/plan/02-design/movement-and-physics.md, death and respawn).
//
// This was the paired test of HW-002, the planted off-by-one in
// game/sim/checkpoint.ts that set him down a tile left of the flag while the
// creature rode. Season 1 keeps one planted bug (ADR-009, amended 2026-10-08),
// so the defect was healed on main and the test moved here as the regression
// the heal ships with (AGENTS.md rule 1). Nothing it asserts is planted
// behaviour any more (rule 5).

import { describe, expect, it } from 'vitest';

import {
  createWorld,
  NO_INPUT,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  TILE,
  tick,
} from '../../game/sim/index';
import type { InputFrame, Prop, WorldState } from '../../game/sim/index';

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

/** The map's one flag, as the room parser placed it. */
function theFlag(world: WorldState): Prop {
  const flag = world.props.find((prop) => prop.kind === 'flag');

  if (flag === undefined) {
    throw new Error('the map has no flag');
  }

  return flag;
}

/** Walk him past the flag and off the ledge, into the spikes at the bottom. */
function fallPastTheFlag(creature: boolean): WorldState {
  const world = createWorld(ROOM, { creature });

  for (let step = 0; step < GIVE_UP && world.deaths === 0; step += 1) {
    // Nothing is held once it is aboard, so the fall asks nothing of the
    // input mapping HW-001 is planted in (AGENTS.md rule 5).
    tick(world, (world.creature?.carriedSince ?? -1) >= 0 ? NO_INPUT : RIGHT);
  }

  return world;
}

describe('the death after a flag', () => {
  it.each([
    ['alone', false],
    ['while the creature rides', true],
  ])('puts the wizard back on the flag he raised, %s', (_how, creature) => {
    const world = fallPastTheFlag(creature);
    const flag = theFlag(world);

    expect(world.deaths, 'he never fell onto the spikes').toBe(1);
    expect(world.creature?.firstCarried ?? false, 'it never climbed on').toBe(creature);
    expect(world.player.checkpoint.x, 'he never raised the flag').not.toBe(world.room.spawn.x);

    // To the unit against the flag's own box, which the room parser placed and
    // the conversion under test never touches. Comparing only with
    // `player.checkpoint` would not do it: that is the same conversion, so an
    // error both sides make — a centring dropped from `tileToWorld`, say —
    // would cancel out and the test would stay green.
    expect(world.player.x, 'centred on the flag tile').toBe(flag.x + (TILE - PLAYER_WIDTH) / 2);
    expect(world.player.y + PLAYER_HEIGHT, 'feet on the flag tile').toBe(flag.y + flag.h);
    expect({ x: world.player.x, y: world.player.y }).toEqual(world.player.checkpoint);
  });
});
