// What a run sounds like (docs/plan/03-assets/prompts/audio.md, and the
// atmosphere and audio brief). Four things are asserted here: that the table
// in game/render/audio.ts says what the brief says; that a replay read through
// it comes out as one sound per event, in the order the simulation emitted
// them, the same way every time; that a sound still ringing is not started
// over itself; that the waterfall loop follows the view and nothing else; and
// that the waterfall's volume follows the wizard's distance from it.
//
// Every one of them is a pure function of a tick or a camera, so none of it
// needs a browser. Actually making the noise does, and is covered in
// tests/smoke/audio.spec.ts.

import { describe, expect, it } from 'vitest';

import {
  createRepeatGate,
  EVENT_SOUNDS,
  AMBIENCE_LEVEL,
  AMBIENCE_SOUND,
  EFFECT_LEVEL,
  MASTER_LEVEL,
  REPEAT_GAP_TICKS,
  soundFor,
  soundsFor,
  WATERFALL_PEAK,
  WATERFALL_RANGE,
  waterfallGain,
  waterfallHeard,
  WATERFALL_SOUND,
} from '../../game/render/audio';
import { VIEW_W } from '../../game/render/config';
import { CONSUMERS } from '../../game/render/sprites';
import {
  CHARGE_COOLDOWN_TICKS,
  type InputFrame,
  PLAYER_WIDTH,
  type Prop,
  type WorldState,
} from '../../game/sim/index';
import { hold, recordEvents, worldFrom } from '../sim/helpers';

/**
 * The room the replay below is run in: a bush a charge away, the flag that
 * becomes a checkpoint, and the beacon the run ends at. No creature — the
 * frames are read straight by a wizard carrying none, and what a rider does to
 * them is game/sim/input-map.ts's business and not the main suite's
 * (AGENTS.md rule 5).
 */
const ROOM = `

  P  B        F        E
  ########################
`;

/** Stand, jump, charge through the bush, then run to the end of the room. */
const SCRIPT: readonly InputFrame[] = [
  ...hold({}, 4),
  ...hold({ jump: true }, 12),
  ...hold({}, 30),
  ...hold({ charge: true }, 1),
  ...hold({}, 30),
  ...hold({ right: true }, 200),
  ...hold({}, 120),
];

/**
 * What that replay emits, recorded off a run of it: a jump, the landing, the
 * charge and the nine ticks its crystal tip spends over the bush, the flag
 * raised, the beacon touched and the beacon lit.
 */
const EVENTS: readonly string[] = [
  'jump',
  'land',
  'charge',
  ...Array<string>(9).fill('charge:hit:bush'),
  'flag:raised',
  'victory',
  'beacon:lit',
];

/** What that replay sounds like: its events read through the mapping, in order. */
const SOUNDS: readonly string[] = [
  'audio/jump',
  'audio/land',
  'audio/charge',
  ...Array<string>(9).fill('audio/bush-rustle'),
  'audio/checkpoint',
  'audio/beacon-lit',
];

/** The events that script emits, run fresh every time it is asked for. */
function replay(): string[] {
  return recordEvents(worldFrom(ROOM), SCRIPT);
}

describe('the event mapping', () => {
  it('names a sound the kit built for every event it answers', () => {
    expect(CONSUMERS).toEqual(expect.arrayContaining(Object.values(EVENT_SOUNDS)));
  });

  it('is the whole of the audio the renderer loads, the two loops apart', () => {
    expect(CONSUMERS.filter((name) => name.startsWith('audio/')).sort()).toEqual(
      [...Object.values(EVENT_SOUNDS), WATERFALL_SOUND, AMBIENCE_SOUND, 'audio/charge-hit'].sort(),
    );
  });

  it('gives a charge hit on a prop with no voice of its own the plain thump', () => {
    expect(soundFor('charge:hit:bush')).toBe('audio/bush-rustle');
    expect(soundFor('charge:hit:beacon')).toBe('audio/charge-hit');
    expect(soundFor('charge:hit:waterfall')).toBe('audio/charge-hit');
  });

  it('leaves the death and the victory silent, and anything it has never heard of', () => {
    expect(soundFor('death')).toBeUndefined();
    expect(soundFor('victory')).toBeUndefined();
    expect(soundFor('something:new')).toBeUndefined();
  });
});

