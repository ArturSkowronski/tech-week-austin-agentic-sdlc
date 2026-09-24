// What the waterfall draws is a pure function of the world's tick and of the
// prop's own `hitTick` (docs/plan/02-design/rendering-and-look.md, the
// waterfall): how far the water has parted, how fast each column of log text
// falls, which lines it shows and whether the prop is on screen at all. The
// pixels themselves need a browser and are covered in
// tests/smoke/waterfall.spec.ts.

import { describe, expect, it } from 'vitest';

import forestGlade from '../../game/content/rooms/forest-glade';
import {
  LOG_FALL_SPEED,
  LOG_TEXT,
  RENDER_DENSITY,
  VIEW_H,
  VIEW_W,
  WATER_PARTED_TICKS,
  WATER_STREAK_SPEED,
  WATERFALL,
} from '../../game/render/config';
import {
  fallen,
  flickering,
  glyphOf,
  logLines,
  onScreen,
  parted,
  speedOf,
  spread,
} from '../../game/render/waterfall';
import { parseRoom, type Prop } from '../../game/sim';

/** The glade's own waterfall: the six-tile charge gap of its text map. */
const GLADE_FALL = parseRoom(forestGlade).props.find((prop) => prop.kind === 'waterfall') as Prop;

/** The three lines bug-quest.md's manifest example carries for HW-001. */
const HW_001_LOGS = [
  '[input] left/right mapping: INVERTED',
  '[input] axis sign flipped while carrying',
  '[bug] hides in: input handling',
];

/** The glade's waterfall, hit on this tick. */
function hitOn(hitTick: number): Prop {
  return { ...GLADE_FALL, hitTick };
}

describe('the parting a hit opens', () => {
  it('leaves the water closed while nothing has touched it', () => {
    expect(parted(GLADE_FALL, 0)).toBe(0);
    expect(parted(GLADE_FALL, 900)).toBe(0);
  });

  it('opens on the tick of the hit and holds for 150 ticks', () => {
    const hit = hitOn(40);

    expect(parted(hit, 40)).toBe(1);
    expect(parted(hit, 40 + WATER_PARTED_TICKS - WATERFALL.closeTicks - 1)).toBe(1);
  });

  it('draws back over the last ticks of the parting and closes for good', () => {
    const hit = hitOn(0);
    const closing = WATER_PARTED_TICKS - 1 - WATERFALL.closeTicks;

    expect(parted(hit, closing + 1)).toBeCloseTo((WATERFALL.closeTicks - 1) / WATERFALL.closeTicks);
    // The ramp reaches nothing on the last tick of the parting rather than
    // snapping a gap shut from a twelfth of the face open.
    expect(parted(hit, WATER_PARTED_TICKS - 1)).toBe(0);
    expect(parted(hit, WATER_PARTED_TICKS)).toBe(0);
    expect(parted(hit, WATER_PARTED_TICKS + 60)).toBe(0);
  });

  it('stays wide open while the wizard stands in the column', () => {
    // game/sim/water.ts stamps the prop again on every tick he is in it, so
    // the parting is asked about a hit that keeps moving with the clock.
    for (let tick = 0; tick < 200; tick += 1) {
      expect(parted(hitOn(tick), tick)).toBe(1);
    }
  });

  it('is closed on the ticks before the hit, which a replay may ask about', () => {
    expect(parted(hitOn(100), 99)).toBe(0);
  });
});

describe('what falls down the face', () => {
  it('gives every column of log text a speed the look doc allows', () => {
    const speeds = Array.from({ length: GLADE_FALL.w / LOG_TEXT.columnStep }, (_, index) =>
      speedOf(index, LOG_FALL_SPEED),
    );

    for (const speed of speeds) {
      expect(speed).toBeGreaterThanOrEqual(LOG_FALL_SPEED.min);
      expect(speed).toBeLessThanOrEqual(LOG_FALL_SPEED.max);
    }

    // No two columns fall in step, which is what makes it rain rather than
    // slide down as one block.
    expect(new Set(speeds).size).toBe(speeds.length);
  });

  it('gives every streak of water a speed of three to five units a tick', () => {
    for (let index = 0; index < WATERFALL.streaks; index += 1) {
      const speed = speedOf(index, WATER_STREAK_SPEED, 0.61);

      expect(speed).toBeGreaterThanOrEqual(WATER_STREAK_SPEED.min);
      expect(speed).toBeLessThanOrEqual(WATER_STREAK_SPEED.max);
    }
  });

  it('spreads the columns over the range instead of bunching them', () => {
    const places = Array.from({ length: 12 }, (_, index) => spread(index));

    for (const place of places) {
      expect(place).toBeGreaterThanOrEqual(0);
      expect(place).toBeLessThan(1);
    }

    // Every third of the range is used by at least two of the twelve.
    for (const third of [0, 1, 2]) {
      expect(places.filter((place) => Math.floor(place * 3) === third).length).toBeGreaterThan(1);
    }
  });

  it('falls, wraps back to the top and answers the same for the same tick', () => {
    const cycle = GLADE_FALL.h;

    expect(fallen(10, 1.2, 0, cycle)).toBeCloseTo(12);
    expect(fallen(10, 1.2, 0, cycle)).toBeCloseTo(fallen(10, 1.2, 0, cycle));
    expect(fallen(cycle, 1, 0, cycle)).toBe(0);
    expect(fallen(1000, 1.6, 0.5, cycle)).toBeLessThan(cycle);
    // Two columns of one speed are still not in step.
    expect(fallen(10, 1.2, 0.5, cycle)).not.toBeCloseTo(fallen(10, 1.2, 0, cycle));
  });

  it('flickers its green briefly and on the tick alone', () => {
    const flickers = Array.from({ length: WATERFALL.flickerPeriod }, (_, tick) =>
      flickering(tick),
    ).filter(Boolean).length;

    expect(flickers).toBe(WATERFALL.flickerTicks);
    expect(flickering(WATERFALL.flickerPeriod)).toBe(true);
  });
});

