// The waterfall, drawn in code rather than out of a sprite
// (docs/plan/02-design/rendering-and-look.md, the waterfall;
// docs/plan/02-design/bug-quest.md, evidence): a dark rock face, a rain of log
// glyphs falling down it as its texture, a roll of whole log lines over that,
// and the water sheet on top of all three, near opaque until something
// disturbs it and parted for 150 ticks after. Each line is one horizontal row
// of glyphs across the face, whole — wrapped at a word onto a second row of
// the roll if it is longer than a row can show — and the roll creeps downward
// the way credits do, so a line that comes by can be read.
//
// A parting thins the water, it never cuts a hole in it: the sheet, its
// strands, its streaks, its foam and its mist are drawn over the whole face at
// every value of `open`, and only fade from `closedAlpha` to `partedAlpha`.
// The roll of lines stands in front of that sheet and is hidden by its own
// alpha, which is the parting itself, so a line reads through thinned water
// as plainly as it did when a parting emptied a band of the face.
//
// Everything moves on `state.tick` and on the prop's own `hitTick`, never on
// wall time and never on `Math.random`, so the same tick always draws the same
// frame and a replay replays. The prop's `active` flag is no use here: nothing
// in game/sim/ ever raises it for water, and `hitTick` is the whole record of
// a wizard standing near, a touch or a charge hit (game/sim/water.ts,
// game/sim/charge-hit.ts).

import { Container, Graphics, GraphicsContext } from 'pixi.js';

import type { Prop, WorldState } from '../sim';

import { wholePixels, type Camera } from './camera';
import {
  LOG_FALL_SPEED,
  LOG_TEXT,
  VIEW_H,
  VIEW_W,
  WATER_PARTED_TICKS,
  WATER_STREAK_SPEED,
  WATERFALL,
  WATERFALL_COLOURS,
} from './config';

/** Pixels across and down of one character of the font below. */
const GLYPH_W = 3;
const GLYPH_H = 5;

/**
 * A font drawn in code, three pixels across and five down, one texture pixel
 * each: the smallest character that can still be read at the scales ADR-003
 * allows, and small enough that a whole log line fits across the rock face.
 * Each glyph is its five rows, `#` for an inked pixel, split by slashes so
 * the shape can be seen in the source.
 *
 * Capitals only — five rows have no room for descenders — so a line is drawn
 * upper case whatever case the manifest wrote it in. The space, and any
 * character the font does not hold, is the blank glyph: it still takes its
 * cell, so a line keeps its length whatever is written in it.
 */
const BLANK = '.../.../.../.../...';

const GLYPHS: Readonly<Record<string, string>> = {
  A: '.#./#.#/###/#.#/#.#',
  B: '##./#.#/##./#.#/##.',
  C: '.##/#../#../#../.##',
  D: '##./#.#/#.#/#.#/##.',
  E: '###/#../##./#../###',
  F: '###/#../##./#../#..',
  G: '.##/#../#.#/#.#/.##',
  H: '#.#/#.#/###/#.#/#.#',
  I: '###/.#./.#./.#./###',
  J: '..#/..#/..#/#.#/.#.',
  K: '#.#/#.#/##./#.#/#.#',
  L: '#../#../#../#../###',
  M: '#.#/###/###/#.#/#.#',
  N: '#.#/##./###/.##/#.#',
  O: '.#./#.#/#.#/#.#/.#.',
  P: '##./#.#/##./#../#..',
  Q: '.#./#.#/#.#/##./.##',
  R: '##./#.#/##./#.#/#.#',
  S: '.##/#../.#./..#/##.',
  T: '###/.#./.#./.#./.#.',
  U: '#.#/#.#/#.#/#.#/###',
  V: '#.#/#.#/#.#/#.#/.#.',
  W: '#.#/#.#/###/###/#.#',
  X: '#.#/#.#/.#./#.#/#.#',
  Y: '#.#/#.#/.#./.#./.#.',
  Z: '###/..#/.#./#../###',
  '0': '###/#.#/#.#/#.#/###',
  '1': '.#./##./.#./.#./###',
  '2': '##./..#/.#./#../###',
  '3': '##./..#/.#./..#/##.',
  '4': '#.#/#.#/###/..#/..#',
  '5': '###/#../##./..#/##.',
  '6': '.##/#../###/#.#/###',
  '7': '###/..#/.#./#../#..',
  '8': '###/#.#/###/#.#/###',
  '9': '###/#.#/###/..#/##.',
  '.': '.../.../.../.../.#.',
  ',': '.../.../.../.#./#..',
  ':': '.../.#./.../.#./...',
  '-': '.../.../###/.../...',
  _: '.../.../.../.../###',
  '/': '..#/..#/.#./#../#..',
  '[': '.##/.#./.#./.#./.##',
  ']': '##./.#./.#./.#./##.',
  '(': '..#/.#./.#./.#./..#',
  ')': '#../.#./.#./.#./#..',
  '=': '.../###/.../###/...',
  '>': '#../.#./..#/.#./#..',
  '<': '..#/.#./#../.#./..#',
  '+': '.../.#./###/.#./...',
  '*': '.../#.#/.#./#.#/...',
  '#': '#.#/###/#.#/###/#.#',
  '!': '.#./.#./.#./.../.#.',
  '?': '##./..#/.#./.../.#.',
  "'": '.#./.#./.../.../...',
  '%': '#.#/..#/.#./#../#.#',
  '|': '.#./.#./.#./.#./.#.',
};

