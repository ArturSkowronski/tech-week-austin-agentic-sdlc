// The waterfall in a real browser: HWP-025's acceptance, and HWP-092's. The
// water is closed before anything touches it, parted after a charge hit and
// parted again for as long as the wizard stands beside it; one whole log line
// of the roll behind it reads at scale 4; and the same tick draws the same
// frame twice (docs/plan/02-design/rendering-and-look.md, the waterfall).
//
// The claims are made on the pixels of the face itself, clipped out of the
// window by the view-unit corner game/render/waterfall.ts publishes, and both
// frames of the acceptance are attached to the run so they can be looked at.

import { expect, test, type Page, type TestInfo } from '@playwright/test';
import sharp from 'sharp';

import forestGlade from '../../game/content/rooms/forest-glade';
import { LOG_TEXT, VIEW_H, VIEW_W, WATERFALL_COLOURS } from '../../game/render/config';
import { CELL_H, CELL_W, logLines, rollOf, rowWidth, rowY } from '../../game/render/waterfall';
import {
  bugForRoom,
  parseRoom,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  WATER_NEAR,
  type Prop,
} from '../../game/sim/index';

import { fieldsOf } from './wizard-frame';

/** Scale 4, the window the acceptance names: 1280 by 720 of a 320 by 180 view. */
test.use({ viewport: { width: VIEW_W * 4, height: VIEW_H * 4 } });

/** Window pixels per world unit here; the view fills the window, so no offset. */
const SCALE = 4;

/** The glade's own waterfall, as its text map places it. */
const GLADE_FALL = parseRoom(forestGlade).props.find((prop) => prop.kind === 'waterfall') as Prop;

/**
 * How far clear of the water the wizard is stood before he charges into it,
 * and how far below its lip. It is measured off WATER_NEAR rather than
 * written down, because clearing that reach is what keeps the water closed
 * while he stands there: "is closed while he is clear of it" rests on it.
 *
 * He is put on the far side of the gap: the glade's plateau is the rock the
 * water falls down, so under the lip there is nothing to the left of the
 * column but that rock, and everything that reaches the water below its
 * surface reaches it from the air on the right.
 */
const CLEAR = WATER_NEAR + 4;
const DEPTH = 8;

/**
 * Units of the face that stand clear of the bushes in front: that layer is
 * drawn over the actors (rendering-and-look.md, layer stack) and covers the
 * foot of the column, so the reading is taken from the face above it. It is
 * the band the roll is stepped against, and game/render/config.ts owns it.
 */
const CLEAR_ROWS = LOG_TEXT.band;

/** How far off an ink's own colour a pixel may be, per channel, and still be it. */
const INK_TOLERANCE = 20;

/**
 * The rows the glade's water hides, the chatter and the manifest's own, each
 * line on the rows the parting shows it whole on (game/render/waterfall.ts).
 */
const GLADE_LINES = rollOf(GLADE_FALL, logLines(bugForRoom('forest-glade')?.logs ?? []));

/** Where the first of the manifest's lines stands in the roll, and what it says. */
const EVIDENCE_AT = GLADE_LINES.findIndex((line) => line.real);
const EVIDENCE = GLADE_LINES[EVIDENCE_AT]?.text ?? '';

/**
 * The first tick the roll stands that line whole inside the clear rows, so a
 * frame taken there has a whole line to read. The geometry is
 * game/render/waterfall.ts's own, so the test does not guess at a tick.
 */
function tickShowingEvidence(): number {
  for (let tick = 1; tick < 2000; tick += 1) {
    const y = rowY(EVIDENCE_AT, tick, GLADE_LINES.length);

    if (y >= 0 && y + CELL_H <= CLEAR_ROWS) {
      return tick;
    }
  }

  throw new Error('the roll never brings the evidence into the clear rows');
}

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

/** What the waterfall layer published about the glade's face this frame. */
async function face(page: Page): Promise<{ on: boolean; open: number; x: number; y: number }> {
  const field = (await fieldsOf(page, 'waterfall')).get(`waterfall:${GLADE_FALL.id}`) ?? '';
  const [on = '', open = '', x = '', y = ''] = field.split(',');

  return { on: on === 'on', open: Number(open), x: Number(x), y: Number(y) };
}

/**
 * Put the wizard at rest on this corner, facing this way. The waterfall is
 * what is under test, so he is put where he has to be rather than played
 * there; only a test writes to the world like this, the way
 * tests/smoke/props.spec.ts does.
 */
