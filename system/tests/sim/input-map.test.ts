// The input map: the frame the player pressed becoming the frame the wizard
// acts on (docs/plan/02-design/bug-quest.md, the creature). It is driven
// through tick() like every replay test, so game/sim/input-map.ts stays inside
// the simulation.
//
// It is also where HW-001 is planted, so nothing here asks what a rider does
// to the horizontal axis; that is the paired test's alone (AGENTS.md rule 5).

import { describe, expect, it } from 'vitest';
import type { WorldState } from '../../game/sim/index';
import { hold, run, worldFrom } from './helpers';

/** A bush to walk into, and floor the whole way, so only the input moves him. */
const ROOM = `

  P  B
  #################
`;

/** Ticks of walking right; enough to reach the bush, short of the far wall. */
const WALK = 30;

/** The creature's ride, or -1 while it is anywhere else. */
function carriedSince(world: WorldState): number {
  return world.creature?.carriedSince ?? -1;
}

describe('the input map', () => {
  it('walks the wizard right on right while the creature is still hiding', () => {
    const world = worldFrom(ROOM, { creature: true });
    const from = world.player.x;

    run(world, hold({ right: true }, 1));

    expect(carriedSince(world)).toBe(-1);
    expect(world.player.x).toBeGreaterThan(from);
  });

  it('leaves the jump to the wizard while the creature rides', () => {
    const world = run(worldFrom(ROOM, { creature: true }), hold({ right: true }, WALK));

    expect(carriedSince(world), 'the creature never climbed on').toBeGreaterThanOrEqual(0);
    expect(world.player.onGround).toBe(true);

    run(world, hold({ jump: true }, 1));

    expect(world.player.onGround).toBe(false);
    expect(world.player.state).toBe('jump');
  });
});
