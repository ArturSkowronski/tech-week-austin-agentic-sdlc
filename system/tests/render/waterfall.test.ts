// What the waterfall draws is a pure function of the world's tick and of the
// prop's own `hitTick` (docs/plan/02-design/rendering-and-look.md, the
// waterfall): how far the water has parted, where the roll of log lines has
// crept to, which lines it shows and whether the prop is on screen at all. The
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
  CELL_H,
  fallen,
  flickering,
  glyphOf,
  logLines,
  type LogLine,
  logsRead,
  onScreen,
  parted,
  rainColumns,
  rainRun,
  rainX,
  rainY,
  rollOf,
  rowChars,
  rowWidth,
  rowX,
  rowY,
  sheetAlpha,
  speedOf,
  spread,
  textBand,
  wrapLine,
} from '../../game/render/waterfall';
import {
  createWorld,
  parseRoom,
  PLANTED_BUGS,
  TILE,
  type Prop,
  type WorldState,
} from '../../game/sim';

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

  it('stays wide open while the wizard stands near the column', () => {
    // game/sim/water.ts stamps the prop again on every tick he is within
    // WATER_NEAR of it, so the parting is asked about a hit that keeps moving
    // with the clock.
    for (let tick = 0; tick < 200; tick += 1) {
      expect(parted(hitOn(tick), tick)).toBe(1);
    }
  });

  it('is closed on the ticks before the hit, which a replay may ask about', () => {
    expect(parted(hitOn(100), 99)).toBe(0);
  });
});

