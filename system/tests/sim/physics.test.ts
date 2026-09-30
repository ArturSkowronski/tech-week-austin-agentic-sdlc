// The collision rules of docs/plan/02-design/movement-and-physics.md: the sweep
// is per axis, X then Y, in 1-unit steps; solid tiles block from every side;
// a one-way blocks only a box falling onto it; spikes report and never block;
// and the sides of the room are walls whatever the map draws there
// (docs/plan/02-design/level-design.md).

import { describe, expect, it } from 'vitest';
import forestGlade from '../../game/content/rooms/forest-glade';
import {
  createWorld,
  DT,
  moveBox,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  TERMINAL_VELOCITY,
  TILE,
} from '../../game/sim/index';
import type { Box, Room } from '../../game/sim/index';
import { hold, run, worldFrom } from './helpers';

/** The player's hitbox at a position; the sizes the tuning table freezes. */
function box(x: number, y: number): Box {
  return { x, y, w: PLAYER_WIDTH, h: PLAYER_HEIGHT };
}

/** The tile grid of an inline text map. */
function roomFrom(text: string): Room {
  return worldFrom(text).room;
}

/** The same move applied tick after tick, as the player loop applies it. */
function stepped(room: Room, start: Box, dx: number, dy: number, ticks: number): Box {
  let current = start;

  for (let step = 0; step < ticks; step += 1) {
    const moved = moveBox(room, current, dx, dy);

    current = box(moved.x, moved.y);
  }

  return current;
}

describe('moveBox sweeps X then Y', () => {
  /** A floor at row 3 with a wall rising from it at column 5. */
  const CORNER = roomFrom(`
    #    #
    #    #
    #    #
    ########
  `);

  it('ends flush on both axes in an inside corner', () => {
    const moved = moveBox(CORNER, box(2 * TILE, 0), 60, 40);

    expect(moved.x + PLAYER_WIDTH).toBe(5 * TILE);
    expect(moved.y + PLAYER_HEIGHT).toBe(3 * TILE);
    expect(moved.hitRight).toBe(true);
    expect(moved.hitBottom).toBe(true);
  });

  it('stops flush against a wall on the left and reports the side', () => {
    const moved = moveBox(CORNER, box(TILE + 4, 0), -30, 0);

    expect(moved.x).toBe(TILE);
    expect(moved.hitLeft).toBe(true);
    expect(moved.hitRight).toBe(false);
  });

  it('reports no contact when the whole move is free', () => {
    const moved = moveBox(CORNER, box(2 * TILE, 0), 8, 4);

    expect(moved).toEqual({
      x: 2 * TILE + 8,
      y: 4,
      hitLeft: false,
      hitRight: false,
      hitTop: false,
      hitBottom: false,
      hazard: false,
    });
  });
});

describe('a one-tile wall or floor is never passed through', () => {
  /** One column of solid tiles, the thinnest wall a room can draw. */
  const THIN = roomFrom(`
    #  #
    #  #
    ####
  `);

  /** Terminal velocity is the fastest the tuning table lets anything travel. */
  const FULL_SPEED = TERMINAL_VELOCITY * DT;

  it('stops a single step far larger than a tile', () => {
    expect(moveBox(THIN, box(TILE, 0), 200, 0).x).toBe(3 * TILE - PLAYER_WIDTH);
  });

  it('stops a box driven into the wall at full speed', () => {
    expect(stepped(THIN, box(TILE, 0), FULL_SPEED, 0, 30).x).toBe(3 * TILE - PLAYER_WIDTH);
  });

  it('stops a box falling onto the floor at full speed', () => {
    expect(stepped(THIN, box(TILE, 0), 0, FULL_SPEED, 30).y + PLAYER_HEIGHT).toBe(2 * TILE);
  });
});

describe('a one-way platform is solid from above only', () => {
  const ONE_WAY = roomFrom(`
    #
    #
    #---
    #
  `);

  it('catches a box that was above its surface', () => {
    const moved = moveBox(ONE_WAY, box(TILE, 0), 0, 40);

    expect(moved.y + PLAYER_HEIGHT).toBe(2 * TILE);
    expect(moved.hitBottom).toBe(true);
  });

  it('lets a box rise through it from below', () => {
    const moved = moveBox(ONE_WAY, box(TILE, 40), 0, -30);

    expect(moved.y).toBe(10);
    expect(moved.hitTop).toBe(false);
  });

  it('lets a box that is already below it keep falling', () => {
    const moved = moveBox(ONE_WAY, box(TILE, 20), 0, 10);

    expect(moved.y).toBe(30);
    expect(moved.hitBottom).toBe(false);
  });
});

describe('a ceiling stops a rising box flush below it', () => {
  const CEILING = roomFrom(`
    ####
    #
    #
  `);

  it('reports the contact the caller zeroes upward speed on', () => {
    const moved = moveBox(CEILING, box(TILE, 20), 0, -15);

    expect(moved.y).toBe(TILE);
    expect(moved.hitTop).toBe(true);
    expect(moved.hitBottom).toBe(false);
  });
});

describe('spikes report a hazard and block nothing', () => {
  const SPIKES = roomFrom(`
    #
    #
    #^^^
    ####
  `);

  it('falls through the spikes onto the floor below and reports them', () => {
    const moved = moveBox(SPIKES, box(TILE, 0), 0, 40);

    expect(moved.y + PLAYER_HEIGHT).toBe(3 * TILE);
    expect(moved.hazard).toBe(true);
  });

  it('reports nothing while the box is clear of them', () => {
    expect(moveBox(SPIKES, box(TILE, 0), 0, 4).hazard).toBe(false);
  });
});

describe('the sides of a room are walls, never exits', () => {
  /** Ticks of held input: long enough for any run to reach the edge and stop. */
  const EDGE_TICKS = 300;

  it('stops the wizard at the left edge of the glade instead of letting him out', () => {
    const glade = createWorld(forestGlade, { roomName: 'forest-glade' });
    const world = run(glade, hold({ left: true }, EDGE_TICKS));

    expect(world.player.x).toBe(0);
    expect(world.player.onGround).toBe(true);
    expect(world.deaths).toBe(0);
  });

  it('stops the wizard at the right edge of a room that draws no spikes there', () => {
    const world = run(
      worldFrom(`
        P
        ######
      `),
      hold({ right: true }, EDGE_TICKS),
    );

    expect(world.player.x).toBe(6 * TILE - PLAYER_WIDTH);
    expect(world.player.onGround).toBe(true);
    expect(world.deaths).toBe(0);
  });
});