/**
 * Log lines nobody planted: the engine chatter the real evidence hides among
 * (bug-quest.md, evidence). They name nothing the manifest names, and they are
 * drawn in their own dim colour, so the two are told apart on sight.
 */
const FLAVOUR: readonly string[] = [
  '[render] atlas page 2 bound',
  '[audio] cue forest-wind faded in',
  '[render] 318 sprites in 1 batch',
  '[assets] props sheet decoded',
  '[input] gamepad 0 not present',
  '[render] texture cache 12 of 32',
  '[audio] mixer holding at -6 db',
  '[render] vsync 60 hz',
];

/** One line the water hides: the bug's own, or the chatter around it. */
export interface LogLine {
  text: string;
  /** Is this one of the manifest's lines — the evidence the player is after? */
  real: boolean;
}

/** Units one character cell takes across a line, its column of gap included. */
export const CELL_W = (GLYPH_W + LOG_TEXT.gap) * LOG_TEXT.pixel;

/** Units a line of glyphs takes down the face. */
export const CELL_H = GLYPH_H * LOG_TEXT.pixel;

/**
 * The lines the columns cycle through: the bug's own lines spread evenly
 * through the flavour, so a parted waterfall shows some of each wherever the
 * player is looking. A room whose manifest has no bug shows flavour alone.
 */
export function logLines(logs: readonly string[]): readonly LogLine[] {
  const lines: LogLine[] = FLAVOUR.map((text) => ({ text, real: false }));

  if (logs.length === 0) {
    return lines;
  }

  // The step is measured over the list the insertions themselves grow to, so
  // the points stay inside it however many lines the manifest carries: a step
  // taken over the chatter alone outruns the list once the bug has more lines
  // than there is chatter, and the last of them stack up at the end — the very
  // thing the spreading is for.
  const step = (FLAVOUR.length + logs.length) / logs.length;

  logs.forEach((text, index) => {
    lines.splice(Math.round(index * step), 0, { text, real: true });
  });

  return lines;
}

/**
 * A fraction in [0, 1) that belongs to this column and to no other: a walk in
 * steps of the golden-ratio conjugate, which spreads any run of indices evenly
 * over the range without anything to seed and without a hash to explain.
 */
export function spread(index: number, offset = 0): number {
  return ((index + 1) * 0.618_033_988_75 + offset) % 1;
}

/**
 * A value between two bounds, this one's own: every strand and streak of
 * water falls at its own rate inside the range its kind is given
 * (rendering-and-look.md, the waterfall), and the blobs of the foam's churn
 * take their drift and their radius the same way. The roll of log text does
 * not use it — that comes down as one piece, at LOG_FALL_SPEED.
 */
