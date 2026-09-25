// The planted bugs as the simulation sees them (ADR-005,
// docs/plan/02-design/bug-quest.md). bugs/manifest.json is the one source and
// it is imported, not read at runtime, so the manifest of the branch being
// built decides which creatures the world has: a branch whose manifest no
// longer lists a bug previews the fixed world. tools/bugs/check.ts holds the
// other side of the pairing, the tests under bugs/tests/.

import manifest from '../../bugs/manifest.json' with { type: 'json' };
import type { PropKind } from './state';

/**
 * Where a room's creature hides: the three legend props it can sit in. The
 * list is the source and the type is read off it, so the manifest's `hides`
 * and the simulation's search for a hiding place cannot drift apart
 * (AGENTS.md rule 9).
 */
export const HIDING_PLACES = ['bush', 'log', 'rock'] as const satisfies readonly PropKind[];

/** One of the {@link HIDING_PLACES}. */
export type HidingPlace = (typeof HIDING_PLACES)[number];

/** One entry of bugs/manifest.json. */
export interface PlantedBug {
  /** `HW-` and three digits, stable forever. */
  id: string;
  title: string;
  symptom: string;
  /** A module-level hint for the player, never a file. */
  clue: string;
  /** The file that holds the real defect; the fix touches this file. */
  module: string;
  /** The paired test that fails while this entry exists. */
  test: string;
  /** The rooms whose creature carries the bug. */
  rooms: readonly string[];
  creature: { hides: HidingPlace };
  /** The reproduction the ticket carries, after "start a run in <room>". */
  steps: readonly string[];
  expected: string;
  /** The lines the waterfall shows. */
  logs: readonly string[];
}

/**
 * Every planted bug, in manifest order; empty means a clean world. TypeScript
 * reads the JSON literally, where `hides` is a string and an empty list has no
 * element type at all, so the interface above is what the schema means.
 */
export const PLANTED_BUGS = manifest.bugs as readonly PlantedBug[];

/** The bugs planted in a room, by the room's file name. */
export function bugsForRoom(room: string): readonly PlantedBug[] {
  return PLANTED_BUGS.filter((bug) => bug.rooms.includes(room));
}

/** The room's bug, or undefined in a clean room; one creature per room. */
export function bugForRoom(room: string): PlantedBug | undefined {
  return bugsForRoom(room)[0];
}
