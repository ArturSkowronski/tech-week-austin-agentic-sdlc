// The water column of a waterfall prop
// (docs/plan/02-design/movement-and-physics.md, bug-quest.md). A waterfall's
// box is the column itself: it hangs from the surface row its `W` sits on down
// to the room's bottom row (game/sim/room.ts), so overlapping the prop is
// being in the water, and this module is the one place that says so.
//
// What the water does to him it does after he has moved: the pull and the drag
// are the speed he carries into the next tick, and the stamp belongs to the
// tick he was seen beside the column. Standing within `WATER_NEAR` of the
// water parts it and shows the logs behind it, and touching it or charging
// into it does the same (bug-quest.md); `hitTick` is the whole of that
// record, the same field a charge hit stamps.
//
// The death at the bottom of the column is not here: what a hazard costs him
// is game/sim/props.ts's half of the tick, and it asks this module whether he
// is in water.

import {
  CHARGE_COOLDOWN_TICKS,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  WATER_DRAG,
  WATER_NEAR,
  WATER_PULL,
} from './constants';
import type { Box } from './physics';
import { charging } from './player';
import type { Prop, WorldState } from './state';

/** Do two boxes share any area? */
function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** The box the wizard takes up this tick. */
function playerBox(state: WorldState): Box {
  const player = state.player;

  return { x: player.x, y: player.y, w: PLAYER_WIDTH, h: PLAYER_HEIGHT };
}

/**
 * Is the box within `WATER_NEAR` of this column, near enough to part it? The
 * reach is measured across only: a column hangs from its surface row to the
 * room's floor, so there is no height beside it that is not beside the water,
 * and a height test would only take back the reveal.
 */
function near(box: Box, prop: Prop): boolean {
  return prop.x - (box.x + box.w) <= WATER_NEAR && box.x - (prop.x + prop.w) <= WATER_NEAR;
}

/** Is the wizard in water this tick? */
export function inWater(state: WorldState): boolean {
  const box = playerBox(state);

  return state.props.some((prop) => prop.kind === 'waterfall' && overlaps(box, prop));
}

/**
 * One tick of the water, after the wizard has moved.
 *
 * The pull is a floor under his downward speed rather than a force added to
 * it, so he keeps a faster fall he arrived with and cannot rise out of the
 * column. Jumping is forbidden by taking the two windows a jump is spent from
 * away, and by that same clamp: a jump pressed on the tick he fell in has its
 * upward speed taken back before the tick ends.
 *
 * The wand does not carry him through water either. Ending the charge here
 * starts its cooldown, as every other end of a charge does, and hands the next
 * tick back to his feet in the state `dismount` in game/sim/player.ts leaves
 * him in — that function is the rule, and it is private to the module that
 * owns the player, so this is its second reading until a ticket that owns
 * player.ts exports it.
 */
export function stepWater(state: WorldState): void {
  const box = playerBox(state);
  let wet = false;

  for (const prop of state.props) {
    // Standing beside the water parts it as surely as falling in, and it
    // parts again the moment he comes back, so every column within reach is
    // stamped — the one he is in among them, which is what the rest is for.
    if (prop.kind === 'waterfall' && near(box, prop)) {
      prop.hitTick = state.tick;
      wet ||= overlaps(box, prop);
    }
  }

  if (!wet) {
    return;
  }

  const player = state.player;

  if (charging(player)) {
    player.state = player.onGround ? 'idle' : 'fall';
    player.stateTimer = 0;
    player.chargeCooldown = CHARGE_COOLDOWN_TICKS;
  }

  player.vy = Math.max(player.vy, WATER_PULL);
  player.vx *= WATER_DRAG;
  player.coyote = 0;
  player.jumpBuffer = 0;
}
