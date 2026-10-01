// The wizard's locomotion: run, variable jump, gravity, the wand charge and
// the state table of docs/plan/02-design/movement-and-physics.md. He walks and
// jumps on foot; the wand is the attack, not the ride (ADR-002). Every number
// comes from constants.ts.
//
// One tick on foot, in this order: accelerate, cut a released jump, fall,
// move, then decide about a jump knowing the ground contact this tick just
// made. Deciding last is what lets a jump buffered in the air fire on the tick
// of the landing.
//
// A charge tick is a tick of another kind: gravity is off, the wand carries
// him, and game/sim/charge-hit.ts does the moving.

import { sweepCharge } from './charge-hit';
import {
  AIR_ACCEL,
  CHARGE_COOLDOWN_TICKS,
  CHARGE_RECOIL_TICKS,
  CHARGE_SPEED,
  CHARGE_TICKS,
  CHARGE_WINDUP_TICKS,
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

/** A tick of falling: gravity, down to the fastest fall the table allows. */
function fall(player: Player): void {
  player.vy = Math.min(player.vy + GRAVITY * DT, TERMINAL_VELOCITY);
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
 * Read the jump button and arm the buffer on a press. `jumpHeld` is what makes
 * the read an edge, so a held button arms the buffer once.
 *
 * This runs on every tick, whichever kind of movement owns it: a press made
 * during a charge is remembered when it is made and ages from there, not from
 * the dismount.
 */
function readJump(player: Player, input: InputFrame): void {
  if (input.jump && !player.jumpHeld) {
    player.jumpBuffer = JUMP_BUFFER_TICKS;
  }

  player.jumpHeld = input.jump;
}

/** Spend a buffered jump if the ground or coyote time still allows one. */
function tryJump(player: Player): void {
  if (player.jumpBuffer > 0 && (player.onGround || player.coyote > 0)) {
    player.vy = JUMP_VELOCITY;
    player.onGround = false;
    player.coyote = 0;
    player.jumpBuffer = 0;
    player.fellFor = 0;
  }
}

/**
 * Age coyote time and the jump buffer. Both counters are read before they are
 * aged, so each grants its full COYOTE_TICKS or JUMP_BUFFER_TICKS counting the
 * tick that started it.
 *
 * That off-by-one is the design's, not an accident: movement-and-physics.md
 * budgets "up to 11 more" units of reach from coyote time, and six ticks at
 * the run speed of 110 is 110 / 60 * 6 = 11.0 units past the ledge, which is
 * what the latest coyote jump here measures. A seventh tick would reach 12.83
 * and break the frozen table, so do not correct this back out.
 *
 * Ageing belongs to the tick, not to the tick on foot. A charge tick is still a
 * tick spent off the ledge, and so will a hurt or a victory tick be; ageing
 * these only where jumps are spent stretched both frozen windows by the length
 * of whatever else owned the tick.
 */
function ageJumpWindows(player: Player): void {
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
 * True while the wand owns the tick: the dash itself, or the recoil after it.
 *
 * It is also the answer to "can he be hurt right now" — ADR-002 grants no
 * vulnerability during the charge, so game/sim/props.ts reads this predicate
 * before it resolves a lethal hazard rather than keeping a second copy of the
 * rule in `invuln`.
 */
export function charging(player: Player): boolean {
  return player.state === 'charge' || player.state === 'chargeRecoil';
}

/**
 * The states a charge may be entered from, named rather than derived: the state
 * table of movement-and-physics.md gives the sources of `charge` as exactly
 * `idle, run` and `jump, fall`. `land`, `hurt` and `victory` are not among
 * them, and naming the four is what keeps the two that do not exist yet from
 * inheriting the transition silently.
 */
const CHARGE_FROM: readonly PlayerState[] = ['idle', 'run', 'jump', 'fall'];

/** Attack pressed with the cooldown spent: this tick he leaps astride the wand. */
function mounting(player: Player, input: InputFrame): boolean {
  return CHARGE_FROM.includes(player.state) && input.charge && player.chargeCooldown === 0;
}

/**
 * Leap astride the wand. This tick is the charge's first, and a wind-up one:
 * setting the state here, before the tick's body runs, is what keeps gravity
 * off for the whole charge instead of all but its first tick.
 */
function mount(state: WorldState): void {
  state.player.state = 'charge';
  state.player.stateTimer = 0;
  state.events.push('charge');
}

/**
 * The charge is over: the cooldown starts and he is back on foot. `onGround`
 * is still whatever it was when he mounted, because a charge never moves him
 * vertically; the next tick on foot re-reads it.
 */
function dismount(player: Player): PlayerState {
  player.chargeCooldown = CHARGE_COOLDOWN_TICKS;

  return player.onGround ? 'idle' : 'fall';
}

/**
 * One tick of the wand charge. Gravity is off for all of it, so vertical speed
 * stays zero from the wind-up to the dismount.
 *
 * `stateTimer` counts the ticks already spent in the state, so `elapsed` is
 * this tick's number in it. The wind-up is the first CHARGE_WINDUP_TICKS and
 * covers no ground, the CHARGE_TICKS after it are the dash, and the state
 * lasts the 16 ticks the state table gives it. A crystal tip that meets a
 * solid tile cuts the dash short into the recoil, which stands still.
 */
function stepCharge(state: WorldState): PlayerState {
  const player = state.player;
  const elapsed = player.stateTimer + 1;

  player.vx = 0;
  player.vy = 0;

  if (player.state === 'chargeRecoil') {
    return elapsed < CHARGE_RECOIL_TICKS ? 'chargeRecoil' : dismount(player);
  }

  if (elapsed > CHARGE_WINDUP_TICKS) {
    player.vx = player.facing * CHARGE_SPEED;

    const swept = sweepCharge(state, player.vx * DT);

    player.x = swept.x;

    if (swept.hitWall) {
      player.vx = 0;
      state.events.push('charge:wall');

      return 'chargeRecoil';
    }
  }

  return elapsed < CHARGE_WINDUP_TICKS + CHARGE_TICKS ? 'charge' : dismount(player);
}

/** One tick on foot, ending in the state it leaves him in. */
function stepOnFoot(state: WorldState, input: InputFrame): PlayerState {
  const player = state.player;
  const wanted = direction(input);
  const wasOnGround = player.onGround;

  accelerate(player, wanted);

  if (!input.jump && player.vy < JUMP_CUT_VELOCITY) {
    player.vy = JUMP_CUT_VELOCITY;
  }

  fall(player);

  const falling = player.vy > 0;

  move(state.room, player);

  // The ground under him, kept while he is on it rather than taken on the
  // edge he leaves it: a standing invariant needs no second site for the jump
  // and no backing out of the fraction of a unit gravity sank him before the
  // step off a ledge, and it heals itself after a respawn puts him elsewhere.
  if (player.onGround) {
    player.leftGroundY = player.y;
  }

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

  tryJump(player);

  return nextState(player, wanted !== 0);
}

/**
 * One tick after the beacon: gravity and the sweep, and nothing else. The
 * beacon's box is four tiles tall, so the touch is as likely to be taken in
 * mid-air as on the ground, and he has to finish the fall he was in or he
 * hangs at the height he touched it for the rest of the run. `vx` is zero
 * from the touch on, so `move` here is a sweep straight down.
 */
function stepVictory(state: WorldState): void {
  const player = state.player;

  fall(player);

  move(state.room, player);
}

/**
 * Advance the wizard by one tick. Called only by tick(); it is the sole owner
 * of everything under `state.player`.
 *
 * A tick belongs whole to one kind of movement, the wand's or his own feet,
 * and the wand is asked first. Attack is read as a held button and not as an
 * edge: the player has no `chargeHeld` counterpart to `jumpHeld`
 * (simulation-architecture.md), so the cooldown is what spaces one charge
 * from the next, and it runs down on every tick that did not start one.
 *
 * What surrounds that choice belongs to the tick rather than to either kind of
 * movement: the jump button is read and the two jump windows are aged here, so
 * a charge suspends neither.
 *
 * The one tick that belongs to neither is a tick after the beacon: the run is
 * over, the cast holds him over the column he touched it from and facing it
 * while gravity settles his height (level-design.md, "The beacon ends the
 * run"), and a held button steers nothing. Taking `stepVictory` here is what
 * makes that true — zeroing his speed after the move, as game/sim/props.ts
 * once did alone, still let this function accelerate him a quarter of a unit
 * and re-read his facing every tick of the cast, so the beam could be drawn
 * firing away from the beacon it lights. What victory holds is the input, not
 * the physics.
 * game/sim/props.ts owns `state` and `stateTimer` from the touch on.
 */
export function stepPlayer(state: WorldState, input: InputFrame): void {
  const player = state.player;

  if (state.victoryTick >= 0) {
    stepVictory(state);

    return;
  }

  if (mounting(player, input)) {
    mount(state);
  } else {
    player.chargeCooldown = Math.max(0, player.chargeCooldown - 1);
  }

  readJump(player, input);

  const next = charging(player) ? stepCharge(state) : stepOnFoot(state, input);

  ageJumpWindows(player);

  player.stateTimer = next === player.state ? player.stateTimer + 1 : 0;
  player.state = next;
}
