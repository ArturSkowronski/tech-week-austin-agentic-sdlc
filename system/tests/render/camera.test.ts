// The camera's three rules (docs/plan/02-design/rendering-and-look.md, Camera):
// a dead zone the wizard moves inside without being followed, a clamp to the
// room, and whole pixels last. The stack the camera moves is measured in a
// browser, in tests/smoke/parallax.spec.ts.

import { describe, expect, it } from 'vitest';

import { createWorld, PLAYER_WIDTH, TILE, type WorldState } from '../../game/sim/index';
import { floorLine, follow, restCamera } from '../../game/render/camera';
import { CAMERA_DEAD_ZONE, VIEW_H, VIEW_W } from '../../game/render/config';

const TILES_WIDE = 40;
const TILES_TALL = 16;

/** A plain room wider and taller than the view: floor along the bottom, spawn on it. */
function world(): WorldState {
  const rows = Array.from({ length: TILES_TALL }, () => ' '.repeat(TILES_WIDE));

  rows[TILES_TALL - 2] = ` P${' '.repeat(TILES_WIDE - 2)}`;
  rows[TILES_TALL - 1] = '#'.repeat(TILES_WIDE);

  return createWorld(rows.join('\n'));
}

/** How far the camera can travel right and down in that room. */
const LIMIT = { x: TILES_WIDE * TILE - VIEW_W, y: TILES_TALL * TILE - VIEW_H };

describe('the camera', () => {
  it('rests in the bottom left corner and stays there while he stands on the spawn', () => {
    const state = world();
    const rest = restCamera(state.room);

    expect(rest).toEqual({ x: 0, y: LIMIT.y });
    expect(follow(rest, state)).toEqual(rest);
  });

  it('anchors the layer stack to the floor he starts on', () => {
    expect(floorLine(world().room)).toBe((TILES_TALL - 1) * TILE);
  });

  it('does not follow him while he is inside the dead zone', () => {
    const state = world();
    const camera = { x: 100, y: LIMIT.y };

    // His middle, one unit short of the dead zone's right edge. The camera sits
    // where it rests vertically, so only the horizontal rule is under test.
    state.player.x = camera.x + (VIEW_W + CAMERA_DEAD_ZONE.width) / 2 - 1 - PLAYER_WIDTH / 2;

    expect(follow(camera, state)).toEqual(camera);
  });

  it('follows only far enough to put him back on the dead zone edge', () => {
    const state = world();
    const camera = { x: 100, y: LIMIT.y };
    const edge = camera.x + (VIEW_W + CAMERA_DEAD_ZONE.width) / 2;

    state.player.x = edge + 16 - PLAYER_WIDTH / 2;

    expect(follow(camera, state)).toEqual({ x: camera.x + 16, y: camera.y });
  });

  it('rounds to whole pixels, and a pixel is half a world unit at density two', () => {
    const state = world();
    const camera = { x: 0, y: LIMIT.y };

    // A third of a unit past the dead zone: the camera wants to be at 0.3.
    state.player.x = (VIEW_W + CAMERA_DEAD_ZONE.width) / 2 + 0.3 - PLAYER_WIDTH / 2;

    expect(follow(camera, state).x).toBe(0.5);
  });

  it('stands still against the right wall, however much further he is pushed', () => {
    const state = world();

    state.player.x = TILES_WIDE * TILE - PLAYER_WIDTH;

    const clamped = follow(restCamera(state.room), state);

    expect(clamped).toEqual({ x: LIMIT.x, y: LIMIT.y });
    // The delta of a clamped camera is zero: the frame does not move.
    expect(follow(clamped, state)).toEqual(clamped);

    state.player.x += 4 * TILE;

    expect(follow(clamped, state)).toEqual(clamped);
  });

  it('lifts to the top of the room when he climbs, and no further', () => {
    const state = world();

    state.player.y = TILE;

    expect(follow(restCamera(state.room), state)).toEqual({ x: 0, y: 0 });
  });
});
