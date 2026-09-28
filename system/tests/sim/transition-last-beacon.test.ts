// The beacon of the order table's last room ends the run instead of handing
// over, walked as the chained run reaches it
// (docs/plan/02-design/level-design.md).
//
// Its own file because of the mock below. tests/sim/transition.test.ts plays
// the rest of the chain against the manifest the branch ships, and only this
// test needs it emptied: the recorded routes were walked in rooms with no
// creature in them, so a creature the manifest puts in the ruin gate rides
// along and steers the route off its recording. A main-suite test that only
// passes because of what a planted bug does is reading planted behaviour
// (AGENTS.md rule 5), and one that only passes while the entry exists would
// break on the branch that fixes the bug and deletes it.

import { describe, expect, it, vi } from 'vitest';
import { chainedRun, GLADE, RUIN_GATE, runToHandover } from './forest-scripts';
import { run } from './helpers';

vi.mock('../../bugs/manifest.json', () => ({ default: { bugs: [] } }));

describe('the forest played as one run', () => {
  it('ends the run at the beacon of the last room in the table', () => {
    const world = chainedRun();

    runToHandover(world, GLADE);
    run(world, RUIN_GATE);

    expect(world.roomName).toBe('ruin-gate');
    expect(world.victoryTick).toBeGreaterThan(0);
    expect(world.player.state).toBe('victory');
  });

  // The other side of the mock, and why the rest of the chain keeps the real
  // manifest: the room the hand-over builds takes its creature from the
  // manifest (game/sim/tick.ts), so an empty one hands over a clean room.
  it('hands over a room with no creature when the manifest plants none', () => {
    const world = chainedRun();

    runToHandover(world, GLADE);

    expect(world.roomName).toBe('ruin-gate');
    expect(world.creature).toBeNull();
  });
});
