// The atmosphere pass is a function, not a state (HWP-060): every speck of
// every field comes out of the tick and of a seed taken from the room's name,
// so two runs of the same room draw the same particles on the same tick and a
// replay replays. Drawing them on the screen needs a browser and is covered in
// tests/smoke/particles.spec.ts.

import { describe, expect, it } from 'vitest';

import { rooms } from '../../game/content/rooms/index';
import { floorLine } from '../../game/render/camera';
import { FIREFLIES, MIST_BANDS, MOTES, SPORES, VIEW_W } from '../../game/render/config';
import {
  fireflies,
  mist,
  motes,
  pass,
  roomSeed,
  spores,
  type Speck,
} from '../../game/render/particles';
import { createWorld, type Prop, type WorldState } from '../../game/sim';
import { hold, run } from '../sim/helpers';

/** One of the shipped rooms, at the tick it starts on. */
function room(name: string): WorldState {
  const text = rooms[name];

  if (text === undefined) throw new Error(`the rooms glob has no ${name}`);

  return createWorld(text, { roomName: name });
}

const GLADE = room('forest-glade');

/** A second name to lay a field out from; Season 1 ships one room (ADR-009). */
const OTHER_NAME = 'a-different-name';

const SEED = roomSeed(GLADE.roomName);

/** The bushes the spores come off, and the water the mist lies over. */
const bushes = GLADE.props.filter((prop) => prop.kind === 'bush');
const water = GLADE.props.filter((prop) => prop.kind === 'waterfall');

/**
 * Specks the whole pass may draw in one frame of a shipped room. The frame
 * rate of the acceptance was measured with this many on the screen, so a field
 * that grows past it has to be measured again rather than simply allowed.
 */
const BUDGET = 80;

/** Every speck of one pass, as one list. */
function every(state: WorldState): Speck[] {
  return Object.values(pass(state)).flat();
}

/** One run of the glade, walking right for this many ticks. */
function walked(ticks: number): WorldState {
  return run(room('forest-glade'), hold({ right: true }, ticks));
}

/**
 * How far apart two specks that stand side by side along one measure are
 * along another, averaged over the field.
 *
 * This is the shape of the whole field in one number. A field whose specks
 * take both of their fractions from one walk under two names draws a line:
 * a speck's neighbour along the line is its neighbour across the band as
 * well, and the average comes out at the band divided by the count. A field
 * whose fractions are unrelated puts that neighbour anywhere in the band,
 * and the average comes out at roughly a third of it.
 */
function apart<T>(items: readonly T[], along: (of: T) => number, across: (of: T) => number): number {
  const sorted = [...items].sort((one, other) => along(one) - along(other));
  let total = 0;

  for (let at = 1; at < sorted.length; at += 1) {
    total += Math.abs(across(sorted[at] as T) - across(sorted[at - 1] as T));
  }

  return total / (sorted.length - 1);
}

/** The gaps around the ring the motes turn on, smallest angle first. */
function ring(tick: number): number[] {
  const angles = motes(tick, SEED)
    .map((speck) => Math.atan2(speck.y / MOTES.flatten, speck.x))
    .sort((one, other) => one - other);

  return angles.map((angle, at) =>
    at === 0 ? angle - ((angles.at(-1) as number) - 2 * Math.PI) : angle - (angles[at - 1] as number),
  );
}

/** The first of a list the room is expected to carry. */
function first(props: readonly Prop[], kind: string): Prop {
  const prop = props[0];

  if (prop === undefined) throw new Error(`the shipped rooms must carry a ${kind}`);

  return prop;
}

describe('the seed a room lays its fields out from', () => {
  it('is a fraction, and the same one every time the room is asked for', () => {
    expect(SEED).toBeGreaterThanOrEqual(0);
    expect(SEED).toBeLessThan(1);
    expect(roomSeed('forest-glade')).toBe(SEED);
  });

  it('is a different one for a different name', () => {
    expect(roomSeed(OTHER_NAME)).not.toBe(SEED);
  });
});