async function standAt(page: Page, at: { x: number; y: number }, facing: 1 | -1): Promise<void> {
  await page.evaluate(
    (put) => {
      const { player } = window.wizard.state();

      player.x = put.at.x;
      player.y = put.at.y;
      player.vx = 0;
      player.vy = 0;
      player.facing = put.facing;
      player.chargeCooldown = 0;
    },
    { at, facing },
  );
  await drawn(page);
}

/** Stand him clear of the water on the far side of the gap, facing it. */
function standBeside(page: Page): Promise<void> {
  return standAt(page, { x: GLADE_FALL.x + GLADE_FALL.w + CLEAR, y: GLADE_FALL.y + DEPTH }, -1);
}

/**
 * Stand him on the plateau the water falls down, half the water's reach short
 * of its lip and facing it: dry, on solid ground, and well inside the tile
 * and a half the water parts for (game/sim/constants.ts, `WATER_NEAR`).
 */
function standOnTheLip(page: Page): Promise<void> {
  return standAt(
    page,
    { x: GLADE_FALL.x - PLAYER_WIDTH - WATER_NEAR / 2, y: GLADE_FALL.y - PLAYER_HEIGHT },
    1,
  );
}

/**
 * Charge him into the column, and say whether the charge is what hit it. The
 * run is stopped on the event and not on `hitTick`: the dash carries him
 * inside the tile and a half the water parts for before the crystal reaches
 * it, so the stamp is already taken by the time the hit lands (HWP-092).
 */
async function chargeIn(page: Page): Promise<boolean> {
  const hit = await page.evaluate((patience) => {
    const state = window.wizard.state();
    let charged = false;

    for (let step = 0; step < patience && !charged; step += 1) {
      window.wizard.step(1, { charge: true });
      charged ||= state.events.includes('charge:hit:waterfall');
    }

    return charged;
  }, 20);

  await drawn(page);

  return hit;
}

/** The face's own pixels, clipped out of the window above the bushes in front. */
async function facePixels(page: Page): Promise<{ data: Buffer; width: number; channels: number }> {
  const at = await face(page);
  const { data, info } = await sharp(
    await page.screenshot({
      clip: {
        x: Math.round(at.x * SCALE),
        y: Math.round(at.y * SCALE),
        width: Math.round(GLADE_FALL.w * SCALE),
        height: Math.round(CLEAR_ROWS * SCALE),
      },
    }),
  )
    .raw()
    .toBuffer({ resolveWithObject: true });

  return { data, width: info.width, channels: info.channels };
}

/** Is this pixel that colour, give or take the tolerance, in every channel? */
function isColour(data: Buffer, at: number, colour: number): boolean {
  return [16, 8, 0].every(
    (shift, channel) =>
      Math.abs((data[at + channel] ?? 0) - ((colour >> shift) & 0xff)) <= INK_TOLERANCE,
  );
}

/** Is this pixel one of the two inks the log lines are written in? */
function isInk(data: Buffer, at: number): boolean {
  return [WATERFALL_COLOURS.evidence, WATERFALL_COLOURS.flavour].some((colour) =>
    isColour(data, at, colour),
  );
}

/** What an ink leaves on the face, in window pixels. */
interface Mark {
  /** How many of the face's pixels carry it. */
  pixels: number;
  /** How many rows of the window any of it reaches. */
  rows: number;
  /** The longest unbroken run of it across one row. */
  run: number;
  /** The box it all stands in, across and down. */
  width: number;
  height: number;
}

/**
 * One walk of the face's pixels, reading off everything the two claims need.
 * That is what "legible" means here — a glyph pixel is one pixel of the
 * render texture, so at scale 4 the thinnest stroke is two window pixels
 * wide, and a line drawn as one horizontal row fills its box across and is
 * only a glyph tall, where a smear or a stray tinted pixel would be neither.
 */
async function markOf(page: Page, is: (data: Buffer, at: number) => boolean): Promise<Mark> {
  const { data, width, channels } = await facePixels(page);
  const box = { left: width, right: -1, top: Number.POSITIVE_INFINITY, bottom: -1 };
  const rows = new Set<number>();
  let pixels = 0;
  let run = 0;
  let current = 0;

  for (let pixel = 0; pixel * channels < data.length; pixel += 1) {
    const x = pixel % width;
    const y = Math.floor(pixel / width);

    if (!is(data, pixel * channels)) {
      current = 0;
      continue;
    }

    pixels += 1;
    current = x === 0 ? 1 : current + 1;
    run = Math.max(run, current);
    rows.add(y);
    box.left = Math.min(box.left, x);
    box.right = Math.max(box.right, x);
    box.top = Math.min(box.top, y);
    box.bottom = Math.max(box.bottom, y);
  }

  return {
    pixels,
    rows: rows.size,
    run,
    width: box.right - box.left + 1,
    height: box.bottom - box.top + 1,
  };
}