export function speedOf(index: number, bounds: { min: number; max: number }, offset = 0): number {
  return bounds.min + spread(index, offset) * (bounds.max - bounds.min);
}

/**
 * How far something falling at `speed` has come by this tick, wrapped back to
 * the top every `cycle` units. `phase` is where it started, as a share of the
 * cycle, so two columns of the same speed are not in step.
 */
export function fallen(tick: number, speed: number, phase: number, cycle: number): number {
  return (tick * speed + phase * cycle) % cycle;
}

/**
 * How far the water has parted on this tick: one while it is open, nothing
 * while it is closed. A hit opens it at once — a charge through the column is
 * a splash, not a curtain — and it draws back over the last ticks of the 150
 * the hit buys it. Opening over a ramp as well would never finish: the wizard
 * standing near the water is stamped again every tick (game/sim/water.ts), so
 * the ramp would restart under him and the logs would stay hidden.
 */
export function parted(prop: Prop, tick: number): number {
  const since = tick - prop.hitTick;

  if (prop.hitTick < 0 || since < 0 || since >= WATER_PARTED_TICKS) {
    return 0;
  }

  // The ramp is counted to the last tick the parting is asked about, not past
  // it: closing on `WATER_PARTED_TICKS - since` would leave a twelfth of the
  // gap — a five-unit slot, twenty window pixels at scale 4 — still open on
  // the final tick and then snap it shut.
  return Math.min(1, (WATER_PARTED_TICKS - 1 - since) / WATERFALL.closeTicks);
}

/**
 * Has the room's evidence been read this run? The log lines stand behind the
 * water and can be read only while it is parted (bug-quest.md, evidence), so
 * the first time he stands near, touches or charge-hits any of the room's
 * waterfalls is what shows them, and the ticket card treats them as read from
 * then on. `hitTick` is
 * that record already: game/sim/ stamps it and never clears it, so only a
 * fresh world takes it back to -1 and starts the run over with the logs unseen.
 */
export function logsRead(state: WorldState): boolean {
  return state.props.some((prop) => prop.kind === 'waterfall' && prop.hitTick >= 0);
}

/** Is any of this prop inside the view this camera shows? */
export function onScreen(prop: Prop, camera: Camera): boolean {
  return (
    prop.x < camera.x + VIEW_W &&
    camera.x < prop.x + prop.w &&
    prop.y < camera.y + VIEW_H &&
    camera.y < prop.y + prop.h
  );
}

/** Is the water flickering its green on this tick? */
export function flickering(tick: number): boolean {
  return tick % WATERFALL.flickerPeriod < WATERFALL.flickerTicks;
}

/** The rows of a character, `GLYPH_H` of them and `GLYPH_W` pixels each. */
export function glyphOf(char: string): readonly string[] {
  return (GLYPHS[char.toUpperCase()] ?? BLANK).split('/');
}

/**
 * How wide one line is drawn, in world units: a cell for every character, the
 * last one's column of gap left off so the line is measured by its ink.
 */
export function rowWidth(text: string): number {
  return Math.max(text.length * CELL_W - LOG_TEXT.gap * LOG_TEXT.pixel, 0);
}

/** Where a line starts across a face, in units from its left edge. */
export function rowX(prop: Prop, text: string): number {
  return wholePixels((prop.w - rowWidth(text)) / 2);
}

/** The band across the middle of the face the rows of text are kept inside. */
export interface Band {
  from: number;
  to: number;
}

/**
 * That band, on whole pixels of the texture: the share of the face
 * {@link WATERFALL.openShare} allows it. It is the text's own concern — it
 * settles how long a row may be, and nothing else — and not a hole in the
 * water, which a parting has not cut since HWP-096.
 */
export function textBand(prop: Prop): Band {
  const width = wholePixels(prop.w * WATERFALL.openShare);
  const from = wholePixels((prop.w - width) / 2);

  return { from, to: from + width };
}

/**
 * How many characters a row of this face holds: the band it is kept inside,
 * less the margin it leaves at each end. Forty on the glade's 96-unit column,
 * which is the length the ticket sizes the font for.
 */
