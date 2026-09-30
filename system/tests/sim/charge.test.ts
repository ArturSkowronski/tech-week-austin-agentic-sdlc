// The wand charge: the wind-up, the distance, gravity off, the wall recoil,
// the cooldown, the hitbox over props, and the two things a charge tick must
// not suspend — the body's own collision and the jump windows
// (docs/plan/02-design/movement-and-physics.md, ADR-002).

import { describe, expect, it } from 'vitest';
import {
  CHARGE_COOLDOWN_TICKS,
  CHARGE_HITBOX_WIDTH,
  CHARGE_RECOIL_TICKS,
  CHARGE_TICKS,
  CHARGE_WINDUP_TICKS,
  JUMP_VELOCITY,
  NO_INPUT,
  PLAYER_WIDTH,
  RUN_SPEED,
  TILE,
  tick,
} from '../../game/sim/index';
import type { InputFrame, PlayerState, Prop, WorldState } from '../../game/sim/index';
import { hold, run, worldFrom } from './helpers';

/** Flat ground, far wider than one charge. */
const FLAT = `

  P
  ####################
`;

/** The same ground with a three-tile-thick wall a charge away from the spawn. */
const WALL = `

  P        ###
  #############
`;

/** The same wall, one tile thick. */
const THIN_WALL = `

  P        #
  #############
`;

/**
 * Two ledges of the same height with a three-tile gap. A run off the near lip
 * sinks him a few units, which puts the far ledge's top row across the lower
 * end of the 28-unit body but still below the 8-unit crystal tip.
 */
const GAP = `


 P
######   #######
################
`;

/** The x of the far ledge's near face in GAP. */
const GAP_FACE = 9 * TILE;

/** Ground that simply stops, so a run off the lip leaves him falling. */
const LIP = `


 P
######
######
`;

/** The x of the near face of the wall in WALL and in THIN_WALL. */
const WALL_FACE = 9 * TILE;

/** Where he starts the charge: at full run speed, three tiles short of the wall. */
const RUN_UP_TO = WALL_FACE - 3 * TILE;

const RIGHT: InputFrame = { ...NO_INPUT, right: true };
const ATTACK: InputFrame = { ...NO_INPUT, charge: true };

/** A world stepped one tick, so the wizard rests on the ground he spawned over. */
function standing(map: string): WorldState {
  return run(worldFrom(map), hold({}, 1));
}

/** Step while he is in `state`, and report how many ticks that lasted. */
function stepWhile(world: WorldState, state: PlayerState): number {
  let ticks = 0;

  while (world.player.state === state) {
    tick(world, NO_INPUT);
    ticks += 1;
  }

  return ticks;
}

/** A world on flat ground in which one whole charge has just ended. */
function afterCharge(): WorldState {
  const world = standing(FLAT);

  tick(world, ATTACK);
  stepWhile(world, 'charge');

  return world;
}

/** His state after pressing attack `late` ticks after a charge ended. */
function attackAfterCharge(late: number): PlayerState {
  const world = run(afterCharge(), hold({}, late - 1));

  tick(world, ATTACK);

  return world.player.state;
}

/** Run right off the lip of `map` and stop on the first tick in the air. */
function offTheLip(map: string): WorldState {
  const world = standing(map);

  while (world.player.onGround) {
    tick(world, RIGHT);
  }

  return world;
}

/** A prop box the room parser will one day place; here the test places it. */
function bushAt(x: number, y: number): Prop {
  return { id: 0, kind: 'bush', x, y, w: TILE, h: TILE, hitTick: -1, active: false };
}

describe('the wand charge', () => {
  it('stands still for the wind-up, then covers about 60 units on flat ground', () => {
    const world = standing(FLAT);
    const start = world.player.x;

    // The press tick is the charge's first, so it is one of the wind-up ticks.
    tick(world, ATTACK);
    run(world, hold({}, CHARGE_WINDUP_TICKS - 1));

    expect(world.player.x).toBe(start);
    expect(stepWhile(world, 'charge')).toBe(CHARGE_TICKS);
    expect(world.player.x - start).toBeGreaterThan(59);
    expect(world.player.x - start).toBeLessThan(62);
  });

  it('keeps vertical speed at zero for every tick of the charge', () => {
    const world = standing(FLAT);
    const speeds: number[] = [];

    tick(world, ATTACK);
    speeds.push(world.player.vy);

    while (world.player.state === 'charge') {
      tick(world, NO_INPUT);
      speeds.push(world.player.vy);
    }

    expect(speeds).toHaveLength(CHARGE_WINDUP_TICKS + CHARGE_TICKS);
    expect(speeds.every((vy) => vy === 0)).toBe(true);
  });
});

