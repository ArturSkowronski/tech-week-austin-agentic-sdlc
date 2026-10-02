// The events the simulation announces its own moments with, which is all the
// audio has to go on (docs/plan/02-design/simulation-architecture.md,
// `WorldState.events`; game/render/audio.ts).
//
// Every one of them is asserted from a replay rather than by calling the
// module that emits it: an event is a fact about a tick of a real run, and
// what could go wrong is it firing on the wrong tick or on more than one
// (AGENTS.md rule 1).

import { describe, expect, it } from 'vitest';

import { LAND_TICKS, NO_INPUT } from '../../game/sim/index';
import type { InputFrame } from '../../game/sim/index';
import { hold, recordEvents, run, worldFrom } from './helpers';

/** Flat ground with the wizard standing on it and room to run right. */
const FLAT = `

  P
  ####################
`;

/** The same ground with a bush, the creature's hiding place, a run away. */
const BUSH = `

  P    B
  ####################
`;

/** A second hiding place beyond the bush, so a creature driven out has one. */
const BUSH_AND_LOG = `

  P    B   L
  ####################
`;

const RIGHT: InputFrame = { ...NO_INPUT, right: true };
const CHARGE: InputFrame = { ...NO_INPUT, charge: true };

describe('the jump and the landing', () => {
  it('announces the jump on the tick the buffered press is spent, once', () => {
    expect(recordEvents(worldFrom(FLAT), hold({ jump: true }, 8))).toEqual(['jump']);
  });

  it('announces the landing once, and not again while he stands in it', () => {
    // Long enough to leave the ground, come down and spend the whole `land`
    // state standing still, which is where a second landing would show.
    const heard = recordEvents(worldFrom(FLAT), [
      ...hold({ jump: true }, 10),
      ...hold({}, 60 + LAND_TICKS),
    ]);

    expect(heard.filter((event) => event === 'land')).toEqual(['land']);
  });

  it('says nothing about landing for a wizard who never left the ground', () => {
    expect(recordEvents(worldFrom(FLAT), hold(RIGHT, 30))).toEqual([]);
  });
});

describe('the creature', () => {
  it('announces the catch when it climbs onto the hat, once', () => {
    const world = worldFrom(BUSH, { creature: true });
    const heard = recordEvents(world, hold(RIGHT, 60));

    expect(heard.filter((event) => event.startsWith('creature:'))).toEqual(['creature:caught']);
    expect(world.creature?.carriedSince).toBeGreaterThan(0);
  });

  it('announces the pop-out when a charge hit sends it away', () => {
    const world = worldFrom(BUSH_AND_LOG, { creature: true });

    // Up to the bush without touching it, then the charge that empties it.
    run(world, hold(RIGHT, 12));

    expect(recordEvents(world, [...hold(CHARGE, 1), ...hold({}, 30)])).toContain('creature:out');
  });

  it('says nothing when the charge hit leaves it nowhere else to go', () => {
    const alone = worldFrom(BUSH, { creature: true });

    expect(recordEvents(alone, [...hold(CHARGE, 1), ...hold({}, 30)])).not.toContain('creature:out');
  });
});

describe('a replay', () => {
  it('announces the same events the second time it is run', () => {
    const frames = [...hold({ jump: true }, 10), ...hold(RIGHT, 40), ...hold(CHARGE, 1), ...hold(RIGHT, 40)];

    expect(recordEvents(worldFrom(BUSH), frames)).toEqual(recordEvents(worldFrom(BUSH), frames));
  });
});