export function rowChars(prop: Prop): number {
  const band = textBand(prop);
  const room = band.to - band.from - 2 * LOG_TEXT.margin;

  // A row is as wide as its cells less the last one's column of gap, so the
  // budget is measured with that column handed back.
  return Math.max(1, Math.floor((room + LOG_TEXT.gap * LOG_TEXT.pixel) / CELL_W));
}

/**
 * The rows one line is drawn on: itself, unless it is longer than the parting
 * can show whole, and then it is wrapped at a word so the whole of it is read
 * — the roll brings a wrapped tail by right after its head. A word longer
 * than a row on its own is cut across rows, which no manifest line needs but
 * which keeps the wrapping total.
 */
export function wrapLine(prop: Prop, text: string): readonly string[] {
  const limit = rowChars(prop);

  if (text.length <= limit) {
    return [text];
  }

  const rows: string[] = [];
  let row = '';

  for (const word of text.split(' ')) {
    for (let at = 0; at < word.length; at += limit) {
      const part = word.slice(at, at + limit);
      const joined = row === '' ? part : `${row} ${part}`;

      if (joined.length <= limit) {
        row = joined;
      } else {
        rows.push(row);
        row = part;
      }
    }
  }

  rows.push(row);

  return rows;
}

/**
 * The roll of a face: every line of it on the rows it takes, each row whole
 * inside the parting, and a wrapped tail in the colour of the line it came
 * from so evidence still reads as evidence.
 */
export function rollOf(prop: Prop, lines: readonly LogLine[]): readonly LogLine[] {
  return lines.flatMap((line) =>
    wrapLine(prop, line.text).map((text) => ({ text, real: line.real })),
  );
}

/**
 * Where line `index` of a roll of `count` stands on this tick, in units down
 * the face. The whole roll creeps down at one speed and wraps, and a line
 * later in the list stands above one before it, so a reader watching one spot
 * of the face is met by the lines in the order the manifest wrote them. A
 * line starts a cell above the lip, so it wipes in under the mask rather than
 * appearing whole.
 */
export function rowY(index: number, tick: number, count: number): number {
  const roll = count * LOG_TEXT.lineStep;
  const down = tick * LOG_FALL_SPEED + (count - index) * LOG_TEXT.lineStep;

  return wholePixels((down % roll) - CELL_H);
}

/** Lay one character into a shape, a texture pixel to a pixel of the font. */
function inkGlyph(into: GraphicsContext, char: string, x: number, y: number): void {
  const { pixel } = LOG_TEXT;

  glyphOf(char).forEach((row, down) => {
    [...row].forEach((ink, across) => {
      if (ink === '#') {
        into.rect(x + across * pixel, y + down * pixel, pixel, pixel);
      }
    });
  });
}

/**
 * One line of text drawn across the face, a character to a cell, centred on
 * the face and in the colour that says whether it is evidence or chatter. The
 * geometry never changes once it is built, so a line is drawn once and
 * afterwards only moved.
 */
function drawRow(prop: Prop, line: LogLine): Graphics {
  const glyphs = new GraphicsContext();

  [...line.text].forEach((char, index) => inkGlyph(glyphs, char, index * CELL_W, 0));
  glyphs.fill(line.real ? WATERFALL_COLOURS.evidence : WATERFALL_COLOURS.flavour);

  const text = new Graphics(glyphs);

  text.x = rowX(prop, line.text);

  return text;
}

/**
 * Three walks of {@link spread} for one index: where a thing stands, how fast
 * it falls, and where in its fall it starts. Reading all three off the one
 * walk would tie a column's speed to its place and slope the rain across the
 * face; these are the same walk shifted, which unties them.
 */
const PLACE = 0;
const SPEED = 0.31;
const START = 0.67;

/** The two faint colours the water lays over its own blue. */
const MIST = { color: WATERFALL_COLOURS.mist, alpha: WATERFALL.mistAlpha } as const;
const FLICKER = { color: WATERFALL_COLOURS.flicker, alpha: WATERFALL.flickerAlpha } as const;

/** How bright the foam is closed and fully parted, under a shorter name. */
const FOAM = WATERFALL.foamAlpha;