/** A world run up to full speed, three tiles short of the wall of `map`. */
function runUpToWall(map: string): WorldState {
  const world = standing(map);

  while (world.player.x < RUN_UP_TO) {
    tick(world, RIGHT);
  }

  return world;
}

// Thickness makes no difference: the charge is stopped by the near face, so a
// wall one tile thick holds it as a wall three tiles thick does.
describe.each([
  { thickness: 'three tiles', map: WALL },
  { thickness: 'one tile', map: THIN_WALL },
])('a charge into a wall $thickness thick', ({ map }) => {
  it('recoils with the wizard on the near side, the crystal tip against it', () => {
    const world = runUpToWall(map);

    expect(world.player.vx).toBe(RUN_SPEED);

    tick(world, { ...RIGHT, charge: true });
    stepWhile(world, 'charge');

    const tipFace = world.player.x + PLAYER_WIDTH + CHARGE_HITBOX_WIDTH;

    expect(world.player.state).toBe('chargeRecoil');
    expect(world.events).toContain('charge:wall');
    expect(tipFace).toBeLessThanOrEqual(WALL_FACE);
    expect(tipFace).toBeGreaterThan(WALL_FACE - 1);
    expect(stepWhile(world, 'chargeRecoil')).toBe(CHARGE_RECOIL_TICKS);
  });
});

describe('the charge cooldown', () => {
  it('ignores attack for CHARGE_COOLDOWN_TICKS ticks after a charge', () => {
    expect(afterCharge().player.chargeCooldown).toBe(CHARGE_COOLDOWN_TICKS);
    expect(attackAfterCharge(CHARGE_COOLDOWN_TICKS)).toBe('idle');
    expect(attackAfterCharge(CHARGE_COOLDOWN_TICKS + 1)).toBe('charge');
  });
});

describe('the charge hitbox', () => {
  it('stamps a bush it passes over with the tick it was hit', () => {
    const world = standing(FLAT);
    const bush = bushAt(3 * TILE, TILE);

    world.props.push(bush);
    tick(world, ATTACK);

    while (bush.hitTick === -1 && world.player.state === 'charge') {
      tick(world, NO_INPUT);
    }

    expect(bush.hitTick).toBe(world.tick);
    expect(world.events).toContain('charge:hit:bush');
  });
});

describe('a charge in mid-air', () => {
  it('stops the body at the ledge it meets, not only the crystal tip', () => {
    const world = offTheLip(GAP);

    tick(world, { ...RIGHT, charge: true });
    stepWhile(world, 'charge');

    // The tip rides above the ledge's top row here, so only the body meets it.
    // Sweeping the tip alone carried him a whole hitbox deep into the rock and
    // left the next tick on foot to start inside a solid, which moveBox does
    // not support.
    const bodyFace = world.player.x + PLAYER_WIDTH;

    expect(world.player.state).toBe('chargeRecoil');
    expect(world.events).toContain('charge:wall');
    expect(bodyFace).toBeLessThanOrEqual(GAP_FACE);
    expect(bodyFace).toBeGreaterThan(GAP_FACE - 1);

    // He stays where the recoil left him: no snap out of a solid afterwards.
    const restingAt = world.player.x;

    run(world, hold({}, CHARGE_RECOIL_TICKS + 1));

    expect(world.player.x).toBe(restingAt);
  });
});

describe('the jump windows during a charge', () => {
  it('keeps coyote time counting, so a charge grants no jump out of the air', () => {
    const world = offTheLip(LIP);

    tick(world, { ...NO_INPUT, charge: true });
    stepWhile(world, 'charge');

    expect(world.player.coyote).toBe(0);

    tick(world, { ...NO_INPUT, jump: true });

    expect(world.player.vy).not.toBe(JUMP_VELOCITY);
    expect(world.player.state).toBe('fall');
  });

  it('ages a jump pressed during the charge instead of holding it to the dismount', () => {
    const world = standing(FLAT);

    tick(world, ATTACK);
    tick(world, { ...NO_INPUT, jump: true });
    stepWhile(world, 'charge');

    expect(world.player.jumpBuffer).toBe(0);

    tick(world, NO_INPUT);

    expect(world.player.vy).not.toBe(JUMP_VELOCITY);
    expect(world.player.state).toBe('idle');
  });
});
