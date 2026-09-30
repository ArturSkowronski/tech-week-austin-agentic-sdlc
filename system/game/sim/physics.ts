// Swept AABB collision against the tile grid
// (docs/plan/02-design/movement-and-physics.md): one axis at a time, X then Y,
// in 1-unit steps, so nothing crosses a tile without being asked about it.
//
// moveBox reports contacts instead of changing speed. Zeroing upward speed on a
// ceiling bump and downward speed on a landing needs a Player, and the player
// belongs to game/sim/player.ts; here a contact is a flag on the result.

import { TILE } from './constants';
import { blocksSideways, Tile, tileAt, type Room } from './state';

/** An axis-aligned box in world units; `x` and `y` are its top-left corner. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where a swept box ended up, and what it met on the way. */
export interface MoveResult {
  x: number;
  y: number;
  hitLeft: boolean;
  hitRight: boolean;
  hitTop: boolean;
  hitBottom: boolean;
  /** The box ends on a spike. Reporting is all this does; the caller kills. */
  hazard: boolean;
}

/** How far one sweep step carries the box, in world units. */
const STEP = 1;

/** Every tile coordinate the box covers, rows top to bottom. */
function* coveredTiles(box: Box): Generator<{ tx: number; ty: number }> {
  const lastX = Math.ceil((box.x + box.w) / TILE) - 1;
  const lastY = Math.ceil((box.y + box.h) / TILE) - 1;

  for (let ty = Math.floor(box.y / TILE); ty <= lastY; ty += 1) {
    for (let tx = Math.floor(box.x / TILE); tx <= lastX; tx += 1) {
      yield { tx, ty };
    }
  }
}

/**
 * The height a one-way tile's surface sits at, or null for any other tile.
 * `=` is the same platform with its surface half a tile down, for ledges a
 * painting draws mid-tile (docs/plan/02-design/level-design.md).
 */
function oneWaySurface(tile: Tile, ty: number): number | null {
  if (tile === Tile.OneWay) {
    return ty * TILE;
  }

  if (tile === Tile.OneWayHalf) {
    return ty * TILE + TILE / 2;
  }

  return null;
}

/**
 * The x the box must stop at to clear what blocks it sideways, or null. The
 * columns outside the room block, so the sides of every room are walls; see
 * `blocksSideways` in game/sim/state.ts for why.
 */
function wallFace(room: Room, box: Box, dir: number): number | null {
  for (const { tx, ty } of coveredTiles(box)) {
    if (blocksSideways(room, tx, ty)) {
      return dir > 0 ? tx * TILE - box.w : (tx + 1) * TILE;
    }
  }

  return null;
}

/**
 * The y the box must stop at, or null. Solid tiles block either way; a one-way
 * catches only a box moving down whose bottom was above its surface, so from
 * below and from the side it is air.
 */
function floorFace(room: Room, box: Box, dir: number, bottomBefore: number): number | null {
  for (const { tx, ty } of coveredTiles(box)) {
    const tile = tileAt(room, tx, ty);

    if (tile === Tile.Solid) {
      return dir > 0 ? ty * TILE - box.h : (ty + 1) * TILE;
    }

    if (dir > 0) {
      const surface = oneWaySurface(tile, ty);

      if (surface !== null && bottomBefore <= surface && box.y + box.h > surface) {
        return surface - box.h;
      }
    }
  }

  return null;
}

function onSpike(room: Room, box: Box): boolean {
  for (const { tx, ty } of coveredTiles(box)) {
    if (tileAt(room, tx, ty) === Tile.Spike) {
      return true;
    }
  }

  return false;
}

/**
 * Walk one axis in 1-unit steps until `faceAt` names a face to stop at, given
 * the coordinate the step would reach and the one it came from.
 */
function sweep(
  from: number,
  delta: number,
  faceAt: (at: number, before: number, dir: number) => number | null,
): { at: number; hit: boolean } {
  const dir = Math.sign(delta);
  let at = from;

  for (let left = Math.abs(delta); left > 0; left -= STEP) {
    const next = at + dir * Math.min(STEP, left);
    const face = faceAt(next, at, dir);

    if (face !== null) {
      return { at: face, hit: true };
    }

    at = next;
  }

  return { at, hit: false };
}

/**
 * Move a box through the room by `dx` then `dy`, sliding along whatever stops
 * it. The box is expected to start clear of every solid tile and inside the
 * room's columns, which is what a box moved only through this function always
 * is. A box that starts on a wall is pushed further into it, not back out.
 */
export function moveBox(room: Room, box: Box, dx: number, dy: number): MoveResult {
  const swept = sweep(box.x, dx, (at, _before, dir) => wallFace(room, { ...box, x: at }, dir));
  const moved: Box = { ...box, x: swept.at };
  const dropped = sweep(moved.y, dy, (at, before, dir) =>
    floorFace(room, { ...moved, y: at }, dir, before + moved.h),
  );

  return {
    x: swept.at,
    y: dropped.at,
    hitLeft: swept.hit && dx < 0,
    hitRight: swept.hit && dx > 0,
    hitTop: dropped.hit && dy < 0,
    hitBottom: dropped.hit && dy > 0,
    hazard: onSpike(room, { ...moved, y: dropped.at }),
  };
}
