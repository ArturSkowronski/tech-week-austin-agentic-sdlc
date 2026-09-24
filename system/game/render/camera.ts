// The camera (docs/plan/02-design/rendering-and-look.md, Camera). It follows
// the wizard through a small dead zone, is clamped to the room, and is rounded
// to whole pixels last, after the clamp — so the camera stands perfectly still
// at a room edge and the nearest-neighbour art never lands half a pixel over.

import { PLAYER_HEIGHT, PLAYER_WIDTH, TILE, type Room, type WorldState } from '../sim';

import { CAMERA_DEAD_ZONE, RENDER_DENSITY, VIEW_H, VIEW_W } from './config';

/** The top-left corner of the view, in world units. */
export interface Camera {
  readonly x: number;
  readonly y: number;
}

/** A coordinate on the whole pixels of the render texture (ADR-003). */
export function wholePixels(value: number): number {
  return Math.round(value * RENDER_DENSITY) / RENDER_DENSITY;
}

/** How far the camera may travel from the room's top-left corner. */
function limit(room: Room): { x: number; y: number } {
  return {
    x: Math.max(0, room.width * TILE - VIEW_W),
    y: Math.max(0, room.height * TILE - VIEW_H),
  };
}

/**
 * The camera at rest: the bottom-left corner of the room, where a run that has
 * not climbed anything sits. The layer stack is anchored to this one, so a
 * layer's bottom offset is read off the floor line as it is seen at rest.
 */
export function restCamera(room: Room): Camera {
  return { x: 0, y: limit(room).y };
}

/**
 * The room's main floor line, in world units: the ground the wizard starts on.
 * Every background layer hangs a fixed offset below it.
 */
export function floorLine(room: Room): number {
  return room.spawn.y + PLAYER_HEIGHT;
}

/**
 * One axis of the follow: the camera held in the band that keeps the point it
 * is watching inside the dead zone, which leaves it where it was as long as it
 * is already there.
 */
function drag(from: number, target: number, view: number, zone: number): number {
  const slack = (view - zone) / 2;

  return Math.min(Math.max(from, target - view + slack), target - slack);
}

/** A value held inside zero and a high bound. */
function clamp(value: number, high: number): number {
  return Math.min(Math.max(value, 0), high);
}

/**
 * The camera one frame on: the dead zone drags it after the wizard, the room
 * clamps it, and whole pixels come last. Against a room edge the clamp gives
 * back the camera it was handed, so the frame does not move at all.
 */
export function follow(camera: Camera, world: WorldState): Camera {
  const { player, room } = world;
  const bound = limit(room);

  return {
    x: wholePixels(
      clamp(drag(camera.x, player.x + PLAYER_WIDTH / 2, VIEW_W, CAMERA_DEAD_ZONE.width), bound.x),
    ),
    y: wholePixels(
      clamp(drag(camera.y, player.y + PLAYER_HEIGHT / 2, VIEW_H, CAMERA_DEAD_ZONE.height), bound.y),
    ),
  };
}
