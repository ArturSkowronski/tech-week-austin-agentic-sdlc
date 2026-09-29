// The manifest reader (ADR-005). The manifest under test is the repository's
// own, so these hold whatever it lists — including the clean world of an empty
// list, which is what game/sim/bugs.ts has to survive.
//
// The last suite is that empty list for real: the world heals per branch, so
// the manifest is emptied the way a branch that has just fixed the last bug
// empties it, and the simulation is read again under it. The mock is asked
// for inside the test rather than hoisted over the file, because the suites
// above it read the manifest the branch really ships.

import { describe, expect, it, vi } from 'vitest';

import forestGlade from '../../game/content/rooms/forest-glade';
import { bugForRoom, bugsForRoom, PLANTED_BUGS } from '../../game/sim';

/** The room game/main.ts opens on, and the one the healed branch walks. */
const OPENING_ROOM = 'forest-glade';

/**
 * The simulation of a branch whose bugs/manifest.json lists nothing. The
 * manifest is imported and bundled, not read at runtime, so an emptied one is
 * another module graph (ADR-005, the world heals per branch): it is mocked
 * here and game/sim read again under the mock, which is what such a branch
 * builds and what its preview shows.
 */
async function healedSim(): Promise<typeof import('../../game/sim')> {
  vi.resetModules();
  vi.doMock('../../bugs/manifest.json', () => ({ default: { bugs: [] } }));

  return await import('../../game/sim');
}

describe('the planted bugs of the manifest', () => {
  it('gives every bug an id of HW- and three digits', () => {
    for (const bug of PLANTED_BUGS) {
      expect(bug.id).toMatch(/^HW-\d{3}$/);
    }
  });

  it('finds a bug in each of the rooms it names', () => {
    for (const bug of PLANTED_BUGS) {
      for (const room of bug.rooms) {
        expect(bugsForRoom(room)).toContain(bug);
        expect(bugForRoom(room)).toBeDefined();
      }
    }
  });

  it('leaves a room no entry names clean', () => {
    expect(bugsForRoom('no-such-room')).toEqual([]);
    expect(bugForRoom('no-such-room')).toBeUndefined();
  });
});

describe('a branch whose manifest lists nothing', () => {
  it('finds no bug in any room, whatever the repository plants today', async () => {
    const healed = await healedSim();

    expect(healed.PLANTED_BUGS).toEqual([]);

    for (const room of [OPENING_ROOM, ...PLANTED_BUGS.flatMap((bug) => bug.rooms)]) {
      expect(healed.bugsForRoom(room)).toEqual([]);
      expect(healed.bugForRoom(room)).toBeUndefined();
    }
  });

  it('opens the room with no creature, and never grows one', async () => {
    const healed = await healedSim();
    // What game/main.ts builds its world with: the manifest is what decides
    // whether the room has a creature at all.
    const world = healed.createWorld(forestGlade, {
      roomName: OPENING_ROOM,
      creature: healed.bugForRoom(OPENING_ROOM) !== undefined,
    });
    const walkRight = { ...healed.NO_INPUT, right: true };

    expect(world.creature).toBeNull();

    // Long enough for a creature to have been walked into, ridden along, let
    // go and reached a hiding place again, had the room held one. Nothing
    // hides anywhere: -1 is the prop game/render/props.ts asks for before it
    // draws the eyes, and no creature at all has none either.
    const forever = healed.CREATURE_CARRY_TICKS + healed.CREATURE_TRAVEL_TICKS;

    for (let step = 0; step < forever; step += 1) {
      healed.tick(world, walkRight);
      expect(world.creature?.at ?? -1).toBe(-1);
    }
  });
});
