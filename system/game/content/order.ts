// The order the rooms of the level are played in
// (docs/plan/02-design/level-design.md). Rooms are added by adding a file to
// game/content/rooms/ and the glob there finds them (AGENTS.md rule 2); the
// order they are chained in is the one thing a glob cannot say, so it is said
// here, outside that glob, and nowhere else.
//
// `cliff-ruins` belongs at the end of this list and is missing because the
// room does not exist yet: it joins when HWP-042 builds it.

import type { LevelRoom } from '../sim';

import { rooms } from './rooms';

/** The rooms of the Forest level, first played to last. */
const ROOM_ORDER: readonly string[] = ['forest-glade', 'ruin-gate'];

/** The level as a run plays it: every room of the order, with its text map. */
export const LEVEL: readonly LevelRoom[] = ROOM_ORDER.map((name) => {
  const text = rooms[name];

  if (text === undefined) {
    throw new Error(`game/content/order.ts lists ${name}, which game/content/rooms/ has no module for`);
  }

  return { name, text };
});
