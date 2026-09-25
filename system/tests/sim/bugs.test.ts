// The manifest reader (ADR-005). The manifest under test is the repository's
// own, so these hold whatever it lists — including the clean world of an empty
// list, which is what game/sim/bugs.ts has to survive.

import { describe, expect, it } from 'vitest';

import { bugForRoom, bugsForRoom, PLANTED_BUGS } from '../../game/sim';

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
