// What a prop draws is a pure function of its `hitTick`, its `active` flag and
// the tick the world stands on (rendering-and-look.md, Sprites), and so is
// where the creature's eyes are (bug-quest.md, the creature). Both are
// asserted here frame by frame; putting the frames on the screen needs a
// browser and is covered in tests/smoke/props.spec.ts.

import { describe, expect, it } from 'vitest';

import {
  CREATURE_BLINK,
  CREATURE_EYES,
  PROP_FPS,
  PROP_RUSTLE_TICKS,
  PROP_SHAKE,
} from '../../game/render/config';
import { eyesAt, eyesOpen, propFrame, propShake } from '../../game/render/props';
import type { WizardFrame } from '../../game/render/wizard';
import {
  PROP_SIZE,
  TICK_RATE,
  type Creature,
  type Prop,
  type PropKind,
  type WorldState,
} from '../../game/sim';
import { worldFrom } from '../sim/helpers';

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

/** A glade of one bush, with the wizard standing beside it. */
const GLADE = `
   B
  P
 ###
`;

/** A creature hiding in the world's first prop, which the map makes the bush. */
function hidingIn(at: Partial<Creature> = {}): WorldState {
  const state = worldFrom(GLADE, { creature: true });

  state.creature = {
    at: 0,
    travelTo: -1,
    travelUntil: -1,
    carriedSince: -1,
    firstCarried: false,
    ...at,
  };

  return state;
}

/** The wizard's cell, as game/render/wizard.ts measures it, at a known spot. */
const WIZARD: WizardFrame = {
  sheet: 'idle',
  frame: 0,
  cell: { x: 100, y: 50, w: 32, h: 32 },
  light: { x: 0, y: 0 },
};

describe('where the creature shows its eyes', () => {
  it('blinks them in the middle of the prop it hides in', () => {
    const state = hidingIn();
    const bush = state.props[0];

    expect(bush?.kind).toBe('bush');
    expect(eyesAt(state, WIZARD)).toEqual({
      x: (bush?.x ?? 0) + PROP_SIZE.bush.w / 2,
      y: (bush?.y ?? 0) + (PROP_SIZE.bush.h ?? 0) / 2,
    });
  });

  it('rides them on the hat while it is carried', () => {
    expect(eyesAt(hidingIn({ at: -1, carriedSince: 3 }), WIZARD)).toEqual({
      x: WIZARD.cell.x + WIZARD.cell.w / 2,
      y: WIZARD.cell.y + CREATURE_EYES.hat,
    });
  });

  it('draws nothing while it travels, and nothing in a world without one', () => {
    expect(eyesAt(hidingIn({ at: -1, travelTo: 0, travelUntil: 30 }), WIZARD)).toBeNull();
    expect(eyesAt(worldFrom(GLADE), WIZARD)).toBeNull();
  });

  it('shakes the eyes with the prop they hide in, so they keep looking out of it', () => {
    const state = hidingIn();
    const bush = state.props[0];

    if (bush === undefined) {
      throw new Error('the glade map must carry a bush for the creature to hide in');
    }

    const middle = bush.x + bush.w / 2;

    bush.hitTick = 0;
    state.tick = 0;
    expect(eyesAt(state, WIZARD)?.x).toBe(middle + PROP_SHAKE.units);
    state.tick = 1;
    expect(eyesAt(state, WIZARD)?.x).toBe(middle - PROP_SHAKE.units);
    // And back in the untouched middle once the four ticks are over.
    state.tick = PROP_SHAKE.ticks;
    expect(eyesAt(state, WIZARD)?.x).toBe(middle);
  });

  it('opens a run with its eyes open, and shuts them once a blink after that', () => {
    const open = Array.from({ length: CREATURE_BLINK.period }, (_, tick) => eyesOpen(tick));

    // The acceptance wants a screenshot of the eyes at the bush at the start,
    // so tick 0 has to be a frame with eyes in it.
    expect(open[0]).toBe(true);
    expect(open.filter((shown) => !shown)).toHaveLength(CREATURE_BLINK.shut);
    // The blink is the last few ticks of each period, and the next one opens.
    expect(eyesOpen(CREATURE_BLINK.period - 1)).toBe(false);
    expect(eyesOpen(CREATURE_BLINK.period)).toBe(true);
  });
});
