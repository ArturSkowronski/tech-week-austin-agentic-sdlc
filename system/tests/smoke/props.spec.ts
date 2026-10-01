// The props in a real browser: HWP-024's acceptance. Every prop of the glade
// is drawn from the first frame, charging one plays the animation its kind
// has (rendering-and-look.md, Sprites), a hit shakes it, and the creature's
// eyes blink at the prop it hides in (bug-quest.md, the creature).
//
// What was drawn is read off the report game/render/props.ts publishes on the
// canvas, the way the wizard's frame and the layer stack are read, and one
// screenshot of each animation is attached to the run so the frames can be
// looked at as well.

import { readFile } from 'node:fs/promises';

import { expect, test, type Page, type TestInfo } from '@playwright/test';
import sharp from 'sharp';

import forestGlade from '../../game/content/rooms/forest-glade';
import {
  CREATURE_EYES,
  CREATURE_SEAT,
  PROP_SHAKE,
  SPRITE_FOOT_OFFSET,
  VIEW_H,
  VIEW_W,
  type CreatureSeat,
} from '../../game/render/config';
import { EYE_MARKS } from '../../game/render/creature';
import {
  HIDING_PLACES,
  parseRoom,
  PLAYER_HEIGHT,
  PROP_SIZE,
  VICTORY_CAST_HIT_TICKS,
  type HidingPlace,
  type InputFrame,
  type Vec2,
} from '../../game/sim/index';

import { fieldsOf, hatOf, numbers } from './wizard-frame';

/** The view at the smallest scale ADR-003 allows: it fills the window exactly. */
const VIEWPORT = { width: VIEW_W * 2, height: VIEW_H * 2 } as const;

test.use({ viewport: { ...VIEWPORT } });

/** Window pixels per world unit here; the view fills the window, so no offset. */
const SCALE = VIEWPORT.width / VIEW_W;

/** How far left of a prop the wizard is stood before he goes at it. */
const CLEAR = 28;

/**
 * Ticks he is given to reach the prop from there; he needs a third of them to
 * walk it. The beacon takes the longest: it is stamped when the victory cast's
 * beam lands on it rather than when he touches it (level-design.md, the beacon
 * ends the run), so the whole cast has to fit inside this as well.
 */
const PATIENCE = 40 + VICTORY_CAST_HIT_TICKS;

/**
 * Ticks that outlast both the rustle and the dash that starts it: the charge
 * stamps a prop again on every tick its tip is still inside it, so the last
 * hit of one charge can be a dozen ticks after the first.
 */
const SETTLE = 60;

/** The props the glade's map carries, in the order the parser finds them. */
const GLADE_PROPS = parseRoom(forestGlade).props;

/** Let the loop take a frame; it draws the world once per animation frame. */
function drawn(page: Page): Promise<void> {
  return page.evaluate(
    () =>
      new Promise<void>((done) => {
        requestAnimationFrame(() => requestAnimationFrame(() => done()));
      }),
  );
}

/** Open the glade on a paused clock, past the title, with one frame drawn. */
async function open(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.wizard !== undefined);
  await page.evaluate(() => {
    window.wizard.paused = true;
    window.wizard.start();
  });
  await drawn(page);
}

/** What every prop of the glade drew, by kind and prop id, and the eyes. */
async function shown(page: Page): Promise<Map<string, string>> {
  return fieldsOf(page, 'props');
}

/** The cell the first prop of one kind is showing, and how far a hit shook it. */
async function drew(page: Page, kind: string): Promise<{ frame: number; shake: number }> {
  const prop = GLADE_PROPS.find((found) => found.kind === kind);
  const [frame = '', shake = ''] = ((await shown(page)).get(`${kind}:${prop?.id}`) ?? '').split(
    ',',
  );

  return { frame: Number(frame), shake: Number(shake) };
}

/**
 * Stand the wizard beside the first prop of a kind and hold one input until
 * the prop has been touched. The props are what is under test, so he is put
 * in front of them rather than played across the room to each; only a test
 * writes to the world like this, the way tests/smoke/wizard.spec.ts does.
 */
