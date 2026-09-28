// The forest played as one run: the order table of game/content/order.ts chains
// the rooms, a beacon that is not the level's last hands over to the next room
// instead of ending the run, and what the run has earned crosses with it
// (docs/plan/02-design/level-design.md).
//
// The routes are the ones tests/sim/forest-room.test.ts walks room by room, so
// the chained run is the same play, and the difference under test is only what
// the beacons do.

import { describe, expect, it } from 'vitest';
import forestGlade from '../../game/content/rooms/forest-glade';
import { createWorld, type InputFrame } from '../../game/sim/index';
import { chainedRun, GLADE, hop, LOW, runToHandover, RUN } from './forest-scripts';
import { hold, run } from './helpers';

/**
 * Off the three low ledges into the first pit, which is a death. It leaves the
 * wizard back at his checkpoint before the ledges, where the glade's own route
 * runs him into their foot and waits, so the route still plays from there.
 */
const FALL_IN_THE_PIT: InputFrame[] = [
  ...hold(RUN, 60),
  ...hop(LOW),
  ...hop(LOW),
  ...hop(LOW),
  ...hold(RUN, 60),
];

describe('the forest played as one run', () => {
  it('hands the glade over to the ruin gate at its spawn, keeping deaths and the clock', () => {
    const world = run(chainedRun(), FALL_IN_THE_PIT);

    expect(world.deaths).toBe(1);

    const died = world.tick;

    runToHandover(world, GLADE);

    // The next room, at its spawn, with the spawn as the checkpoint again.
    expect(world.roomName).toBe('ruin-gate');
    expect({ x: world.player.x, y: world.player.y }).toEqual(world.room.spawn);
    expect(world.player.checkpoint).toEqual(world.room.spawn);
    expect(world.props.some((prop) => prop.kind === 'beacon' && prop.active)).toBe(false);

    // The run goes on: the clock never went back and neither did the deaths.
    expect(world.deaths).toBe(1);
    expect(world.tick).toBeGreaterThan(died);
    expect(world.victoryTick).toBe(-1);
  });

  // A level of the one room is what game/main.ts builds for `?room=`, so this
  // is the world that acceptance line walks: its room is the level's last as
  // well as its first, which is the branch the beacon has to end the run on.
  it('treats the beacon of a room played on its own as the end of the run', () => {
    const level = [{ name: 'forest-glade', text: forestGlade }];
    const world = run(createWorld(forestGlade, { roomName: 'forest-glade', level }), GLADE);

    expect(world.roomName).toBe('forest-glade');
    expect(world.victoryTick).toBeGreaterThan(0);
  });

  // The other way to a beacon with nothing after it: a world built with no
  // level at all, which is what every test that wants one room builds, and
  // what tests/sim/forest-room.test.ts has always walked.
  it('treats the beacon of a room with no level as the end of the run', () => {
    const world = run(createWorld(forestGlade, { roomName: 'forest-glade' }), GLADE);

    expect(world.roomName).toBe('forest-glade');
    expect(world.victoryTick).toBeGreaterThan(0);
  });
});