describe('the atmosphere pass', () => {
  it('draws the same particles on the same tick of two runs of one room', () => {
    expect(every(walked(240))).toEqual(every(walked(240)));
  });

  it('draws something for every field the shipped rooms have', () => {
    expect(fireflies(0, SEED)).toHaveLength(FIREFLIES.count);
    expect(motes(0, SEED)).toHaveLength(MOTES.count);
    expect(bushes.length).toBeGreaterThan(0);
    expect(spores(0, SEED, bushes)).toHaveLength(bushes.length * SPORES.count);
    expect(water.length).toBeGreaterThan(0);
    // The run along the room's floor line, and bands over each water column.
    expect(mist(0, SEED, GLADE.room, water).length).toBeGreaterThan(2);
  });

  it('moves every field on as the tick does', () => {
    expect(fireflies(90, SEED)).not.toEqual(fireflies(0, SEED));
    expect(motes(90, SEED)).not.toEqual(motes(0, SEED));
    expect(spores(90, SEED, bushes)).not.toEqual(spores(0, SEED, bushes));
    expect(mist(90, SEED, GLADE.room, [])).not.toEqual(mist(0, SEED, GLADE.room, []));
  });

  it('lays the same tick out differently under another room name', () => {
    const glade = walked(120);

    expect(every({ ...glade, roomName: OTHER_NAME })).not.toEqual(every(glade));
  });

  it('keeps every shipped room inside the budget the frame rate was measured at', () => {
    for (const name of Object.keys(rooms)) {
      expect(every(room(name)).length, name).toBeLessThanOrEqual(BUDGET);
    }
  });
});

describe('the fractions a speck owns', () => {
  // The fields need more than one fraction of an index — where a speck
  // stands, how far across its band it lies, how fast it goes, when it glows
  // — and a second walk of `spread` cannot give them: `spread(i, s + k)` is
  // `spread(i, s) + k` for every `i`, so the two are one walk under two
  // names and every field laid out from both comes out as a line. These are
  // the claims that say the fields are scatters.

  it('scatters the fireflies across their band instead of laying them along a line', () => {
    for (const seed of [SEED, roomSeed(OTHER_NAME)]) {
      for (const tick of [0, 45, 300, 900, 5400]) {
        // A sixth of the band. Twenty-two specks laid along a line sit a
        // twenty-second of it apart; a scatter is an order above that.
        expect(apart(fireflies(tick, seed), (speck) => speck.x, (speck) => speck.y)).toBeGreaterThan(
          FIREFLIES.band / 6,
        );
      }
    }
  });

  it('gives every firefly its own glow, so no two blink together', () => {
    for (const tick of [0, 45, 300, 900, 5400]) {
      expect(
        apart(fireflies(tick, SEED), (speck) => speck.x, (speck) => speck.alpha),
      ).toBeGreaterThan(FIREFLIES.alpha / 6);
    }
  });

  it('turns every mote at its own rate, so the ring is never the ring it was', () => {
    const rest = ring(0);

    // A field that took one period for all of it would hold whatever ring it
    // started in and merely turn it, so every gap would come back unchanged
    // — exactly so on a whole number of turns.
    for (const tick of [120, 600, 1200]) {
      const turned = ring(tick);
      const moved = turned.map((gap, at) => Math.abs(gap - (rest[at] as number)));

      expect(Math.max(...moved)).toBeGreaterThan(0.5);
    }
  });
});

describe('the fireflies among the trunks', () => {
  // They are drawn in among the tall forest (game/render/scene.ts), which
  // moves under the camera by its own parallax factor, and the band is one
  // view wide and does not tile — so the travel is folded into the band's own
  // wrap rather than added to the layer's position.

  it('keeps the band full however far the trunks have travelled', () => {
    for (const travelled of [-960, -137, 0, 42, 288, 5000]) {
      const drifting = fireflies(300, SEED, travelled);

      expect(drifting).toHaveLength(FIREFLIES.count);

      for (const speck of drifting) {
        expect(speck.x).toBeGreaterThanOrEqual(0);
        expect(speck.x).toBeLessThan(VIEW_W);
      }
    }
  });

  it('carries every firefly by the travel and brings it back in at the far edge', () => {
    const still = fireflies(300, SEED);

    for (const travelled of [-960, 42, 288]) {
      const drifting = fireflies(300, SEED, travelled);

      for (const [at, speck] of drifting.entries()) {
        const from = (still[at] as Speck).x;

        expect(speck.x).toBeCloseTo((((from - travelled) % VIEW_W) + VIEW_W) % VIEW_W, 6);
      }
    }
  });

  it('is back where it started after a whole view of travel', () => {
    const round = fireflies(300, SEED, VIEW_W);

    for (const [at, speck] of fireflies(300, SEED, 0).entries()) {
      expect((round[at] as Speck).x).toBeCloseTo(speck.x, 6);
    }
  });
});

