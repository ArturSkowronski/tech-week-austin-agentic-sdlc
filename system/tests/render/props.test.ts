// What a prop draws is a pure function of its `hitTick`, its `active` flag and
// the tick the world stands on (rendering-and-look.md, Sprites). It is
// asserted here frame by frame; putting the frames on the screen needs a
// browser and is covered in tests/smoke/props.spec.ts. Where the creature
// stands among them, and what it is drawn as once it is there, went to
// tests/render/creature.test.ts with HWP-061.

import { describe, expect, it } from 'vitest';

import { PROP_FPS, PROP_RUSTLE_TICKS } from '../../game/render/config';
import { propFrame, propShake } from '../../game/render/props';
import { PROP_SIZE, TICK_RATE, type Prop, type PropKind } from '../../game/sim';

/**
 * Frames each strip holds, as asset-list.md's props table gives them —
 * including the lantern's and the mushrooms' loops, which nobody has
 * generated yet. The waterfall has no strip at all: it is drawn in code.
 */
const FRAMES: Readonly<Record<PropKind, number>> = {
  bush: 3,
  log: 3,
  rock: 5,
  flag: 5,
  beacon: 5,
  torch: 1,
  lantern: 4,
  mushrooms: 2,
  waterfall: 0,
};

/** Ticks one frame of a prop animation is held for. */
const HOLD = TICK_RATE / PROP_FPS;

/** `HOLD` ticks of one frame, which is how every run below is written. */
function held(frame: number): number[] {
  return Array<number>(HOLD).fill(frame);
}

/** A prop of one kind, untouched, at the origin. */
function propOf(kind: PropKind, at: Partial<Prop> = {}): Prop {
  const { w, h } = PROP_SIZE[kind];

  return { id: 0, kind, x: 0, y: 0, w, h: h ?? 0, hitTick: -1, active: false, ...at };
}

/** The frames a prop shows over the `ticks` ticks from the tick it was hit. */
function over(ticks: number, prop: Prop): number[] {
  return Array.from({ length: ticks }, (_, tick) =>
    propFrame(prop, Math.max(prop.hitTick, 0) + tick, FRAMES[prop.kind]),
  );
}

describe('the frame a prop shows', () => {
  it('leaves an untouched prop on its idle frame', () => {
    for (const kind of ['bush', 'log', 'rock', 'flag', 'beacon'] as const) {
      expect(new Set(over(90, propOf(kind))), kind).toEqual(new Set([0]));
    }
  });

  it('rustles the bush and chatters the log for 24 ticks after a hit', () => {
    for (const kind of ['bush', 'log'] as const) {
      const shown = over(PROP_RUSTLE_TICKS + HOLD, propOf(kind, { hitTick: 40 }));

      expect(shown.slice(0, PROP_RUSTLE_TICKS), kind).toEqual([
        ...held(1),
        ...held(2),
        ...held(1),
        ...held(2),
      ]);
      // And it is still again once the rustle is over.
      expect(new Set(shown.slice(PROP_RUSTLE_TICKS)), kind).toEqual(new Set([0]));
    }
  });

  it('cracks the rock open a frame at a time and leaves it open', () => {
    const shown = over(TICK_RATE * 2, propOf('rock', { hitTick: 0, active: true }));

    expect(shown.slice(0, 4 * HOLD)).toEqual([...held(1), ...held(2), ...held(3), ...held(4)]);
    expect(new Set(shown.slice(4 * HOLD))).toEqual(new Set([4]));
  });

  it('raises the flag and lights the beacon, then loops their last two frames', () => {
    for (const kind of ['flag', 'beacon'] as const) {
      const shown = over(TICK_RATE * 2, propOf(kind, { hitTick: 12, active: true }));

      // The one-shot: the two frames between the idle one and the loop.
      expect(shown.slice(0, 2 * HOLD), kind).toEqual([...held(1), ...held(2)]);
      // Then the two it waves or burns on, for as long as the run lasts.
      expect(shown.slice(2 * HOLD, 4 * HOLD), kind).toEqual([...held(3), ...held(4)]);
      expect(new Set(shown.slice(4 * HOLD)), kind).toEqual(new Set([3, 4]));
      // A flag the wizard has not raised is down, whatever the tick says.
      expect(new Set(over(90, propOf(kind, { hitTick: 12 }))), kind).toEqual(new Set([0]));
    }
  });

  it('loops whatever frames a torch, a lantern or some mushrooms have', () => {
    // The torch is one static frame; the lantern is the four-frame loop
    // asset-list.md has yet to generate, and neither is ever hit.
    expect(new Set(over(TICK_RATE, propOf('torch')))).toEqual(new Set([0]));
    expect(over(4 * HOLD + 1, propOf('lantern'))).toEqual([
      ...held(0),
      ...held(1),
      ...held(2),
      ...held(3),
      0,
    ]);
  });

  it('answers the same frame for the same prop and tick, twice over', () => {
    const props = (['bush', 'log', 'rock', 'flag', 'beacon'] as const).map((kind) =>
      propOf(kind, { hitTick: 5, active: true }),
    );
    const frames = (): string[] =>
      props.flatMap((prop) =>
        Array.from(
          { length: 90 },
          (_, tick) => `${prop.kind}:${propFrame(prop, tick, FRAMES[prop.kind])}`,
        ),
      );

    expect(frames()).toEqual(frames());
    // And they are not all sitting on one frame, so the comparison means something.
    expect(new Set(frames()).size).toBeGreaterThan(10);
  });
});

describe('the shake a hit gives a prop', () => {
  it('knocks it a unit each way for four ticks and then stops', () => {
    const bush = propOf('bush', { hitTick: 30 });

    expect(Array.from({ length: 6 }, (_, tick) => propShake(bush, 30 + tick))).toEqual([
      1, -1, 1, -1, 0, 0,
    ]);
  });

  it('leaves a prop nothing has touched where it stands', () => {
    expect(propShake(propOf('rock'), 0)).toBe(0);
  });
});