/**
 * Keep the frame with the run, so the acceptance can be looked at. It is
 * written to the test's own output directory first and attached by path:
 * `playwright.config.ts` reports with `list`, which keeps no attachment
 * bodies, so a frame attached as a body alone survives only under a reporter
 * nobody runs. Written like this it is on disk after a plain `pnpm
 * test:browser`, under `test-results/<test>/`.
 */
async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  const path = info.outputPath(name);

  await page.screenshot({ path });
  await info.attach(name, { path, contentType: 'image/png' });
}

test('is left undrawn until the view reaches it', async ({ page }) => {
  await open(page);

  // The run starts at the far left of the glade; the water is six tiles of
  // charge gap away and nothing of it is drawn.
  expect((await face(page)).on).toBe(false);

  await standBeside(page);
  expect((await face(page)).on).toBe(true);
});

test('is closed while he is clear of it, and a charge brings the logs out', async ({
  page,
}, info) => {
  // Two screenshots of the face and a charge run tick by tick: more than one
  // timeout's worth of work on a loaded machine.
  test.slow();

  await open(page);
  await standBeside(page);

  const closed = await face(page);

  expect(closed.open).toBe(0);
  await shot(page, info, 'waterfall-closed.png');

  // Near opaque: what little of the ink survives the water is not text.
  const hidden = await markOf(page, isInk);

  expect(hidden.pixels).toBeLessThan(40);
  expect(await chargeIn(page)).toBe(true);

  const parted = await face(page);

  expect(parted.open).toBe(1);
  await shot(page, info, 'waterfall-parted.png');

  // And the lines are there to be read: whole blocks of ink, at least two
  // window pixels to a glyph pixel at this scale, lying in the few rows a
  // line of glyphs takes rather than smeared down the face.
  const shown = await markOf(page, isInk);

  expect(shown.pixels).toBeGreaterThan(hidden.pixels + 400);
  expect(shown.run).toBeGreaterThanOrEqual(2);
  expect(shown.rows).toBeGreaterThanOrEqual(CELL_H * SCALE);
  expect(shown.rows).toBeLessThanOrEqual(3 * CELL_H * SCALE);
});

test('parts while he stands beside it and reads one whole log line', async ({ page }, info) => {
  // A screenshot of the window and a second of the face: more than one
  // timeout's worth of work on a loaded machine.
  test.slow();

  await open(page);
  await standOnTheLip(page);

  // Nothing has touched the water yet; standing at the lip is what parts it,
  // and it stays parted for as long as he is there.
  await page.evaluate((count) => {
    window.wizard.step(count);
  }, tickShowingEvidence());
  await drawn(page);

  expect((await face(page)).open).toBe(1);
  await shot(page, info, 'waterfall-beside.png');

  // One whole line, laid out across the water: as wide as the line is drawn,
  // bar the blank outer column a first or last glyph may have, and only a
  // glyph tall.
  const line = await markOf(page, (data, at) =>
    isColour(data, at, WATERFALL_COLOURS.evidence),
  );

  expect(line.width).toBeGreaterThanOrEqual((rowWidth(EVIDENCE) - CELL_W) * SCALE);
  expect(line.width).toBeLessThanOrEqual(rowWidth(EVIDENCE) * SCALE);
  expect(line.height).toBeLessThanOrEqual(CELL_H * SCALE);
  expect(line.pixels).toBeGreaterThan(100);
});

test('draws the same frame for the same tick', async ({ page }) => {
  // Three runs of the same room to the same tick, each of them a screenshot:
  // more than one timeout's worth of work on a loaded machine.
  test.slow();

  /** The face, run to the same tick from a fresh world, as a picture. */
  async function frameAt(ticks: number): Promise<Buffer> {
    await page.evaluate(() => {
      window.wizard.reset();
    });
    await standBeside(page);
    await page.evaluate((count) => {
      window.wizard.state().props.forEach((prop) => {
        if (prop.kind === 'waterfall') {
          // The water is parted for the frame, so the text behind it is part
          // of what is being compared and not only the water over it.
          prop.hitTick = 0;
        }
      });
      window.wizard.step(count);
    }, ticks);
    await drawn(page);

    return (await facePixels(page)).data;
  }

  await open(page);

  const first = await frameAt(37);
  const again = await frameAt(37);

  expect(again.equals(first)).toBe(true);
  // And a different tick is a different frame: the water is falling.
  expect((await frameAt(38)).equals(first)).toBe(false);
});
