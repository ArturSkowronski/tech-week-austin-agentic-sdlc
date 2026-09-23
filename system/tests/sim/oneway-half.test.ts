// The `=` tile: a one-way platform whose surface sits half a tile down, for the
// ledges a painting draws mid-tile (docs/plan/02-design/level-design.md).

import { describe, expect, it } from 'vitest';
import { moveBox, PLAYER_HEIGHT, PLAYER_WIDTH, TILE } from '../../game/sim/index';
import { worldFrom } from './helpers';

/** The player's hitbox at the top of the room, above the platform. */
const DROPPED = { x: TILE, y: 0, w: PLAYER_WIDTH, h: PLAYER_HEIGHT };

/** The same room with the given one-way character across row 2. */
function roomWith(platform: string) {
  return worldFrom(`
    #
    #
    #${platform.repeat(3)}
    #
  `).room;
}

/** Where the box comes to rest after falling onto that platform. */
function landingY(platform: string): number {
  return moveBox(roomWith(platform), DROPPED, 0, 60).y;
}

describe('the half-height one-way', () => {
  it('holds a box half a tile lower than a full one-way', () => {
    expect(landingY('=')).toBe(landingY('-') + TILE / 2);
    expect(landingY('=') + PLAYER_HEIGHT).toBe(2 * TILE + TILE / 2);
  });

  it('lets a box fall past the top half of its tile', () => {
    const moved = moveBox(roomWith('='), DROPPED, 0, 6);

    expect(moved.y).toBe(6);
    expect(moved.hitBottom).toBe(false);
  });
});