/** One blob of churn, settled by its index and never again. */
interface Blob {
  /** Units a tick it steps along its path. */
  drift: number;
  /** Where on that path it starts, as a share of it. */
  phase: number;
  radius: number;
  /** How far into its band it rides, as a share of the band. */
  deep: number;
}

/**
 * The blobs of the foam's churn and of the mist, settled once: nothing about
 * a blob but where it has drifted to depends on the tick, and neither depends
 * on the prop, so the walks of {@link spread} are taken here rather than
 * sixty times a frame in the draw. This is what `buildFalls` does for the
 * strands and the streaks, which are the same thing moving down the face.
 */
function churn(count: number, radius: { min: number; max: number }): readonly Blob[] {
  return Array.from({ length: count }, (_, index) => ({
    drift: speedOf(index, WATERFALL.churnDrift, SPEED),
    phase: spread(index, PLACE),
    radius: speedOf(index, radius, START),
    // The bigger a blob, the deeper it rides: a row of them all at one depth
    // reads as beading rather than as churn.
    deep: speedOf(index, radius, START) / radius.max,
  }));
}

const CHURN = churn(WATERFALL.foamBlobs, WATERFALL.foamRadius);
const MIST_CHURN = churn(WATERFALL.mistBlobs, { min: 0, max: 1 });

/** Where something stands between its closed look and its fully parted one. */
function fade(open: number, closed: number, parted: number): number {
  return closed + open * (parted - closed);
}

/**
 * How much of what is behind it the sheet keeps back at this parting:
 * {@link WATERFALL.closedAlpha} closed, thinning to
 * {@link WATERFALL.partedAlpha} wide open. The sheet is never taken away.
 */
export function sheetAlpha(open: number): number {
  return fade(open, WATERFALL.closedAlpha, WATERFALL.partedAlpha);
}

/** Glyph rows one column of the rain takes to cover a face this tall. */
export function rainRun(prop: Prop): number {
  return Math.ceil(prop.h / CELL_H);
}

/**
 * How many columns of rain a face this wide carries: one every
 * {@link WATERFALL.rainStep} units, so the rain covers the whole of it.
 */
export function rainColumns(prop: Prop): number {
  return Math.floor(prop.w / WATERFALL.rainStep);
}

/** Where column `index` stands across the face, in units: its step, centred. */
export function rainX(index: number): number {
  const { rainStep } = WATERFALL;

  return wholePixels(index * rainStep + (rainStep - GLYPH_W * LOG_TEXT.pixel) / 2);
}

/**
 * Where it stands down the face on this tick, in units. Each column falls at
 * its own speed and wraps; the run of glyphs is drawn twice head to tail (see
 * {@link buildRain}), so a column slides over one run's worth of face and the
 * wrap is never seen. It is settled by the index and the tick and nothing
 * else, so the same tick always draws the same rain.
 */
export function rainY(prop: Prop, index: number, tick: number): number {
  const cycle = rainRun(prop) * CELL_H;
  const speed = speedOf(index, WATERFALL.rainSpeed, SPEED);

  return wholePixels(fallen(tick, speed, spread(index, START), cycle) - cycle);
}

/**
 * One column of rain, built once and afterwards only moved: a slice of the
 * room's own log text, starting where this column's walk of {@link spread}
 * puts it and wrapping round the end. The run of glyphs is drawn twice, head
 * to tail, so that sliding the column down by one run's worth leaves the face
 * covered throughout and the wrap is never seen. Both halves are the one
 * shape shown twice, so a column's glyphs are built and held once.
 */
function buildRain(prop: Prop, text: string): Container[] {
  const run = rainRun(prop);

  return Array.from({ length: rainColumns(prop) }, (_, index) => {
    const glyphs = new GraphicsContext();
    const start = Math.floor(spread(index, PLACE) * text.length);

    for (let row = 0; row < run; row += 1) {
      inkGlyph(glyphs, text[(start + row) % text.length] ?? ' ', 0, row * CELL_H);
    }

    glyphs.fill(WATERFALL_COLOURS.flavour);

    const column = new Container();
    const tail = new Graphics(glyphs);

    tail.y = run * CELL_H;
    column.addChild(new Graphics(glyphs), tail);
    column.x = rainX(index);

    return column;
  });
}

