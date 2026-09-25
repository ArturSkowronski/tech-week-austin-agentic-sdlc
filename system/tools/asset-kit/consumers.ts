// Who consumes one of the kit's outputs (docs/plan/03-assets/pipeline.md,
// invariants): the renderer, which names what it loads in
// game/render/sprites.ts, or a room, which consumes its own painting.
// build.ts fails the build on an output neither answers for and report.ts
// prints the answers, so the rule is written here once rather than on both
// sides of it.

import { readdir } from 'node:fs/promises';

import { CONSUMERS } from '../../game/render/sprites';

/** The rooms, one file each, as the trace tool and the dev server know them. */
const ROOMS = 'game/content/rooms';

/**
 * Every room, by name. game/content/rooms/index.ts keys the rooms off a Vite
 * glob of this directory, which a plain script cannot run, so the directory
 * itself is read instead — and it is the right list to read: a room is what
 * gives a painting a consumer, and checking the paintings against the kit's
 * own table of them would be the kit marking its own homework.
 */
export async function roomNames(): Promise<string[]> {
  const files = await readdir(ROOMS);

  return files.filter((file) => file.endsWith('.ts') && file !== 'index.ts').map((file) => file.slice(0, -'.ts'.length));
}

/** What loads this output, or nothing when the name is no one's. */
export function consumerOf(name: string, rooms: readonly string[]): string | undefined {
  if (CONSUMERS.includes(name)) return 'game/render/sprites.ts';

  const room = rooms.find((room) => name === `paintings/${room}`);

  return room === undefined ? undefined : `${ROOMS}/${room}.ts`;
}