async function reach(page: Page, kind: string, input: Partial<InputFrame>): Promise<void> {
  await page.evaluate(
    (at) => {
      const state = window.wizard.state();
      const prop = state.props.find((found) => found.kind === at.kind);

      if (prop === undefined) {
        throw new Error(`the glade carries no ${at.kind}`);
      }

      const { player } = state;

      // On the prop's own base line, a little clear of its left edge, facing it.
      player.x = prop.x - at.clear;
      player.y = prop.y + prop.h - at.height;
      player.vx = 0;
      player.vy = 0;
      player.facing = 1;
      player.chargeCooldown = 0;

      for (let tick = 0; tick < at.patience && prop.hitTick < 0; tick += 1) {
        window.wizard.step(1, at.input);
      }

      if (prop.hitTick < 0) {
        throw new Error(`the wizard never reached the ${at.kind}`);
      }
    },
    { kind, input, clear: CLEAR, height: PLAYER_HEIGHT, patience: PATIENCE },
  );
  await drawn(page);
}

/** Run the clock on, without touching anything, and draw the frame it ends on. */
async function wait(page: Page, ticks: number): Promise<void> {
  await page.evaluate((count) => {
    window.wizard.step(count);
  }, ticks);
  await drawn(page);
}

/**
 * Keep the frame with the run, so the animation can be looked at: written to
 * the test's own output directory and attached by path, because
 * `playwright.config.ts` reports with `list` and a body-only attachment is
 * dropped by it, leaving nothing on disk (tests/smoke/creature.spec.ts).
 */
async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  const path = info.outputPath(name);

  await page.screenshot({ path });
  await info.attach(name, { path, contentType: 'image/png' });
}

/** The point in view units the eyes stand at, as the report gives it. */
async function eyesAt(page: Page): Promise<string> {
  return (await shown(page)).get('eyes') ?? '';
}

/** The same point, read as a pair, for a sample of the screen around it. */
async function eyePoint(page: Page): Promise<Vec2> {
  const [x = 0, y = 0] = numbers(await eyesAt(page));

  return { x, y };
}

/** How far off the eyes' own red, per channel, a pixel may be and still be one. */
const EYE_TOLERANCE = 60;

/**
 * How many pixels of the eyes' red are on screen around a point of the view.
 * The eyes are drawn in code in one flat colour, so counting that colour is
 * the only way to tell eyes that were drawn from eyes some other layer
 * painted over — which a report of where they were put cannot say.
 */
async function eyeRedAround(page: Page, at: Vec2): Promise<number> {
  const { patch, eye, colour } = CREATURE_EYES;
  const { data, info } = await sharp(
    await page.screenshot({
      clip: {
        x: Math.round((at.x - patch) * SCALE),
        y: Math.round((at.y - eye * 2) * SCALE),
        width: Math.round(patch * 2 * SCALE),
        height: Math.round(eye * 4 * SCALE),
      },
    }),
  )
    .raw()
    .toBuffer({ resolveWithObject: true });
  let seen = 0;

  for (let px = 0; px + info.channels <= data.length; px += info.channels) {
    const near = (shift: number, channel: number): boolean =>
      Math.abs((data[px + channel] ?? 0) - ((colour >> shift) & 0xff)) <= EYE_TOLERANCE;

    if (near(16, 0) && near(8, 1) && near(0, 2)) {
      seen += 1;
    }
  }

  return seen;
}

/** Window pixels of the eyes' red two whole eyes come to at this scale. */
const BOTH_EYES = CREATURE_EYES.eye ** 2 * SCALE ** 2 * 2;

/** Where the creature sits in the glade's first prop of a kind, in world units. */
function seatIn(kind: HidingPlace): Vec2 {
  const prop = GLADE_PROPS.find((found) => found.kind === kind);
  const seat = CREATURE_SEAT[kind];

  return {
    x: (prop?.x ?? 0) + seat.x,
    y: (prop?.y ?? 0) + (prop?.h ?? 0) + SPRITE_FOOT_OFFSET - seat.up,
  };
}