/** Something that falls down the face over and over, settled when it is built. */
interface Falling {
  /** How far down the face it reaches, which is also how far it falls unseen. */
  length: number;
  /** Units a tick, inside the range its kind is allowed. */
  speed: number;
  /** Where in its cycle it stands at tick zero, as a share of the cycle. */
  phase: number;
}

/** Where the top of a falling thing is on this tick, in units down the face. */
function topOf(what: Falling, prop: Prop, tick: number): number {
  return wholePixels(fallen(tick, what.speed, what.phase, prop.h + what.length) - what.length);
}

/** One column of falling water: where it stands, and what it is made of. */
interface Fall extends Falling {
  x: number;
  width: number;
  fill: { color: number; alpha: number };
}

/** One waterfall prop on the screen. Built once, then moved and redrawn. */
interface Face {
  view: Container;
  /** The roll of whole log lines, which stands in front of the sheet. */
  text: Container;
  /** The columns of the rain behind it, each moved as one piece. */
  rain: Container[];
  falls: Fall[];
  water: Graphics;
}

/**
 * The water that falls down a face: the thin strands of the second blue, and
 * the brighter streaks in their fixed columns, both at the speed the look doc
 * gives the water. The two differ only in the four numbers below, so they are
 * one table rather than two loops.
 */
function buildFalls(prop: Prop): Fall[] {
  const kinds = [
    {
      count: WATERFALL.strands,
      width: WATERFALL.strandWidth,
      length: WATERFALL.strandLength,
      fill: { color: WATERFALL_COLOURS.strand, alpha: 1 },
      salt: 0,
    },
    {
      count: WATERFALL.streaks,
      width: WATERFALL.streakWidth,
      length: WATERFALL.streakLength,
      fill: { color: WATERFALL_COLOURS.streak, alpha: WATERFALL.streakAlpha },
      salt: 0.37,
    },
  ];

  return kinds.flatMap((kind) =>
    Array.from({ length: kind.count }, (_, index) => ({
      x: wholePixels(spread(index, kind.salt + PLACE) * (prop.w - kind.width)),
      width: kind.width,
      length: kind.length,
      fill: kind.fill,
      speed: speedOf(index, WATER_STREAK_SPEED, kind.salt + SPEED),
      phase: spread(index, kind.salt + START),
    })),
  );
}

/** Build one face: the rock, the rain, the roll of text and the water. */
function buildFace(prop: Prop, lines: readonly LogLine[]): Face {
  const view = new Container();
  const inside = new Container();
  // The rock's own outline: the prop's box with its right edge rounded off,
  // the one side of it that stands out of the room's tiles. Everything the
  // rock carries is cut to it — the roll runs longer than the face is tall and
  // would spill over the plateau above it, and the water would square off the
  // very corner the rock rounds.
  const mask = new Graphics()
    .roundRect(0, 0, prop.w, prop.h, WATERFALL.radius)
    .rect(0, 0, prop.w - WATERFALL.radius, prop.h)
    .fill(WATERFALL_COLOURS.rock);
  const rock = new Graphics().rect(0, 0, prop.w, prop.h).fill(WATERFALL_COLOURS.rock);
  const rain = buildRain(prop, lines.map((line) => line.text).join('  '));
  const text = new Container();
  const falling = new Container();
  const water = new Graphics();

  text.addChild(...rollOf(prop, lines).map((line) => drawRow(prop, line)));
  falling.addChild(...rain);
  // Back to front: the rock, the rain that is the face's texture, the sheet of
  // water over both, and the roll of whole lines in front of it all. The roll
  // is in front because a parting thins the sheet rather than emptying a band
  // of it, and a line has to read through what is left; what hides the roll
  // while the water is closed is its own alpha, which is the parting (see
  // `update`), and not the sheet.
  inside.addChild(rock, falling, water, text);
  inside.mask = mask;
  view.addChild(mask, inside);
  view.position.set(prop.x, prop.y);

  return { view, text, rain, falls: buildFalls(prop), water };
}