describe('a replay', () => {
  it('emits the events it was recorded emitting', () => {
    expect(replay()).toEqual(EVENTS);
  });

  it('plays one sound per event, in the order the events came, the silent ones apart', () => {
    expect(soundsFor(replay())).toEqual(SOUNDS);
    // The victory is the one event of the replay that makes nothing.
    expect(SOUNDS).toHaveLength(EVENTS.length - 1);
  });

  it('sounds the same the second time it is run', () => {
    expect(soundsFor(replay())).toEqual(soundsFor(replay()));
  });
});

describe('the balance', () => {
  it('lifts the quiet forest bed above its recording and brings the hot effects under theirs', () => {
    expect(AMBIENCE_LEVEL).toBeGreaterThan(1);
    expect(EFFECT_LEVEL).toBeLessThan(1);
    expect(EFFECT_LEVEL).toBeGreaterThan(WATERFALL_PEAK);
  });

  it('takes the whole mix down through one master level, well under unity', () => {
    // The owner found the mix far too loud twice over; the balance above is
    // kept and the one number scales everything on its way out, so the next
    // step either way is one edit. A quarter or less, and never off.
    expect(MASTER_LEVEL).toBeGreaterThan(0);
    expect(MASTER_LEVEL).toBeLessThanOrEqual(0.25);
    expect(AMBIENCE_LEVEL * MASTER_LEVEL).toBeLessThan(1);
  });
});

describe('a sound already ringing', () => {
  it('is not started a second time inside the gap, however many events ask', () => {
    const allows = createRepeatGate();
    // The nine ticks one charge spends over a bush, as the replay above emits
    // them: the first rustle plays and the eight behind it are dropped.
    const played = Array.from({ length: 9 }, (_, tick) => allows('audio/bush-rustle', tick));

    expect(played).toEqual([true, ...Array<boolean>(8).fill(false)]);
  });

  it('drops a second copy asked for on the very tick the first was', () => {
    const allows = createRepeatGate();

    expect(allows('audio/bush-rustle', 40)).toBe(true);
    expect(allows('audio/bush-rustle', 40)).toBe(false);
  });

  it('plays again once the gap has passed, and never holds another sound back', () => {
    const allows = createRepeatGate();

    expect(allows('audio/charge', 0)).toBe(true);
    // Its own repeat waits; a different sound on the same tick does not.
    expect(allows('audio/charge', REPEAT_GAP_TICKS - 1)).toBe(false);
    expect(allows('audio/land', REPEAT_GAP_TICKS - 1)).toBe(true);
    expect(allows('audio/charge', REPEAT_GAP_TICKS)).toBe(true);
  });

  it('holds nothing back from a fresh run, which starts over at tick 0', () => {
    const allows = createRepeatGate();

    expect(allows('audio/jump', 600)).toBe(true);
    // The restart key builds a new world; its tick 0 is not the old run's.
    expect(allows('audio/jump', 0)).toBe(true);
  });

  it('cannot swallow two charges, the tightest repeat the simulation allows', () => {
    expect(REPEAT_GAP_TICKS).toBeLessThan(CHARGE_COOLDOWN_TICKS);
  });
});