describe('the lines the water hides', () => {
  it('shows the flavour chatter alone while no manifest names a bug', () => {
    const lines = logLines([]);

    expect(lines.length).toBeGreaterThan(0);
    expect(lines.every((line) => !line.real)).toBe(true);
  });

  it('spreads the manifest lines through the chatter, marked as the real ones', () => {
    const lines = logLines(HW_001_LOGS);
    const real = lines.filter((line) => line.real);

    expect(real.map((line) => line.text)).toEqual(HW_001_LOGS);
    // Spread, not stacked: no two of the manifest's lines are neighbours.
    const places = HW_001_LOGS.map((text) => lines.findIndex((line) => line.text === text));
    const gaps = places.slice(1).map((place, index) => place - (places[index] ?? 0));

    expect(gaps.every((gap) => gap > 1)).toBe(true);
  });

  it('keeps every manifest line spread through the chatter, however many there are', () => {
    // A bug with more lines than there is chatter to hide them among: they are
    // still all there, in order, and still dealt through the list rather than
    // piled up at its end.
    const many = Array.from({ length: 12 }, (_, index) => `[bug] line ${index}`);
    const lines = logLines(many);
    const places = many.map((text) => lines.findIndex((line) => line.text === text));

    expect(lines.filter((line) => line.real).map((line) => line.text)).toEqual(many);
    expect(places.every((place) => place >= 0)).toBe(true);
    // In order, and none of them left to the last stretch of the list.
    expect([...places].sort((a, b) => a - b)).toEqual(places);
    expect(places[0]).toBeLessThan(3);
    expect(places[places.length - 1]).toBeGreaterThan(lines.length - 4);

    const gaps = places.slice(1).map((place, index) => place - (places[index] ?? 0));

    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThanOrEqual(1);
  });

  it('inks a glyph for every character the lines are written in', () => {
    // The shape of what `glyphOf` returns proves nothing: the blank it falls
    // back to is the same five rows of three as a real glyph, so a character
    // the font lacks would pass a test on the rows alone while drawing nothing
    // at all. The ink is what says the character can be read, and this is the
    // only guard on the font's coverage of what the manifest writes.
    const written = [...HW_001_LOGS, ...logLines([]).map((line) => line.text)].join('');

    for (const char of new Set(written.replace(/ /g, ''))) {
      const rows = glyphOf(char);

      expect(rows, `glyph for ${char}`).toHaveLength(5);
      expect(
        rows.every((row) => row.length === 3),
        `cells for ${char}`,
      ).toBe(true);
      expect(rows.join(''), `ink for ${char}`).toContain('#');
    }
  });

  it('leaves the space, and a character it does not hold, an empty cell', () => {
    // Blank by design, and blank rather than missing: a line keeps its length
    // whatever it is written in. This is also what makes the test above able
    // to fail — it can tell an inked glyph from the fallback.
    for (const char of [' ', '~']) {
      const rows = glyphOf(char);

      expect(rows, `cell for ${char}`).toHaveLength(5);
      expect(rows.join(''), `ink for ${char}`).not.toContain('#');
    }
  });

  it('draws the text on whole pixels of the render texture', () => {
    // A glyph pixel that is not a texture pixel would be smeared by the
    // nearest-neighbour scale up, and the lines are meant to be read (ADR-003).
    expect(LOG_TEXT.pixel * RENDER_DENSITY).toBe(1);
  });
});

describe('what the camera can see', () => {
  it('leaves the glade waterfall undrawn until the view reaches it', () => {
    expect(onScreen(GLADE_FALL, { x: 0, y: GLADE_FALL.y })).toBe(false);
    expect(onScreen(GLADE_FALL, { x: GLADE_FALL.x - VIEW_W, y: GLADE_FALL.y })).toBe(false);
    expect(onScreen(GLADE_FALL, { x: GLADE_FALL.x + GLADE_FALL.w, y: GLADE_FALL.y })).toBe(false);
  });

  it('draws it as soon as any of it is inside the view', () => {
    expect(onScreen(GLADE_FALL, { x: GLADE_FALL.x - VIEW_W + 1, y: GLADE_FALL.y })).toBe(true);
    expect(onScreen(GLADE_FALL, { x: GLADE_FALL.x, y: GLADE_FALL.y + GLADE_FALL.h - 1 })).toBe(
      true,
    );
    expect(onScreen(GLADE_FALL, { x: GLADE_FALL.x, y: GLADE_FALL.y - VIEW_H + 1 })).toBe(true);
  });
});
