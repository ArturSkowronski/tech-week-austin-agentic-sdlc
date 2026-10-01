// The water column of a waterfall: the pull, the drag, the jump it forbids,
// the charge it ends, the death at the bottom row and the stamp that parts it
// (docs/plan/02-design/movement-and-physics.md, bug-quest.md).
//
// The last two cases are the gap arithmetic of the design read off the real
// room: the glade's charge gap is six tiles, so a jump and a charge cross it
// dry and a plain jump does not. They start on the plateau instead of climbing
// to it, because the climb is a playthrough's business, not the water's.

import {
  CHARGE_COOLDOWN_TICKS,
  createWorld,
  NO_INPUT,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  RUN_SPEED,
  TILE,
  tick,
  WATER_DRAG,
  WATER_NEAR,
  WATER_PULL,
} from '../../game/sim/index';
import type { InputFrame, Prop, WorldState } from '../../game/sim/index';
import { describe, expect, it } from 'vitest';
import { rooms } from '../../game/content/rooms/index';
import { hold, run, worldFrom } from './helpers';

/** A spawn over the waterfall's column, so a step of gravity drops him in. */
const DROP = `
  #          #
  #    P     #
  #  W       #
  #          #
  #          #
  #          #
  #          #
  #          #
`;

/** A lip with the water's surface level with it: a step right and he is in. */
const LEDGE = `
  #          #
  #          #
  # P        #
  #####W     #
  #          #
  #          #
  #          #
  #          #
`;

/**
 * Floor with the water standing on it, a charge's length from the spawn. The
 * bank to its left is also where he stands to part the water without ever
 * touching it.
 */
const SHALLOWS = `
  #              #
  #              #
  #  P           #
  #        W     #
  ################
`;

/** The room text of a room in the glob. */
function roomText(name: string): string {
  const text = rooms[name];

  if (text === undefined) {
    throw new Error(`the rooms glob has no ${name}`);
  }

  return text;
}

/** The room's one waterfall. */
function waterfall(state: WorldState): Prop {
  const prop = state.props.find((candidate) => candidate.kind === 'waterfall');

  if (prop === undefined) {
    throw new Error('the room has no waterfall');
  }

  return prop;
}

/**
 * Is the player box in the column? The overlap the test makes for itself, so
 * `hitTick` is checked against contact rather than against its own stamp.
 */
function wet(state: WorldState): boolean {
  const player = state.player;
  const column = waterfall(state);

  return (
    player.x < column.x + column.w &&
    column.x < player.x + PLAYER_WIDTH &&
    player.y < column.y + column.h &&
    column.y < player.y + PLAYER_HEIGHT
  );
}

/** Hold one frame until `done`; a replay that never gets there is the failure. */
function stepUntil(state: WorldState, input: Partial<InputFrame>, done: () => boolean): void {
  const frame: InputFrame = { ...NO_INPUT, ...input };

  for (let step = 0; step < 600 && !done(); step += 1) {
    tick(state, frame);
  }

  if (!done()) {
    throw new Error(`600 ticks of ${JSON.stringify(input)} never got there`);
  }
}