describe('the fields of the pass', () => {
  it('keeps the fireflies in the band of the view they drift across', () => {
    for (const tick of [0, 45, 900, 5400]) {
      for (const speck of fireflies(tick, SEED)) {
        expect(speck.x).toBeGreaterThanOrEqual(0);
        expect(speck.x).toBeLessThan(VIEW_W);
        expect(speck.y).toBeGreaterThanOrEqual(FIREFLIES.top);
        expect(speck.y).toBeLessThanOrEqual(FIREFLIES.top + FIREFLIES.band + FIREFLIES.bob);
        expect(speck.alpha).toBeGreaterThanOrEqual(0);
        expect(speck.alpha).toBeLessThanOrEqual(FIREFLIES.alpha);
      }
    }
  });

  it('turns the motes inside the reach of the wand light they are dust in', () => {
    for (const tick of [0, 60, 240, 1000]) {
      for (const speck of motes(tick, SEED)) {
        expect(Math.hypot(speck.x, speck.y)).toBeLessThanOrEqual(MOTES.radius);
      }
    }
  });

  it('fades a spore in at the leaves and out again at the top of its climb', () => {
    const bush = first(bushes, 'bush');
    const ends: number[] = [];
    const middles: number[] = [];

    // One spore's whole climb, sampled across it. A spore that began at its
    // brightest would pop into existence at the lip of the bush every time it
    // started again, which is the one thing the fireflies and the mist both
    // use their own fade to avoid.
    for (let tick = 0; tick < SPORES.rise / SPORES.speed; tick += 1) {
      const speck = spores(tick, SEED, [bush])[0] as Speck;
      const share = (bush.y - speck.y) / SPORES.rise;

      if (share < 0.02 || share > 0.98) ends.push(speck.alpha);
      if (share > 0.45 && share < 0.55) middles.push(speck.alpha);
    }

    expect(ends.length).toBeGreaterThan(0);
    expect(Math.max(...ends)).toBeLessThan(SPORES.alpha * 0.1);
    expect(middles.length).toBeGreaterThan(0);
    expect(Math.min(...middles)).toBeGreaterThan(SPORES.alpha * 0.9);
  });

  it('climbs the spores out of the bush they came off and starts them again', () => {
    const bush = first(bushes, 'bush');

    for (const tick of [0, 100, 500, 2000]) {
      for (const speck of spores(tick, SEED, [bush])) {
        expect(speck.y).toBeLessThanOrEqual(bush.y);
        expect(speck.y).toBeGreaterThan(bush.y - SPORES.rise);
        expect(speck.x).toBeGreaterThan(bush.x - SPORES.sway);
        expect(speck.x).toBeLessThan(bush.x + bush.w + SPORES.sway);
      }
    }
  });

  it('lays the mist along the floor line and over the lip of the water', () => {
    const column = first(water, 'waterfall');
    const floor = floorLine(GLADE.room);
    const drawn = mist(300, SEED, GLADE.room, [column]);
    const over = drawn.filter((speck) => speck.y < column.y);
    const along = drawn.filter((speck) => speck.y >= column.y);

    expect(over).toHaveLength(2);
    expect(along.length).toBeGreaterThan(0);

    for (const speck of drawn) {
      expect(speck.h).toBe(MIST_BANDS.height);
      expect(speck.alpha).toBeLessThanOrEqual(MIST_BANDS.alpha);
    }

    // The run along the floor lies just above the line, never through it.
    for (const speck of along) {
      expect(speck.y + speck.h).toBeLessThanOrEqual(floor);
      expect(speck.y).toBeGreaterThanOrEqual(floor - MIST_BANDS.lift - MIST_BANDS.height);
    }
  });
});