/**
 * Put the creature in the first prop of a kind — or send it travelling, which
 * draws nothing — and give back where it was drawn. HWP-051 is what puts the
 * creature in its hiding place; until it lands, the test places it where
 * bugs/manifest.json says it hides.
 */
async function hideIn(page: Page, kind: HidingPlace | null): Promise<string> {
  await page.evaluate((hides) => {
    const state = window.wizard.state();
    const prop = state.props.find((found) => found.kind === hides);

    state.creature = {
      at: prop?.id ?? -1,
      travelTo: prop === undefined ? 0 : -1,
      travelUntil: prop === undefined ? 30 : -1,
      carriedSince: -1,
      firstCarried: false,
    };
  }, kind);
  await drawn(page);

  return eyesAt(page);
}

/**
 * Stand the wizard beside a prop and draw until the eyes stop moving. The
 * glade is wider than the view, so a hiding place is only on screen once the
 * camera has been dragged to it and has come to rest (tests/smoke/creature.spec.ts).
 */
async function cameraOn(page: Page, kind: HidingPlace): Promise<void> {
  await page.evaluate(
    (stand) => {
      const state = window.wizard.state();
      const prop = state.props.find((found) => found.kind === stand.kind);

      if (prop === undefined) {
        throw new Error(`the glade carries no ${stand.kind}`);
      }

      state.player.x = prop.x - stand.clear;
      state.player.y = prop.y + prop.h - stand.height;
    },
    { kind, clear: CLEAR, height: PLAYER_HEIGHT },
  );

  let last = '';

  for (let frame = 0; frame < 90; frame += 1) {
    await drawn(page);

    const now = await eyesAt(page);

    if (now === last) {
      return;
    }

    last = now;
  }

  throw new Error('the camera never came to rest');
}

test('draws every prop of the glade at rest, and leaves the waterfall alone', async ({ page }) => {
  await open(page);

  const fields = await shown(page);
  // The waterfall is drawn in code (HWP-025), so it has no strip and this
  // layer never draws it.
  const expected = GLADE_PROPS.filter((prop) => prop.kind !== 'waterfall').map(
    (prop) => `${prop.kind}:${prop.id}`,
  );

  expect([...fields.keys()].filter((key) => key.includes(':'))).toEqual(expected);
  // Every one of them on its idle frame, and none of them shaken.
  expect(expected.map((key) => fields.get(key))).toEqual(expected.map(() => '0,0'));
});

test('a charge rustles the bush and shakes it, and it settles again', async ({ page }, info) => {
  await open(page);
  await reach(page, 'bush', { charge: true });

  const hit = await drew(page, 'bush');

  expect(hit.frame).toBeGreaterThan(0);
  expect(Math.abs(hit.shake)).toBe(PROP_SHAKE.units);
  await shot(page, info, 'bush-rustling.png');

  // The rustle is 24 ticks long, and the shake four of them.
  await wait(page, SETTLE);
  expect(await drew(page, 'bush')).toEqual({ frame: 0, shake: 0 });
});

test('a charge sets the log chattering', async ({ page }, info) => {
  await open(page);
  await reach(page, 'log', { charge: true });

  expect((await drew(page, 'log')).frame).toBeGreaterThan(0);
  await shot(page, info, 'log-chattering.png');
});

test('a charge cracks the rock and it stays open', async ({ page }, info) => {
  await open(page);
  await reach(page, 'rock', { charge: true });

  expect((await drew(page, 'rock')).frame).toBe(1);

  // Four crack frames, and the last of them is the open one it keeps.
  await wait(page, SETTLE);
  const cracked = (await drew(page, 'rock')).frame;

  await shot(page, info, 'rock-open.png');
  await wait(page, 120);
  expect(cracked).toBe(4);
  expect((await drew(page, 'rock')).frame).toBe(cracked);
});

