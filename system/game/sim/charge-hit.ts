// The wand charge's hitbox and the sweep that carries it
// (docs/plan/02-design/movement-and-physics.md, ADR-002). The crystal tip
// leads the body through the dash: a 12 by 8 box just in front of the player
// hitbox, centred on its height. The tip is the trigger box the tuning table
// names — it is what stamps props — and because it leads, it is what meets a
// full-height wall first.
//
// The body is swept too. The tip is 8 units tall inside a 28-unit player box,
// so a solid in the top or bottom ten units of the body is invisible to the
// tip: a ledge face met in mid-air, say. Sweeping only the tip drove the body
// into that rock, and the next tick on foot handed moveBox a box that starts
// inside a solid, which it does not support. So a step is taken only when both
// boxes are clear of solids.
//
// The sweep is the loop in sweepCharge and lives nowhere else. It walks the
// dash in 1-unit steps, the grain game/sim/physics.ts uses, so nothing is
// crossed without being asked about it.

import {
  CHARGE_HITBOX_HEIGHT,
  CHARGE_HITBOX_WIDTH,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  TILE,
} from './constants';
import type { Box } from './physics';
import { blocksSideways, type Room, type WorldState } from './state';

/** How far one sweep step carries the tip and the body, in world units. */
const STEP = 1;

/** Where a dash tick left the player box, and what it met on the way. */
export interface ChargeSweep {
  x: number;
  /** The tip or the body met a solid tile, so the dash ends in a recoil. */
  hitWall: boolean;
}

/** The player hitbox at `x`, `y`. */
function playerBox(x: number, y: number): Box {
  return { x, y, w: PLAYER_WIDTH, h: PLAYER_HEIGHT };
}

/** The charge hitbox in front of a player box at `x`, `y` facing `facing`. */
function chargeHitbox(x: number, y: number, facing: number): Box {
  return {
    x: facing > 0 ? x + PLAYER_WIDTH : x - CHARGE_HITBOX_WIDTH,
    y: y + (PLAYER_HEIGHT - CHARGE_HITBOX_HEIGHT) / 2,
    w: CHARGE_HITBOX_WIDTH,
    h: CHARGE_HITBOX_HEIGHT,
  };
}

/** Do two boxes overlap? Touching edges do not. */
function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Does the box cover anything that stops it sideways? */
function blockedSideways(room: Room, box: Box): boolean {
  const lastX = Math.ceil((box.x + box.w) / TILE) - 1;
  const lastY = Math.ceil((box.y + box.h) / TILE) - 1;

  for (let ty = Math.floor(box.y / TILE); ty <= lastY; ty += 1) {
    for (let tx = Math.floor(box.x / TILE); tx <= lastX; tx += 1) {
      if (blocksSideways(room, tx, ty)) {
        return true;
      }
    }
  }

  return false;
}

/** Stamp and announce every prop under the tip; a prop is stamped once a tick. */
function stampProps(state: WorldState, tip: Box): void {
  for (const prop of state.props) {
    if (prop.hitTick !== state.tick && overlaps(tip, prop)) {
      prop.hitTick = state.tick;
      state.events.push(`charge:hit:${prop.kind}`);
    }
  }
}

/**
 * One tick of the dash: carry the player box `dx` along the facing direction
 * in 1-unit steps with the tip leading it, stop at the last step where both the
 * tip and the body are clear of solid tiles, and stamp every prop the tip
 * passes over. Props are triggers, never collision, so only tiles stop him.
 */
export function sweepCharge(state: WorldState, dx: number): ChargeSweep {
  const player = state.player;
  const dir = Math.sign(dx);
  let x = player.x;

  for (let left = Math.abs(dx); left > 0; left -= STEP) {
    const next = x + dir * Math.min(STEP, left);
    const tip = chargeHitbox(next, player.y, player.facing);

    if (blockedSideways(state.room, tip) || blockedSideways(state.room, playerBox(next, player.y))) {
      return { x, hitWall: true };
    }

    x = next;
    stampProps(state, tip);
  }

  return { x, hitWall: false };
}
