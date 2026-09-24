// The waterfall in a real browser: HWP-025's acceptance. The water is closed
// before anything touches it and parted after a charge hit, the log lines
// behind it can be read at scale 4, and the same tick draws the same frame
// twice (docs/plan/02-design/rendering-and-look.md, the waterfall).
//
// The claims are made on the pixels of the face itself, clipped out of the
// window by the view-unit corner game/render/waterfall.ts publishes, and both
// frames of the acceptance are attached to the run so they can be looked at.

import { expect, test, type Page, type TestInfo } from '@playwright/test';
import sharp from 'sharp';

import forestGlade from '../../game/content/rooms/forest-glade';
import { VIEW_H, VIEW_W, WATERFALL_COLOURS } from '../../game/render/config';
import { parseRoom, type Prop } from '../../game/sim/index';

import { fieldsOf } from './wizard-frame';

/** Scale 4, the window the acceptance names: 1280 by 720 of a 320 by 180 view. */
test.use({ viewport: { width: VIEW_W * 4, height: VIEW_H * 4 } });

/** Window pixels per world unit here; the view fills the window, so no offset. */
const SCALE = 4;

/** The glade's own waterfall, as its text map places it. */
const GLADE_FALL = parseRoom(forestGlade).props.find((prop) => prop.kind === 'waterfall') as Prop;

/**
 * How far clear of the water the wizard is stood before he charges into it,
 * and how far below its lip. He is put on the far side of the gap: the glade's
 * plateau is the rock the water falls down, so under the lip there is nothing
 * to the left of the column but that rock, and everything that reaches the
 * water below its surface reaches it from the air on the right.
 */
const CLEAR = 28;
const DEPTH = 8;

/**
 * Units of the face that stand clear of the bushes in front: that layer is
 * drawn over the actors (rendering-and-look.md, layer stack) and covers the
 * foot of the column, so the reading is taken from the face above it.
 */
const CLEAR_ROWS = 60;

/** How far off an ink's own colour a pixel may be, per channel, and still be it. */
const INK_TOLERANCE = 20;

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
 * Stand the wizard beside the water, facing it. The waterfall is what is under
 * test, so he is put where he has to be rather than played there; only a test
 * writes to the world like this, the way tests/smoke/props.spec.ts does.
 */
async function standBeside(page: Page): Promise<void> {
  await page.evaluate(
    (at) => {
      const { player } = window.wizard.state();

      player.x = at.x;
      player.y = at.y;
      player.vx = 0;
      player.vy = 0;
      player.facing = -1;
      player.chargeCooldown = 0;
    },
    { x: GLADE_FALL.x + GLADE_FALL.w + CLEAR, y: GLADE_FALL.y + DEPTH },
  );
  await drawn(page);
}

/** Charge him into the column, and say whether the charge is what hit it. */
async function chargeIn(page: Page): Promise<boolean> {
  const hit = await page.evaluate((patience) => {
    const state = window.wizard.state();
    const fall = state.props.find((prop) => prop.kind === 'waterfall');
    let charged = false;

    for (let step = 0; step < patience && (fall?.hitTick ?? -1) < 0; step += 1) {
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

/** Is this pixel one of the two inks the log lines are written in? */
function isInk(data: Buffer, at: number): boolean {
  return [WATERFALL_COLOURS.evidence, WATERFALL_COLOURS.flavour].some((colour) =>
    [16, 8, 0].every(
      (shift, channel) =>
        Math.abs((data[at + channel] ?? 0) - ((colour >> shift) & 0xff)) <= INK_TOLERANCE,
    ),
  );
}

/**
 * The log text on the screen: how many of the face's pixels carry one of the
 * two inks, how many rows of the window any of it reaches, and the longest run
 * of it across one row. That is what "legible" means here — a glyph pixel is
 * one pixel of the render texture, so at scale 4 the thinnest stroke is two
 * window pixels wide, and text that falls down the face touches most of it,
 * where a smear or a stray tinted pixel would do neither.
 */
async function textOnScreen(page: Page): Promise<{ ink: number; rows: number; run: number }> {
  const { data, width, channels } = await facePixels(page);
  const inked = new Set<number>();
  let ink = 0;
  let run = 0;
  let current = 0;

  for (let pixel = 0; pixel * channels < data.length; pixel += 1) {
    if (isInk(data, pixel * channels)) {
      ink += 1;
      current += 1;
      run = Math.max(run, current);
      inked.add(Math.floor(pixel / width));
    } else {
      current = 0;
    }

    if ((pixel + 1) % width === 0) {
      current = 0;
    }
  }

  return { ink, rows: inked.size, run };
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

test('is closed until a charge hit parts it, and the logs come out', async ({ page }, info) => {
  await open(page);
  await standBeside(page);

  const closed = await face(page);

  expect(closed.open).toBe(0);
  await shot(page, info, 'waterfall-closed.png');

  // Near opaque: what little of the ink survives the water is not text.
  const hidden = await textOnScreen(page);

  expect(hidden.ink).toBeLessThan(40);
  expect(await chargeIn(page)).toBe(true);

  const parted = await face(page);

  expect(parted.open).toBe(1);
  await shot(page, info, 'waterfall-parted.png');

  // And the lines are there to be read: whole blocks of ink, at least two
  // window pixels to a glyph pixel at this scale, running down most of the
  // face through the gap the water left.
  const shown = await textOnScreen(page);

  expect(shown.ink).toBeGreaterThan(hidden.ink + 1000);
  expect(shown.run).toBeGreaterThanOrEqual(2);
  expect(shown.rows).toBeGreaterThan((CLEAR_ROWS * SCALE) / 2);
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