test('the flag raises and then waves, and the beacon lights and then burns', async ({
  page,
}, info) => {
  for (const kind of ['flag', 'beacon'] as const) {
    await open(page);
    await reach(page, kind, { right: true });

    expect((await drew(page, kind)).frame, `${kind} raised`).toBe(1);

    // Two frames of raising or lighting, then the two it loops on for good.
    await wait(page, 12);
    expect((await drew(page, kind)).frame, `${kind} looping`).toBeGreaterThan(2);
    await shot(page, info, `${kind}-lit.png`);
    await wait(page, 120);
    expect((await drew(page, kind)).frame, `${kind} still looping`).toBeGreaterThan(2);
  }
});

test('the creature blinks its eyes at the prop it hides in', async ({ page }, info) => {
  await open(page);

  // A run opens on tick 0 with the eyes open, so the start-of-run shot the
  // acceptance asks for has eyes in it rather than a blink.
  const atBush = await hideIn(page, 'bush');

  await shot(page, info, 'eyes-at-the-bush.png');

  const atLog = await hideIn(page, 'log');

  await shot(page, info, 'eyes-at-the-log.png');

  expect(atBush).toMatch(/^-?[\d.]+,-?[\d.]+$/);
  // The wizard has not moved between the two frames, so neither has the
  // camera: the eyes moved by the distance between the two seats, which is
  // not the distance between the two cells' middles (HWP-089).
  const [bushX = 0, bushY = 0] = numbers(atBush);
  const [logX = 0, logY = 0] = numbers(atLog);

  expect(logX - bushX).toBeCloseTo(seatIn('log').x - seatIn('bush').x);
  expect(logY - bushY).toBeCloseTo(seatIn('log').y - seatIn('bush').y);

  // And a creature on its way from one hiding place to the next shows nothing.
  expect(await hideIn(page, null)).toBe('none');
});

/** The idle frame of a prop's strip, off the art `pnpm assets` cut. */
interface IdleFrame {
  /** Pixels across and down, and pixels per world unit (ADR-003's density). */
  readonly w: number;
  readonly h: number;
  readonly density: number;
  /** How bright a pixel is, 0 to 255, or null where the sprite draws nothing. */
  lumAt: (x: number, y: number) => number | null;
}

/** What the kit wrote for one strip, as `public/assets/manifest.json` gives it. */
interface StripEntry {
  readonly width: number;
  readonly height: number;
  readonly cellW: number;
  readonly frames: number;
}

/**
 * The first frame of a hiding place's strip, which is the one every prop of
 * the glade is drawn on at rest. Its geometry is read off the manifest rather
 * than written down again here (AGENTS.md rule 9), the way the parallax and
 * wizard specs read the art the kit wrote.
 */
async function idleFrameOf(kind: HidingPlace): Promise<IdleFrame> {
  const manifest = JSON.parse(await readFile('public/assets/manifest.json', 'utf8')) as Record<
    string,
    StripEntry | undefined
  >;
  const entry = manifest[`props/${kind}`];

  if (entry === undefined) {
    throw new Error(`the kit wrote no strip for the ${kind}`);
  }

  const w = entry.width / entry.frames;
  const { data, info } = await sharp(await readFile(`public/assets/props/${kind}.png`))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    w,
    h: entry.height,
    density: w / entry.cellW,
    lumAt: (x, y) => {
      if (x < 0 || y < 0 || x >= w || y >= entry.height) return null;

      const at = (y * info.width + x) * info.channels;

      if ((data[at + 3] ?? 0) === 0) return null;

      return ((data[at] ?? 0) + (data[at + 1] ?? 0) + (data[at + 2] ?? 0)) / 3;
    },
  };
}

/** The row of the strip the eyes' middle lands on when seated there. */
function rowOf(frame: IdleFrame, seat: CreatureSeat): number {
  return Math.round(frame.h - seat.up * frame.density);
}

/** How far the eyes alone reach from their middle, in world units. */
const EYE_REACH: Vec2 = { x: CREATURE_EYES.patch / 2, y: CREATURE_EYES.eye / 2 };