/**
 * A point this far along the churn's path: from the left of the lip to the
 * right of it, and then on down the rounded right edge. Those are the two
 * sides of the face that stand in the open, and so the two the foam gathers
 * on (rendering-and-look.md, the waterfall). `deep` is how far into the band
 * the point lies, as a share of the band's own thickness: a half is its
 * middle, and one is the inner edge, where a blob bulges into the water and
 * so scallops it instead of disappearing into the band.
 */
function alongChurn(prop: Prop, along: number, deep: number): { x: number; y: number } {
  return along < prop.w
    ? { x: along, y: WATERFALL.lip * deep }
    : { x: prop.w - WATERFALL.edge * deep, y: along - prop.w };
}

/**
 * The foam of one face: the band along the lip and down the right edge, and
 * the churn that makes it water rather than a painted stripe — round blobs
 * stepping along that band at their own paces, and white pixels catching the
 * light among them, moved on every few ticks.
 */
function drawFoam(water: Graphics, prop: Prop, tick: number, open: number): void {
  const { w, h } = prop;
  const fill = { color: WATERFALL_COLOURS.foam, alpha: fade(open, FOAM.closed, FOAM.parted) };
  const path = w + h;

  water.rect(0, 0, w, WATERFALL.lip);
  water.rect(w - WATERFALL.edge, 0, WATERFALL.edge, h);

  for (const blob of CHURN) {
    const at = alongChurn(prop, fallen(tick, blob.drift, blob.phase, path), blob.deep);

    water.circle(at.x, at.y, blob.radius);
  }

  // The band and its blobs are one fill: every shape of a fill is tessellated
  // on its own, so the look is the same and Pixi is asked for one instruction
  // rather than twenty-eight, on every frame of every face on the screen.
  water.fill(fill);

  const blink = Math.floor(tick / WATERFALL.foamSparkleTicks);

  for (let index = 0; index < WATERFALL.foamSparkles; index += 1) {
    const at = alongChurn(prop, spread(index, blink / 3) * path, 0.5);

    // One pixel of the render texture, whose size LOG_TEXT owns.
    water.rect(at.x, at.y, LOG_TEXT.pixel, LOG_TEXT.pixel);
  }

  water.fill({ color: WATERFALL_COLOURS.sparkle, alpha: fill.alpha });
}

/**
 * The mist at the base: the bands that thicken towards the foot of the fall,
 * and blobs of churn rolling sideways through them, at the drift the foam's
 * own churn takes, so that it boils rather than lying in flat stripes.
 */
function drawMist(water: Graphics, prop: Prop, tick: number): void {
  const { w, h } = prop;
  const blob = WATERFALL.mistBlob;

  for (let band = 0; band < WATERFALL.mistBands; band += 1) {
    const depth = (WATERFALL.mist * (band + 1)) / WATERFALL.mistBands;

    water.rect(0, h - depth, w, depth);
  }

  for (const drop of MIST_CHURN) {
    water.ellipse(
      fallen(tick, drop.drift, drop.phase, w + blob.w) - blob.w / 2,
      h - drop.deep * WATERFALL.mist,
      blob.w / 2,
      blob.h / 2,
    );
  }

  water.fill(MIST);
}

/**
 * Closed water flickers green: a few faint patches of what it is holding
 * back, moved to another part of the face on every flicker.
 */
function drawFlicker(water: Graphics, prop: Prop, tick: number): void {
  const { w, h } = prop;
  const flicker = Math.floor(tick / WATERFALL.flickerPeriod);
  const size = { w: w / WATERFALL.flickerPatches, h: h / WATERFALL.flickerPatches };

  for (let index = 0; index < WATERFALL.flickerPatches; index += 1) {
    water.rect(
      spread(index, flicker / 3) * (w - size.w),
      spread(index, flicker / 5) * (h - size.h),
      size.w,
      size.h,
    );
  }

  water.fill(FLICKER);
}

/**
 * The water of one face on one tick: one sheet of the base blue over the
 * whole of it, the second blue scrolling down it in thin strands, the streaks
 * falling in their fixed columns, churned foam along the lip and the right
 * edge, mist at the base, and the green flicker of what it is holding back
 * while it is closed. A parting thins the sheet and the two kinds of fall
 * that ride its alpha; it takes none of them away. Every one of them is a
 * function of the tick alone.
 */