describe('the water column', () => {
  it('pulls him to the bottom of the room and drowns him within 60 ticks', () => {
    const world = worldFrom(DROP);

    stepUntil(world, {}, () => wet(world));

    const entered = world.tick;

    expect(world.player.vy).toBeGreaterThanOrEqual(WATER_PULL);

    stepUntil(world, {}, () => world.deaths > 0);

    expect(world.tick - entered).toBeLessThanOrEqual(60);
    expect(world.player.state).toBe('hurt');
  });

  it('damps the run he carries in by the drag, every tick', () => {
    const inside = worldFrom(DROP);
    const beside = worldFrom(DROP);
    const column = waterfall(inside);

    for (const world of [inside, beside]) {
      stepUntil(world, {}, () => wet(world));
      world.player.vx = RUN_SPEED;
    }

    // The same falling tick a tile clear of the column, so what the water
    // takes off his speed is told apart from what the air does anyway.
    beside.player.x = column.x + column.w + TILE;
    run(inside, hold({}, 1));
    run(beside, hold({}, 1));

    expect(wet(beside)).toBe(false);
    expect(inside.player.vx).toBeCloseTo(beside.player.vx * WATER_DRAG);
  });

  it('leaves a jump pressed in water without an effect, to the unit', () => {
    const pressing = worldFrom(LEDGE);
    const ignoring = worldFrom(LEDGE);

    for (const world of [pressing, ignoring]) {
      // Off the lip and straight into the column, one tick off the ground, so
      // the jump he presses next is one coyote time would otherwise grant him.
      stepUntil(world, { right: true }, () => wet(world));
    }

    run(pressing, hold({ jump: true }, 5));
    run(ignoring, hold({}, 5));

    expect(pressing.deaths).toBe(0);
    expect(pressing.player.vy).toBe(ignoring.player.vy);
    expect(pressing.player.y).toBe(ignoring.player.y);
    expect(pressing.player.vy).toBeGreaterThanOrEqual(WATER_PULL);
  });

  it('ends a charge on the tick it reaches the water', () => {
    const world = worldFrom(SHALLOWS);
    const column = waterfall(world);

    stepUntil(world, { right: true }, () => world.player.x + PLAYER_WIDTH > column.x - 3 * TILE);
    stepUntil(world, { right: true, charge: true }, () => world.player.state === 'charge');

    expect(wet(world)).toBe(false);

    stepUntil(world, { right: true, charge: true }, () => wet(world));

    expect(world.player.state).toBe('idle');
    expect(world.player.chargeCooldown).toBe(CHARGE_COOLDOWN_TICKS);
  });

  it('stamps the column every tick he stands within WATER_NEAR of it, dry', () => {
    const world = worldFrom(SHALLOWS);
    const column = waterfall(world);

    // A tile from the column, which is inside the tile and a half it parts for.
    world.player.x = column.x - PLAYER_WIDTH - TILE;
    run(world, hold({}, 10));

    expect(wet(world)).toBe(false);
    expect(column.hitTick).toBe(world.tick);

    run(world, hold({}, 1));

    expect(column.hitTick).toBe(world.tick);
  });

  it('stops stamping the tick he has walked out of WATER_NEAR', () => {
    const world = worldFrom(SHALLOWS);
    const column = waterfall(world);

    world.player.x = column.x - PLAYER_WIDTH - TILE;
    run(world, hold({}, 10));

    const beside = column.hitTick;

    // One unit further off than the water reaches, and it stops following.
    world.player.x = column.x - PLAYER_WIDTH - WATER_NEAR - 1;
    run(world, hold({}, 10));

    expect(wet(world)).toBe(false);
    expect(column.hitTick).toBe(beside);
  });

  it('stamps the column on the tick of first contact', () => {
    const world = worldFrom(DROP);
    const column = waterfall(world);

    expect(column.hitTick).toBe(-1);

    stepUntil(world, {}, () => wet(world));

    expect(column.hitTick).toBe(world.tick);
  });
});

describe("the glade's six-tile charge gap", () => {
  /**
   * The wizard on the plateau, eight tiles short of the gap and running at it.
   * Placing him there is not a jump the water owns; the climb from the spawn
   * belongs to the room's own playthrough test. The plateau's height is the
   * column's own surface, which the map anchors them to each other at.
   */
  function runningAtTheGap(): WorldState {
    const world = createWorld(roomText('forest-glade'), { roomName: 'forest-glade' });
    const column = waterfall(world);

    world.player.x = column.x - 8 * TILE;
    world.player.y = column.y - PLAYER_HEIGHT;
    stepUntil(world, { right: true }, () => world.player.x + PLAYER_WIDTH >= column.x);

    return world;
  }

  /**
   * Jump off the lip holding right, with or without a charge pressed from the
   * air eight ticks later, until he lands or dies. Reports how far he got and
   * whether he was ever in the column: the stamp no longer answers that, since
   * the water parts for him from a tile and a half away as well.
   */
  function leap(world: WorldState, charging: boolean): { farthest: number; touched: boolean } {
    let farthest = world.player.x;
    let touched = false;

    for (let step = 0; step < 200; step += 1) {
      tick(world, { ...NO_INPUT, right: true, jump: step < 30, charge: charging && step >= 8 });
      farthest = Math.max(farthest, world.player.x);
      touched ||= wet(world);

      if (world.deaths > 0 || (step > 4 && world.player.onGround)) {
        break;
      }
    }

    return { farthest, touched };
  }

  it('is crossed dry by a jump and then a charge', () => {
    const world = runningAtTheGap();
    const column = waterfall(world);

    const { farthest, touched } = leap(world, true);

    expect(farthest).toBeGreaterThanOrEqual(column.x + column.w);
    expect(touched).toBe(false);
    expect(world.deaths).toBe(0);
    expect(world.player.onGround).toBe(true);
  });

  it('is not crossed by a plain full jump, which lands in the water', () => {
    const world = runningAtTheGap();
    const column = waterfall(world);

    const { farthest, touched } = leap(world, false);

    expect(farthest).toBeLessThan(column.x + column.w);
    expect(touched).toBe(true);
    expect(world.deaths).toBe(1);
  });
});