/**
 * The same for everything the creature draws there, the glow pixels included.
 * Read off `EYE_MARKS`, which is what the renderer puts on the screen, so the
 * extent cannot drift from the mark. Each side of every square is measured
 * from the middle, so the box holds the whole mark whether or not the marks
 * come out symmetric, which nothing asserts (issue #127 review).
 */
const MARK_REACH: Vec2 = {
  x: Math.max(...EYE_MARKS.flatMap((mark) => [-mark.x, mark.x + mark.size])),
  y: Math.max(...EYE_MARKS.flatMap((mark) => [-mark.y, mark.y + mark.size])),
};

/**
 * The art a box of a seat covers: how bright it is on average, how bright its
 * brightest pixel is, and how many of its pixels the sprite draws nothing on.
 * `reach` is how far the box goes out from the seat and up and down from its
 * row. A pixel off the sprite altogether counts as the brightest there is,
 * which is as far from a hollow as a pixel can be.
 */
function artUnder(
  frame: IdleFrame,
  seat: CreatureSeat,
  reach: Vec2 = EYE_REACH,
): { mean: number; brightest: number; blank: number } {
  const at = (unit: number): number => Math.round(unit * frame.density);
  const row = rowOf(frame, seat);
  const right = at(seat.x + reach.x);
  const bottom = row + at(reach.y);
  let sum = 0;
  let drawn = 0;
  let blank = 0;
  let brightest = 0;

  for (let y = row - at(reach.y); y < bottom; y += 1) {
    for (let x = at(seat.x - reach.x); x < right; x += 1) {
      const lum = frame.lumAt(x, y);

      if (lum === null) {
        blank += 1;
      } else {
        sum += lum;
        drawn += 1;
      }

      brightest = Math.max(brightest, lum ?? 255);
    }
  }

  return { mean: drawn === 0 ? 0 : sum / drawn, brightest, blank };
}

/** The middle of what the sprite draws across one of its rows, in world units. */
function drawnMiddleOn(frame: IdleFrame, row: number): number {
  let from = frame.w;
  let to = -1;

  for (let x = 0; x < frame.w; x += 1) {
    if (frame.lumAt(x, row) === null) continue;

    from = Math.min(from, x);
    to = Math.max(to, x);
  }

  return (from + to + 1) / 2 / frame.density;
}

/** Where the eyes sat before HWP-089: the middle of the prop's own cell. */
function cellMiddle(kind: HidingPlace): CreatureSeat {
  const { w, h } = PROP_SIZE[kind];

  return { x: w / 2, up: (h ?? 0) / 2 + SPRITE_FOOT_OFFSET };
}

/**
 * The feature of its strip each seat was measured off, asserted against the
 * pixels the kit cut. The eyes are drawn over the prop in one flat red the
 * props carry nowhere, so counting that red on screen says the eyes arrived —
 * it cannot say they arrived in the hollow, and reads the same with the seat
 * back at the cell's middle. Only the art under the seat tells the two apart,
 * and it is also what a regenerated `props-sheet.png` would move.
 */
const SEAT_SITS_ON: Readonly<Record<HidingPlace, (frame: IdleFrame) => void>> = {
  // The dark open end, against the bark in the middle of the cell the eyes
  // used to be drawn on: less than half as bright (issue #116). The whole
  // mark is on that dark and not only its middle — the brightest pixel the
  // eyes and their glow cover, over every row they cover, clears the bark by
  // the same margin (issue #127), which is what says the hollow is wide
  // enough for them. Wide enough is all it is: the dark run is 13 pixels and
  // the mark 12, so the spare pixel falls on one side only, and the check is
  // for the mark being on the dark rather than for a gap around it.
  log: (frame) => {
    expect(artUnder(frame, CREATURE_SEAT.log, MARK_REACH).brightest * 2).toBeLessThan(
      artUnder(frame, cellMiddle('log')).mean,
    );
  },
  // The middle of the leaf mass the bush draws at the eyes' own height. The
  // bush's measured seat is one unit above its cell middle, so brightness
  // cannot separate the two there; where the leaves are, can.
  bush: (frame) => {
    const middle = drawnMiddleOn(frame, rowOf(frame, CREATURE_SEAT.bush));

    expect(Math.abs(middle - CREATURE_SEAT.bush.x)).toBeLessThanOrEqual(1);
  },
  // The widest step of the crack, which is darker than the lit face around it.
  rock: (frame) => {
    expect(artUnder(frame, CREATURE_SEAT.rock).mean).toBeLessThan(
      artUnder(frame, cellMiddle('rock')).mean,
    );
  },
};