function drawWater(face: Face, prop: Prop, tick: number, open: number): void {
  const { water } = face;
  const sheet = sheetAlpha(open);

  water.clear();
  water.rect(0, 0, prop.w, prop.h).fill({ color: WATERFALL_COLOURS.water, alpha: sheet });

  for (const fall of face.falls) {
    water
      .rect(fall.x, topOf(fall, prop, tick), fall.width, fall.length)
      .fill({ color: fall.fill.color, alpha: fall.fill.alpha * sheet });
  }

  drawFoam(water, prop, tick, open);
  drawMist(water, prop, tick);

  if (open === 0 && flickering(tick)) {
    drawFlicker(water, prop, tick);
  }
}

/** The waterfalls of a room, drawn in code behind the props and the wizard. */
export interface WaterfallView {
  /** One node for every waterfall of the room, in world units. */
  readonly view: Container;
  /** Draw the waterfalls this world has, as this camera sees them. */
  update(state: WorldState, camera: Camera): void;
  /**
   * What was drawn: for each face, whether it was on screen, how far it had
   * parted, and where its top-left corner stands in view units — the same
   * reading game/render/props.ts publishes for the creature's eyes, so a
   * browser test can find the face it is looking at.
   */
  report(): string;
}

/**
 * The waterfalls of a room. `logs` are the lines of the bug that lives here,
 * as bug-quest.md's manifest gives them; a room with no bug is handed none and
 * shows the flavour chatter alone. Nothing is loaded, so there is nothing to
 * wait for: the whole prop is rectangles and the font above.
 */
export function createWaterfall(logs: readonly string[]): WaterfallView {
  const lines = logLines(logs);
  const view = new Container();
  const faces = new Map<number, Face>();
  let shown = '';

  function faceFor(prop: Prop): Face {
    const known = faces.get(prop.id);

    if (known !== undefined) {
      return known;
    }

    const face = buildFace(prop, lines);

    faces.set(prop.id, face);
    view.addChild(face.view);

    return face;
  }

  return {
    view,

    update(state: WorldState, camera: Camera): void {
      const fields: string[] = [];

      for (const prop of state.props) {
        if (prop.kind !== 'waterfall') {
          continue;
        }

        const seen = onScreen(prop, camera);
        const open = parted(prop, state.tick);
        const bright = fade(open, WATERFALL.rainAlpha.closed, WATERFALL.rainAlpha.parted);

        // A waterfall off screen is not drawn at all — neither its water,
        // which is redrawn every tick, nor its text, which is only moved — and
        // one the view has never reached is not built either: the rain behind
        // its sheet is some thousands of glyphs, and a room may never show the
        // wizard its water at all.
        if (!seen) {
          const known = faces.get(prop.id);

          if (known !== undefined) {
            known.view.visible = false;
          }
        } else {
          const face = faceFor(prop);
          const rows = face.text.children;

          face.view.visible = true;
          // The roll of whole lines stands in front of the sheet and is hidden
          // by its own alpha, which is the parting itself: nothing of it while
          // the water is closed, all of it while the water is wide open, and
          // the same ramp as the sheet in between.
          face.text.alpha = open;

          rows.forEach((row, index) => {
            const y = rowY(index, state.tick, rows.length);

            // Most of the roll waits off the face, where the mask cuts it;
            // Pixi batches a masked-out child all the same unless it is told.
            row.visible = y + CELL_H > 0 && y < prop.h;
            row.y = y;
          });

          face.rain.forEach((column, index) => {
            column.y = rainY(prop, index, state.tick);
            column.alpha = bright;
          });

          drawWater(face, prop, state.tick, open);
        }

        fields.push(
          `waterfall:${prop.id}=${seen ? 'on' : 'off'},${open.toFixed(2)},` +
            `${prop.x - camera.x},${prop.y - camera.y}`,
        );
      }

      shown = fields.join(' ');
    },

    report(): string {
      return shown;
    },
  };
}
