// The room layer in a real browser (ADR-004): a room the kit painted shows its
// painting and none of its tiles, F1 lays the tiles over it at half alpha, and
// a room with no painting is drawn out of the atlas from the first frame.
//
// What was drawn is read off the live objects, the way scene.ts publishes the
// fit and the layer stack, and the frames themselves are compared as bytes so
// the report cannot claim a change the canvas did not make. Both frames of the
// ruin gate are attached to the run so the painting can be looked at as well.

import { expect, test, type Page, type TestInfo } from '@playwright/test';

import forestGlade from '../../game/content/rooms/forest-glade';
import { DEBUG_TILE_ALPHA } from '../../game/render/config';
import { parseRoom, Tile, tileAt } from '../../game/sim/index';

import { fieldsOf } from './wizard-frame';

test.use({ viewport: { width: 1280, height: 720 } });

/** Cells of the glade's map that are anything but air, and so are drawn. */
const GLADE_GROUND = ((): number => {
  const { room } = parseRoom(forestGlade);
  let cells = 0;

  for (let y = 0; y < room.height; y += 1) {
    for (let x = 0; x < room.width; x += 1) {
      if (tileAt(room, x, y) !== Tile.Empty) cells += 1;
    }
  }

  return cells;
})();

/** Let the loop take a frame; it draws the world once per animation frame. */
function drawn(page: Page): Promise<void> {
  return page.evaluate(
    () =>
      new Promise<void>((done) => {
        requestAnimationFrame(() => requestAnimationFrame(() => done()));
      }),
  );
}

/** Open a room on a paused clock, past the title, with one frame drawn. */
async function open(page: Page, room: string): Promise<void> {
  await page.goto(`/?room=${room}`);
  await page.waitForFunction(() => window.wizard !== undefined);
  await page.evaluate(() => {
    window.wizard.paused = true;
    window.wizard.start();
  });
  await drawn(page);
}

/** Press F1 and let the frame it changes be drawn. */
async function pressF1(page: Page): Promise<void> {
  await page.keyboard.press('F1');
  await drawn(page);
}

/** What the room layer drew: its painting, the tiles it shows, and their alpha. */
async function room(page: Page): Promise<{ painting: string; tiles: number; alpha: number }> {
  const fields = await fieldsOf(page, 'room');

  return {
    painting: fields.get('painting') ?? '',
    tiles: Number(fields.get('tiles')),
    alpha: Number(fields.get('tileAlpha')),
  };
}

test('the ruin gate shows its painting, and its tiles only behind F1', async ({
  page,
}, run: TestInfo) => {
  test.slow();
  await open(page, 'ruin-gate');

  // The painting is the room, and not one tile is drawn over it.
  expect(await room(page)).toEqual({
    painting: 'ruin-gate',
    tiles: 0,
    alpha: DEBUG_TILE_ALPHA,
  });

  const painted = await page.screenshot();

  await run.attach('ruin-gate.png', { body: painted, contentType: 'image/png' });
  await pressF1(page);

  const traced = await page.screenshot();

  await run.attach('ruin-gate-with-f1.png', { body: traced, contentType: 'image/png' });

  // F1 brings the collision grid up over the painting, at half alpha.
  const debug = await room(page);

  expect(debug.tiles).toBeGreaterThan(0);
  expect(debug.alpha).toBe(DEBUG_TILE_ALPHA);
  expect(traced.equals(painted)).toBe(false);

  // And F1 again takes them away, down to the very same frame: the room layer
  // reads nothing but the state it is given.
  await pressF1(page);
  expect((await room(page)).tiles).toBe(0);
  expect((await page.screenshot()).equals(painted)).toBe(true);
});

test('the glade, which has no painting, is drawn out of the atlas throughout', async ({
  page,
}, run: TestInfo) => {
  test.slow();
  await open(page, 'forest-glade');

  const drew = await room(page);

  expect(drew.painting).toBe('none');
  // Every cell of ground drawn and no other: a run of ground reaches the
  // canvas whole, so no gap between two of its tiles can be a tile the room
  // layer left out. What the art itself does at the join — the atlas tiles
  // are opaque and land on whole world units — is what the attached frame
  // below is for.
  expect(drew.tiles).toBe(GLADE_GROUND);
  expect(drew.alpha).toBe(1);
  await run.attach('forest-glade.png', { body: await page.screenshot(), contentType: 'image/png' });

  // F1 is the painted rooms' debug view; here the tiles were the room all
  // along, so it leaves them exactly as they were.
  await pressF1(page);
  expect(await room(page)).toEqual(drew);
});