test('every seat is on the feature of its strip it was measured off', async () => {
  for (const kind of HIDING_PLACES) {
    const frame = await idleFrameOf(kind);

    // Wherever the feature is, the eyes themselves are on the drawn prop:
    // a seat that slid off its silhouette would hang them in the air.
    expect(artUnder(frame, CREATURE_SEAT[kind]).blank, kind).toBe(0);
    SEAT_SITS_ON[kind](frame);
  }
});

/**
 * HWP-089's acceptance: the eyes are drawn inside the log's hollow and inside
 * the bush's foliage, with the faint pixel beside each. The seat is read off
 * the prop strips, so what it is worth can only be seen in pixels — the
 * report says where the eyes were put, not what is around them — and the
 * close-up is attached for the hollow and the glow to be looked at.
 */
for (const kind of ['bush', 'log'] as const) {
  test(`the eyes are drawn in the ${kind}, not on it`, async ({ page }, info) => {
    await open(page);
    await hideIn(page, kind);
    await cameraOn(page, kind);

    const at = await eyePoint(page);
    // The art of the hiding place alone, with the creature away from it.
    await hideIn(page, null);

    const onTheArt = await eyeRedAround(page, at);

    await hideIn(page, kind);

    const withEyes = await eyeRedAround(page, at);

    await shot(page, info, `eyes-in-the-${kind}.png`);
    // Neither the bush's leaves nor the log's bark carries the eyes' red, and
    // both eyes reach the screen whole at the seat the report named.
    expect(onTheArt).toBeLessThan(BOTH_EYES);
    expect(withEyes).toBeGreaterThanOrEqual(onTheArt + BOTH_EYES);
    // And the seat they arrived at is the hollow, or the leaves, rather than
    // anywhere else on the prop: that part is in the art, not on the screen.
    SEAT_SITS_ON[kind](await idleFrameOf(kind));
  });
}

test('the eyes ride on the hat in front of the wizard, not behind him', async ({ page }, info) => {
  await open(page);

  const hat = await hatOf(page);

  // The hat's own aged gold falls inside the eye-red tolerance in a pixel or
  // two at any density; which of the sheet's pixels the kit samples is what
  // moved. So the reading before a creature is carried is the baseline the
  // eyes have to clear, and it stays under one eye's worth of the patch.
  const onTheArt = await eyeRedAround(page, hat);

  expect(onTheArt).toBeLessThan(CREATURE_EYES.eye ** 2 * SCALE ** 2);

  // HWP-051 is what hands the creature to the wizard; until it lands, the
  // test carries it, the way it hides it in a prop above. HWP-052 owns the
  // hat case proper — this asserts only that the eyes are not painted over.
  await page.evaluate(() => {
    window.wizard.state().creature = {
      at: -1,
      travelTo: -1,
      travelUntil: -1,
      carriedSince: 0,
      firstCarried: false,
    };
  });
  await drawn(page);
  expect(await eyesAt(page)).toBe(`${hat.x},${hat.y}`);
  await shot(page, info, 'eyes-on-the-hat.png');

  // Two eyes of CREATURE_EYES.eye units square, drawn over the wizard rather
  // than under him: most of their pixels survive to the screen.
  expect(await eyeRedAround(page, hat)).toBeGreaterThan(onTheArt + CREATURE_EYES.eye ** 2 * SCALE ** 2);
});