describe('the waterfall loop', () => {
  /** The same room as the replay above, with a fall standing in the middle. */
  const WATER_ROOM = `

  P      W      E
  ###############
`;

  /** The room's one waterfall, as the parser placed it. */
  function fall(state: WorldState): Prop {
    const water = state.props.find((prop) => prop.kind === 'waterfall');

    if (water === undefined) {
      throw new Error('the map above places a waterfall');
    }

    return water;
  }

  it('stays silent in a room that has no waterfall in it', () => {
    expect(waterfallHeard(worldFrom(ROOM), { x: 0, y: 0 })).toBe(false);
  });

  it('runs exactly while the view holds any part of the fall', () => {
    const state = worldFrom(WATER_ROOM);
    const water = fall(state);
    const y = water.y;

    // A view whose right edge has just reached the fall hears it; a pixel
    // further left and the fall is off screen (rendering-and-look.md: drawn,
    // and so heard, only when on screen).
    expect(waterfallHeard(state, { x: water.x - VIEW_W + 1, y })).toBe(true);
    expect(waterfallHeard(state, { x: water.x - VIEW_W, y })).toBe(false);

    // And the same at the other edge, as the view leaves it behind.
    expect(waterfallHeard(state, { x: water.x + water.w - 1, y })).toBe(true);
    expect(waterfallHeard(state, { x: water.x + water.w, y })).toBe(false);
  });

  it('does not care whether the sheet is parted; the water falls either way', () => {
    const state = worldFrom(WATER_ROOM);
    const water = fall(state);
    const camera = { x: water.x, y: water.y };

    expect(waterfallHeard(state, camera)).toBe(true);
    // `hitTick` is the whole record of a parting (game/render/waterfall.ts).
    water.hitTick = state.tick;
    expect(waterfallHeard(state, camera)).toBe(true);
  });
});

describe("the waterfall's volume", () => {
  /** A long room with the fall well inside it, so every distance below fits. */
  const LONG_ROOM = `

  P                                        W                                        E
  ###################################################################################
`;

  /** The room's one waterfall, as the parser placed it. */
  function fall(state: WorldState): Prop {
    const water = state.props.find((prop) => prop.kind === 'waterfall');

    if (water === undefined) {
      throw new Error('the map above places a waterfall');
    }

    return water;
  }

  /** The same room with the wizard's centre stood `dx` from the fall's left edge. */
  function stoodAt(dx: number): WorldState {
    const state = worldFrom(LONG_ROOM);

    state.player.x = fall(state).x + dx - PLAYER_WIDTH / 2;

    return state;
  }

  it('is nothing in a room that has no waterfall in it', () => {
    expect(waterfallGain(worldFrom(ROOM))).toBe(0);
  });

  it('peaks while the wizard is in the column, and the peak is well under full', () => {
    const state = stoodAt(0);

    expect(waterfallGain(state)).toBe(WATERFALL_PEAK);
    expect(waterfallGain(stoodAt(fall(state).w))).toBe(WATERFALL_PEAK);
    expect(WATERFALL_PEAK).toBeLessThan(0.5);
  });

  it('rises on the approach and falls away once the fall is passed, the same on either side', () => {
    const width = fall(stoodAt(0)).w;
    const near = WATERFALL_RANGE / 4;
    const far = WATERFALL_RANGE / 2;

    expect(waterfallGain(stoodAt(-far))).toBeLessThan(waterfallGain(stoodAt(-near)));
    expect(waterfallGain(stoodAt(-near))).toBeLessThan(waterfallGain(stoodAt(0)));
    expect(waterfallGain(stoodAt(width + near))).toBeLessThan(waterfallGain(stoodAt(width)));
    expect(waterfallGain(stoodAt(width + far))).toBeLessThan(waterfallGain(stoodAt(width + near)));

    // Walking away is the approach played backwards.
    expect(waterfallGain(stoodAt(width + near))).toBe(waterfallGain(stoodAt(-near)));
    expect(waterfallGain(stoodAt(-far))).toBeCloseTo(WATERFALL_PEAK / 2, 6);
  });

  it("has faded out entirely a view's width away, and stays out beyond it", () => {
    expect(waterfallGain(stoodAt(-WATERFALL_RANGE))).toBe(0);
    expect(waterfallGain(stoodAt(-WATERFALL_RANGE - 100))).toBe(0);
    expect(WATERFALL_RANGE).toBe(VIEW_W);
  });
});
