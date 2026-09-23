// The determinism guarantee the whole simulation rests on
// (docs/plan/02-design/simulation-architecture.md): same map, same seed, same
// frames, same world — and a random sequence that belongs to the seed.

import { describe, expect, it } from 'vitest';
import { createWorld, nextRandom, NO_INPUT, tick } from '../../game/sim/index';
import { hold, run, worldFrom } from './helpers';

const ROOM = `
  #                      #
  #                      #
  #        P             #
  #      ####            #
  #                 ---  #
  #            ^^        #
  ########################
`;

/** 600 frames of a walk, a jump, a charge and a pause, always in this order. */
const SCRIPT = [
  ...hold({ right: true }, 120),
  ...hold({ right: true, jump: true }, 30),
  ...hold({ jump: true }, 30),
  ...hold({ left: true }, 120),
  ...hold({ left: true, charge: true }, 20),
  ...hold({ down: true }, 80),
  ...hold({}, 200),
];

describe('the world is deterministic', () => {
  it('steps two worlds from the same map and seed to the same state', () => {
    const a = worldFrom(ROOM, { seed: 7, roomName: 'test-room', creature: true });
    const b = worldFrom(ROOM, { seed: 7, roomName: 'test-room', creature: true });

    expect(SCRIPT).toHaveLength(600);

    run(a, SCRIPT);
    run(b, SCRIPT);

    expect(a).toEqual(b);
    expect(a.tick).toBe(600);
  });

  it('keeps the tick bookkeeping the renderer and the audio rely on', () => {
    const state = worldFrom(ROOM, { seed: 7 });
    const frame = { ...NO_INPUT, right: true };

    state.events.push('stale');
    tick(state, frame);

    expect(state.tick).toBe(1);
    expect(state.events).toEqual([]);
    expect(state.lastInput).toEqual(frame);
  });
});

describe('nextRandom', () => {
  // Recorded from the xorshift32 in game/sim/state.ts: these five numbers are
  // what seed 1 means. They change only if the generator changes, which is a
  // decision, not a tweak.
  const SEED_ONE = [
    0.00006295018829405308, 0.015747428173199296, 0.6164041024167091,
    0.07161863497458398, 0.5584883580449969,
  ];

  it('produces the recorded sequence for seed 1', () => {
    const state = createWorld('#', { seed: 1 });
    const drawn = Array.from({ length: SEED_ONE.length }, () => nextRandom(state));

    expect(drawn).toEqual(SEED_ONE);
  });

  it('draws fractions below one and moves the generator word on', () => {
    const state = createWorld('#', { seed: 1 });
    const before = state.rng;
    const value = nextRandom(state);

    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
    expect(state.rng).not.toBe(before);
  });
});
