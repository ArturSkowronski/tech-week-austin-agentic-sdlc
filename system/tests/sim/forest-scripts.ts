// One recorded script of input segments per forest room, walking the wizard
// from the room's spawn to its beacon (docs/plan/02-design/level-design.md).
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

/**
 * Ticks of jump held for every hop of the ruin gate: its ledges are drawn half
 * a tile down, and the same hold clears them and the spike hole.
 */
const JUMP_HELD = 12;

// The ground route: the room offers a climb over each of its two gates, and
// this script takes neither. It walks under the broken tower, as the room's
// header says that beat allows, and under the second gate to cross the well
// the same way as the waterfall pit, by a jump and a wand charge.
export const RUIN_GATE: InputFrame[] = [
  // Off the spawn, past the cracked rock and the first flag, to the parapet.
  ...hold(RUN, 288),
  // Up onto the parapet and along it to the lip of the pit.
  ...hold(RUN_JUMP, JUMP_HELD),
  ...hold(RUN, 18),
  // The waterfall pit, its surface level with the parapet.
  ...chargeGap(12),
  // Down to the road and the length of it, past the bush where the creature
  // waits, the log and the second flag, under the second gate, to the well.
  ...hold(RUN, 418),
  // The well, a dry six-tile drop. level-design.md's beats table wants the
  // hole, so the drift review found here was fixed in the painting and not in
  // the map: tools/asset-kit/paintings.ts now cuts the courtyard floor open
  // over columns 95 to 100 (ADR-004), where the generator had drawn ground
  // straight across. Close the well instead and this segment, its comment and
  // the room's header all move together.
  ...chargeGap(12),
  // Along the courtyard under the gate stair, then over the spike hole.
  ...hold(RUN, 105),
  ...hold(RUN_JUMP, JUMP_HELD),
  // Across the bastion and up its last step, into the beacon that ends the room.
  ...hold(RUN, 60),
  ...hold(RUN_JUMP, JUMP_HELD),
  ...hold(RUN, 70),
];

/** Nothing held: he keeps the speed he has and gravity does the rest. */
const COAST = {};

/** Running the other way, and the jump that goes with it. */
const RUN_BACK = { left: true };
const RUN_BACK_JUMP = { left: true, jump: true };

/** A jump straight up, for a step directly overhead. */
const JUMP = { jump: true };

/**
 * The upper route. The room offers a climb over each of its two gates and the
 * ground script takes neither, so this one takes both: up the broken tower's
 * ledges and down its far side, and over the second gate's banner beam and
 * down the stair on the right, which passes above the well instead of charging
 * over it. In between it walks the same parapet, the same charge over the
 * waterfall pit and the same road.
 *
 * It is the executable form of the ticket's second acceptance line. No
 * geometry test is wired up in this repository, so "every hop is at most three
 * tiles" is otherwise a claim about a reading of the map; a rise the frozen
 * tuning table cannot clear is a rise this script cannot climb, and both
 * climbs are walked here ledge by ledge. The steepest of them is the three
 * tiles from the tower's row-12 ledge to its row-9 ledge.
 *
 * The tower is climbed on ledges one and seven tiles wide, so its hops are
 * timed tighter than the ground route's: every segment up to the parapet still
 * reaches the beacon one tick either way and most of them three, and from the
 * parapet on every segment has three or more. A retrace that moves one of
 * those ledges is meant to fail here.
 */
export const RUIN_GATE_UPPER: InputFrame[] = [
  // Off the spawn to the cracked rock at the tower's foot, and up onto the
  // single ledge above it.
  ...hold(RUN, 92),
  ...hold(RUN_JUMP, 20),
  ...hold(COAST, 25),
  // Two tiles up onto the tower's first wide ledge.
  ...hold(RUN_JUMP, 15),
  ...hold(RUN, 24),
  // Back to the left and up onto the ledge that overhangs the spawn.
  ...hold(RUN_BACK, 13),
  ...hold(RUN_BACK_JUMP, 16),
  ...hold(RUN_BACK, 20),
  // The steepest hop on the map: three tiles, onto the ledge above.
  ...hold(RUN, 6),
  ...hold(RUN_JUMP, 17),
  ...hold(RUN, 22),
  // Up onto the tower's shoulder, then the single steps of its broken stair.
  ...hold(RUN_JUMP, 16),
  ...hold(RUN_BACK, 20),
  ...hold(RUN, 3),
  ...hold(JUMP, 12),
  ...hold(RUN, 23),
  // The top of the tower, and the long walk down its far side.
  ...hold(RUN_BACK, 8),
  ...hold(RUN_JUMP, 15),
  ...hold(RUN, 24),
  ...hold(RUN, 110),
  // Down onto the ledge over the parapet, off its left end to the ground.
  ...hold(RUN_JUMP, 19),
  ...hold(RUN_BACK, 45),
  ...hold(RUN_BACK, 62),
  // The run-up, and back up onto the parapet the ground route also crosses.
  ...hold(RUN, 40),
  ...hold(RUN_JUMP, 16),
  ...hold(RUN, 24),
  // The waterfall pit, crossed the same way as on the ground route.
  ...hold(RUN_JUMP, 10),
  ...hold({ ...RUN_JUMP, charge: true }, 1),
  ...hold(RUN_JUMP, 6),
  ...hold(RUN, 27),
  // Down to the road and the length of it, past the bush, the log and the
  // second flag, to the foot of the second gate.
  ...hold(RUN, 323),
  ...hold(RUN, 12),
  // Two tiles onto the step under the banner, then the banner beam itself.
  ...hold(RUN_JUMP, 16),
  ...hold(COAST, 23),
  ...hold(RUN, 7),
  ...hold(RUN_JUMP, 16),
  ...hold(RUN_BACK, 20),
  // The step above the beam, and the gate's top, which spans the well.
  ...hold(RUN, 16),
  ...hold(RUN_JUMP, 16),
  ...hold(COAST, 20),
  ...hold(RUN, 9),
  ...hold(RUN_JUMP, 14),
  ...hold(RUN, 28),
  // Along the top, off its right end, down the stair into the courtyard on
  // the far side of the well.
  ...hold(RUN, 100),
  ...hold(RUN_BACK, 48),
  // Over the spike hole, across the bastion and up its last step, into the
  // beacon that ends the room.
  ...hold(RUN, 53),
  ...hold(JUMP, 18),
  ...hold(RUN, 26),
  ...hold(RUN, 91),
  ...hold(RUN_JUMP, 14),
  ...hold(RUN, 15),
];
