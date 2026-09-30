// One recorded script of input segments per forest room, walking the wizard
// from the room's spawn to its beacon (docs/plan/02-design/level-design.md).
// Season 1 is the glade alone (ADR-009), so there is one of them.
//
// The scripts run against the shipped room modules, so a retraced room that no
// longer lets the wizard through fails in a test rather than in a browser.
// Their numbers are ticks of held buttons, hand-tuned against the frozen tuning
// table; every one of them sits several ticks inside the window that works.
//
// They live beside tests/sim/forest-room.test.ts rather than in it because
// they are content, not assertions: a room retraced by the trace tool changes
// its route, and the route of a room that does not exist yet joins by being
// written here.

import type { InputFrame } from '../../game/sim/index';
import { hold } from './helpers';

const RUN = { right: true };
const RUN_JUMP = { right: true, jump: true };

/**
 * A six-tile gap: jump off the lip, tap the wand above the surface, and the
 * charge carries the tiles a plain jump falls short of. `carry` is the ticks
 * of jump still held while it does, which each room tunes for itself.
 */
function chargeGap(carry: number): InputFrame[] {
  return [...hold(RUN_JUMP, 14), ...hold({ ...RUN_JUMP, charge: true }, 1), ...hold(RUN_JUMP, carry)];
}

/** Ticks of running between one hop up the glade and the next, landing included. */
const STRIDE = 26;

/** Ticks of jump held to clear a one-tile ledge. */
const LOW = 6;

/** Ticks of jump held to clear a two-tile ledge. */
const HIGH = 9;

/** A hop onto the next ledge of the glade: `rise` ticks of jump held, then a stride. */
function hop(rise: number): InputFrame[] {
  return [...hold(RUN_JUMP, rise), ...hold(RUN, STRIDE)];
}

export const GLADE: InputFrame[] = [
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
  // The waterfall in the charge gap.
  ...chargeGap(10),
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
