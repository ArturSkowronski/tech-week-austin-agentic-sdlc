// The wizard's locomotion: run, variable jump, gravity and the state table of
// docs/plan/02-design/movement-and-physics.md. He walks and jumps; there is no
// bounce and no charged jump (ADR-002). Every number comes from constants.ts.
//
// One tick, in this order: accelerate, cut a released jump, fall, move, then
// decide about a jump knowing the ground contact this tick just made. Deciding
// last is what lets a jump buffered in the air fire on the tick of the landing.

import {
  AIR_ACCEL,
  COYOTE_TICKS,
  DT,
  GRAVITY,
  GROUND_ACCEL,
  GROUND_DECEL,
  JUMP_BUFFER_TICKS,
  JUMP_CUT_VELOCITY,
  JUMP_VELOCITY,
  LAND_TICKS,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  RUN_SPEED,
  TERMINAL_VELOCITY,
} from './constants';
import type { InputFrame } from './input';
import { moveBox } from './physics';
import type { Player, PlayerState, Room, WorldState } from './state';

/** Move `value` towards `target` by at most `rate`. */
function approach(value: number, target: number, rate: number): number {
  return Math.abs(target - value) <= rate ? target : value + Math.sign(target - value) * rate;
}

/** 1 for right, -1 for left, 0 for neither or both. */
function direction(input: InputFrame): number {
  return (input.right ? 1 : 0) - (input.left ? 1 : 0);
}

/** Run towards the wanted speed; the air has a weaker grip than the ground. */
function accelerate(player: Player, wanted: number): void {
  const ground = wanted === 0 ? GROUND_DECEL : GROUND_ACCEL;
  const rate = (player.onGround ? ground : AIR_ACCEL) * DT;

  player.vx = approach(player.vx, wanted * RUN_SPEED, rate);

  if (wanted !== 0) {
    player.facing = wanted > 0 ? 1 : -1;
  }
}

/** Carry the wizard through the room and keep what he touched on the way. */
function move(room: Room, player: Player): void {
  const box = { x: player.x, y: player.y, w: PLAYER_WIDTH, h: PLAYER_HEIGHT };
  const moved = moveBox(room, box, player.vx * DT, player.vy * DT);

  player.x = moved.x;
  player.y = moved.y;
  player.onGround = moved.hitBottom;

  if (moved.hitLeft || moved.hitRight) {
    player.vx = 0;
  }

  if (moved.hitTop || moved.hitBottom) {
    player.vy = 0;
  }
}

/**
 * Coyote time, the jump buffer and the jump itself. Both counters are read
 * before they are spent, so each grants its full COYOTE_TICKS or
 * JUMP_BUFFER_TICKS counting the tick that started it.
 *
 * That off-by-one is the design's, not an accident: movement-and-physics.md
 * budgets "up to 11 more" units of reach from coyote time, and six ticks at
 * the run speed of 110 is 110 / 60 * 6 = 11.0 units past the ledge, which is
 * what the latest coyote jump here measures. A seventh tick would reach 12.83
 * and break the frozen table, so do not correct this back out.
 */
function tryJump(player: Player, input: InputFrame): void {
  const pressed = input.jump && !player.jumpHeld;

  player.jumpHeld = input.jump;

  if (pressed) {
    player.jumpBuffer = JUMP_BUFFER_TICKS;
  }

  if (player.jumpBuffer > 0 && (player.onGround || player.coyote > 0)) {
    player.vy = JUMP_VELOCITY;
    player.onGround = false;
    player.coyote = 0;
    player.jumpBuffer = 0;
    player.fellFor = 0;

    return;
  }

  player.coyote = player.onGround ? COYOTE_TICKS : Math.max(0, player.coyote - 1);
  player.jumpBuffer = Math.max(0, player.jumpBuffer - 1);
}

/**
 * The state table of movement-and-physics.md, read top to bottom. He is in
 * `jump` while he is off the ground and still rising, which is where the jump
 * itself leaves him. `land` holds LAND_TICKS ticks and ends early on a
 * movement input; it locks nothing.
 */
function nextState(player: Player, moving: boolean): PlayerState {
  if (!player.onGround) {
    return player.vy > 0 ? 'fall' : 'jump';
  }

  if (player.state === 'jump' || player.state === 'fall') {
    return 'land';
  }

  if (player.state === 'land' && !moving && player.stateTimer + 1 < LAND_TICKS) {
    return 'land';
  }

  return moving ? 'run' : 'idle';
}

/**
 * Advance the wizard by one tick. Called only by tick(); it is the sole owner
 * of everything under `state.player`.
 */
export function stepPlayer(state: WorldState, input: InputFrame): void {
  const player = state.player;
  const wanted = direction(input);
  const wasOnGround = player.onGround;

  accelerate(player, wanted);

  if (!input.jump && player.vy < JUMP_CUT_VELOCITY) {
    player.vy = JUMP_CUT_VELOCITY;
  }

  player.vy = Math.min(player.vy + GRAVITY * DT, TERMINAL_VELOCITY);

  const falling = player.vy > 0;

  move(state.room, player);

  // `fellFor` measures one drop: it restarts when he leaves the ground, and
  // counts every tick he sank while off the ground at either end of it, so the
  // step off the ledge and the landing tick are both part of the fall.
  const airborne = !wasOnGround || !player.onGround;

  if (wasOnGround && !player.onGround) {
    player.fellFor = 0;
  }

  if (airborne && falling) {
    player.fellFor += 1;
  }

  tryJump(player, input);

  const next = nextState(player, wanted !== 0);

  player.stateTimer = next === player.state ? player.stateTimer + 1 : 0;
  player.state = next;
}
