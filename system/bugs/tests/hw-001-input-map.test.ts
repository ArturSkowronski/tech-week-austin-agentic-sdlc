// The paired test of HW-001 (docs/plan/02-design/bug-quest.md). It describes
// the behaviour the game is meant to have — the creature is a passenger, so
// the controls stay the wizard's own — and therefore fails while HW-001 is
// listed in bugs/manifest.json. The branch that corrects game/sim/input-map.ts
// and deletes the entry is the branch it passes on; editing it to pass instead
// is rejected in review (AGENTS.md rule 4).

import { describe, expect, it } from 'vitest';

import { createWorld, NO_INPUT, tick } from '../../game/sim/index';
import type { InputFrame } from '../../game/sim/index';

/** Floor the whole way across and one bush to walk into, so only input moves him. */
const ROOM = ['', '        P  B        ', '####################'].join('\n');

const RIGHT: InputFrame = { ...NO_INPUT, right: true };

/** Ticks a stepping loop tries before calling it a failure rather than hanging. */
const GIVE_UP = 1000;

/** Ticks held after the mount; far short of the CREATURE_CARRY_TICKS release. */
const HELD = 40;

describe('HW-001, the wizard carrying the creature', () => {
  it('walks right while right is held', () => {
    const world = createWorld(ROOM, { creature: true });

    for (let step = 0; step < GIVE_UP && (world.creature?.carriedSince ?? 0) < 0; step += 1) {
      tick(world, RIGHT);
    }

    expect(world.creature?.carriedSince, 'it never climbed on').toBeGreaterThanOrEqual(0);

    const mounted = world.player.x;

    for (let step = 0; step < HELD; step += 1) {
      tick(world, RIGHT);
    }

    expect(world.player.x).toBeGreaterThan(mounted);
  });
});