describe('what falls down the face', () => {
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

describe('the sheet a parting thins', () => {
  it('thins the water from closed to parted and never takes it away', () => {
    expect(sheetAlpha(0)).toBe(WATERFALL.closedAlpha);
    expect(sheetAlpha(1)).toBeCloseTo(WATERFALL.partedAlpha);
    // Thinned, not gone: the face is still water at the widest parting, which
    // is the whole of what HWP-096 is about.
    expect(sheetAlpha(1)).toBeGreaterThan(0);
    expect(sheetAlpha(0.5)).toBeGreaterThan(sheetAlpha(1));
    expect(sheetAlpha(0.5)).toBeLessThan(sheetAlpha(0));
  });
});

describe('the rain of glyphs behind the sheet', () => {
  /** Where every column of the glade's rain stands down the face on a tick. */
  const fallAt = (tick: number): number[] =>
    Array.from({ length: rainColumns(GLADE_FALL) }, (_, index) => rainY(GLADE_FALL, index, tick));

  it('stands a column every six units, covering the whole face', () => {
    const count = rainColumns(GLADE_FALL);

    expect(count).toBe(GLADE_FALL.w / WATERFALL.rainStep);

    for (let index = 0; index < count; index += 1) {
      expect(rainX(index), `column ${index}`).toBeGreaterThanOrEqual(0);
      expect(rainX(index), `column ${index}`).toBeLessThan(GLADE_FALL.w);
      expect(rainX(index) - rainX(index - 1), `column ${index}`).toBe(WATERFALL.rainStep);
    }

    // Both edges of the face are rained on, not only its middle.
    expect(rainX(0)).toBeLessThan(WATERFALL.rainStep);
    expect(rainX(count - 1)).toBeGreaterThan(GLADE_FALL.w - 2 * WATERFALL.rainStep);
  });

  it('places the rain by the tick alone, and moves it on with the tick', () => {
    expect(fallAt(91)).toEqual(fallAt(91));
    expect(fallAt(92)).not.toEqual(fallAt(91));
  });

  it('keeps every column covering the face as it falls and wraps', () => {
    // A column is one run of glyphs drawn twice, so it covers the face for as
    // long as its top stands within a run of the lip: anything else would
    // show the wrap as a bare stripe of rock.
    const run = rainRun(GLADE_FALL) * CELL_H;

    expect(run).toBeGreaterThanOrEqual(GLADE_FALL.h);

    for (let tick = 0; tick < 400; tick += 1) {
      for (const y of fallAt(tick)) {
        expect(y, `tick ${tick}`).toBeGreaterThanOrEqual(-run);
        expect(y, `tick ${tick}`).toBeLessThanOrEqual(0);
      }
    }
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
    const written = [
      ...PLANTED_BUGS.flatMap((bug) => bug.logs),
      ...HW_001_LOGS,
      ...logLines([]).map((line) => line.text),
    ].join('');

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

describe('the roll the lines come by on', () => {
  /** Every line the glade's water hides, the chatter and the evidence. */
  const GLADE_LINES = rollOf(GLADE_FALL, logLines(HW_001_LOGS));

  /** The band of the face a row of text is kept inside. */
  const OPENING = textBand(GLADE_FALL);

  it('lays each line out as one horizontal row that fits across the water', () => {
    for (const line of GLADE_LINES) {
      const x = rowX(GLADE_FALL, line.text);

      expect(rowWidth(line.text), line.text).toBeLessThanOrEqual(GLADE_FALL.w);
      expect(x, line.text).toBeGreaterThanOrEqual(0);
      expect(x + rowWidth(line.text), line.text).toBeLessThanOrEqual(GLADE_FALL.w);
    }
  });

  it('shows every line of every planted bug whole inside the band', () => {
    // The manifest, not a fixture: `bugForRoom` shows the first entry for the
    // room, so a line of any entry can end up on this face. Lines longer than
    // the 40 a row holds (HW-002's were 45 and 48 characters) are wrapped onto
    // a second row rather than cut or set tighter — the whole of a line is
    // drawn either way.
    for (const bug of PLANTED_BUGS) {
      for (const text of bug.logs) {
        const rows = wrapLine(GLADE_FALL, text);

        expect(rows.join(' '), text).toBe(text);

        for (const row of rows) {
          const x = rowX(GLADE_FALL, row);

          expect(row.length, row).toBeLessThanOrEqual(rowChars(GLADE_FALL));
          expect(x, row).toBeGreaterThanOrEqual(OPENING.from + LOG_TEXT.margin);
          expect(x + rowWidth(row), row).toBeLessThanOrEqual(OPENING.to - LOG_TEXT.margin);
        }
      }
    }
  });

  it('leaves a margin round the 40-character line the ticket sizes it for', () => {
    // Half a tile of water on each side of a line that long, which is what
    // the font is sized against. The manifest carries longer lines — 48
    // characters would take the whole face — and those are wrapped.
    const margin = TILE / 2;
    const forty = 'X'.repeat(40);

    expect(rowChars(GLADE_FALL)).toBeGreaterThanOrEqual(40);
    expect(rowWidth(forty) + 2 * margin).toBeLessThanOrEqual(GLADE_FALL.w);
    expect(rowX(GLADE_FALL, forty)).toBeGreaterThanOrEqual(margin);
  });

  it('keeps the band wide enough to show the widest line whole', () => {
    const widest = Math.max(...GLADE_LINES.map((line) => rowWidth(line.text)));

    expect(WATERFALL.openShare * GLADE_FALL.w).toBeGreaterThanOrEqual(widest);
  });

  it('wraps a line at a word, and a word too long for a row across rows', () => {
    const limit = rowChars(GLADE_FALL);
    const sentence = `${'a'.repeat(limit - 2)} tail`;

    expect(wrapLine(GLADE_FALL, sentence)).toEqual(['a'.repeat(limit - 2), 'tail']);
    expect(wrapLine(GLADE_FALL, 'b'.repeat(limit + 1))).toEqual([
      'b'.repeat(limit),
      'b',
    ]);
  });

  it('creeps the roll downward, wraps it and lands on whole texture pixels', () => {
    const count = GLADE_LINES.length;
    const roll = count * LOG_TEXT.lineStep;

    expect(rowY(0, 100, count) - rowY(0, 0, count)).toBeCloseTo(100 * LOG_FALL_SPEED);
    expect(rowY(0, roll / LOG_FALL_SPEED, count)).toBe(rowY(0, 0, count));

    for (let tick = 0; tick < 200; tick += 1) {
      expect(Number.isInteger(rowY(0, tick, count) * RENDER_DENSITY), `tick ${tick}`).toBe(
        true,
      );
    }
  });

  /** How many rows of a roll stand whole in the band he reads, on a tick. */
  function wholeInBand(roll: readonly LogLine[], tick: number): number {
    return roll.filter((_, index) => {
      const y = rowY(index, tick, roll.length);

      return y >= 0 && y + CELL_H <= LOG_TEXT.band;
    }).length;
  }

  it('keeps one or two whole lines standing in the band he reads', () => {
    // LOG_TEXT.band is how much of the face the view and the bushes in front
    // leave in sight; a step wider than it would leave the band empty, and
    // half of it would crowd a third line in.
    for (let tick = 0; tick < 400; tick += 1) {
      expect(wholeInBand(GLADE_LINES, tick), `tick ${tick}`).toBeGreaterThanOrEqual(1);
      expect(wholeInBand(GLADE_LINES, tick), `tick ${tick}`).toBeLessThanOrEqual(2);
    }
  });

  it('keeps that true of the roll of every bug the manifest can plant here', () => {
    // Wrapping a long line puts another row on the roll, which is what the
    // band has to hold one or two of; the step is the same for every roll, so
    // this holds whichever entry the room's creature is carrying.
    for (const bug of PLANTED_BUGS) {
      const roll = rollOf(GLADE_FALL, logLines(bug.logs));

      for (let tick = 0; tick < 400; tick += 1) {
        expect(wholeInBand(roll, tick), `${bug.id} tick ${tick}`).toBeGreaterThanOrEqual(1);
        expect(wholeInBand(roll, tick), `${bug.id} tick ${tick}`).toBeLessThanOrEqual(2);
      }
    }
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

describe('whether the logs have been read', () => {
  /** The glade, with every waterfall of it hit on this tick. */
  const glade = (hitTick: number): WorldState => {
    const state = createWorld(forestGlade, { roomName: 'forest-glade' });

    for (const prop of state.props) {
      if (prop.kind === 'waterfall') {
        prop.hitTick = hitTick;
      }
    }

    return state;
  };

  it('has read nothing while no water of the room has been touched', () => {
    expect(logsRead(glade(-1))).toBe(false);
  });

  it('reads them on the tick of the touch and keeps them read for the run', () => {
    expect(logsRead(glade(0))).toBe(true);
    // The parting itself is long over by now (see above); the lines were read
    // all the same, and the card goes on knowing it until the run starts over.
    expect(logsRead(glade(1))).toBe(true);
  });

  it('is deaf to the props that are not water', () => {
    const state = glade(-1);

    for (const prop of state.props) {
      if (prop.kind !== 'waterfall') {
        prop.hitTick = 0;
      }
    }

    expect(logsRead(state)).toBe(false);
  });
});
