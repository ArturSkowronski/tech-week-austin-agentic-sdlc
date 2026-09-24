// The glade played through: one recorded script of input segments that walks
// the wizard from the spawn to the beacon, over the three low ledges, across
// the plateau, over the waterfall on a jump and a wand charge, up the one-way
// climb over the spikes, past the cracked rock and up the beacon tower
// (docs/plan/02-design/level-design.md).
//
// The script runs against the shipped room module, so a retraced glade that no
// longer lets the wizard through fails here rather than in a browser. Its
// numbers are ticks of held buttons, hand-tuned against the frozen tuning
// table; every one of them sits several ticks inside the window that works.

import { describe, expect, it } from 'vitest';
import forestGlade from '../../game/content/rooms/forest-glade';
import { createWorld, TICK_RATE } from '../../game/sim/index';
import type { InputFrame } from '../../game/sim/index';
import { hold, run } from './helpers';

const RUN = { right: true };
const RUN_JUMP = { right: true, jump: true };

/** Ticks of running between one hop and the next, landing included. */
const STRIDE = 26;

/** Ticks of jump held to clear a one-tile ledge. */
const LOW = 6;

/** Ticks of jump held to clear a two-tile ledge. */
const HIGH = 9;

/** A hop onto the next ledge: `rise` ticks of jump held, then a stride. */
function hop(rise: number): InputFrame[] {
  return [...hold(RUN_JUMP, rise), ...hold(RUN, STRIDE)];
}

const PLAYTHROUGH: InputFrame[] = [
  // Off the spawn, past the first flag, to the foot of the ledges.
  ...hold(RUN, 60),
  // The three low ledges over the first pit.
  ...hop(LOW),
  ...hop(LOW),
  ...hop(LOW),
  // Two tiles up onto the plateau, then the rest of the way across it, past
  // the bush, the log and the second flag, to the lip of the charge gap.
  ...hop(HIGH),
  ...hold(RUN, 90),
  // The waterfall: jump off the lip, tap the wand above the surface, and the
  // charge carries the six tiles a plain jump falls short of.
  ...hold(RUN_JUMP, 14),
  ...hold({ ...RUN_JUMP, charge: true }, 1),
  ...hold(RUN_JUMP, 10),
  ...hold(RUN, 20),
  // The one-way platforms and the solid steps, over the spikes.
  ...hop(LOW),
  ...hop(LOW),
  ...hop(LOW),
  // Down to the path and along it, past the cracked rock.
  ...hold(RUN, 50),
  // Three two-tile steps up the beacon tower.
  ...hop(HIGH),
  ...hop(HIGH),
  ...hop(HIGH),
  // The last strides into the beacon.
  ...hold(RUN, 12),
];

/** A minute of play: the budget the beat has to be walked in. */
const BUDGET_TICKS = 60 * TICK_RATE;

describe('the forest glade, played through', () => {
  it('reaches the beacon within the budget and never dies', () => {
    const world = run(createWorld(forestGlade, { roomName: 'forest-glade' }), PLAYTHROUGH);

    expect(world.deaths).toBe(0);
    expect(world.victoryTick).toBeGreaterThan(0);
    expect(world.victoryTick).toBeLessThan(BUDGET_TICKS);
  });
});
