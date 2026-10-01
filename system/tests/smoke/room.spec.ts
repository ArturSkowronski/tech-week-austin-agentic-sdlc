// The room layer in a real browser (ADR-004): a room with no painting is drawn
// out of the atlas from the first frame, and F1, the painted rooms' debug
// view, leaves such a room exactly as it was. Season 1 is the glade alone and
// the glade is drawn in tiles (ADR-009), so there is no painted room to open;
// `?room=` naming one that is gone falls back to the glade instead.
//
// What was drawn is read off the live objects, the way scene.ts publishes the
// fit and the layer stack, and the frame itself is attached to the run so the
// room can be looked at as well.

import { expect, test, type Page, type TestInfo } from '@playwright/test';

import forestGlade from '../../game/content/rooms/forest-glade';
import { parseRoom, PLAYER_HEIGHT, TILE, Tile, tileAt } from '../../game/sim/index';

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

/**
 * Stand the wizard on top of a cell and let the frame be drawn, so the camera
 * carries that stretch of ground into the middle of the view. Only a test
 * writes to the world like this — the game itself walks him there.
 */
async function stand(page: Page, cell: { x: number; y: number }): Promise<void> {
  await page.evaluate(
    (at) => {
      const { player } = window.wizard.state();

      player.x = at.x;
      player.y = at.y;
    },
    { x: cell.x * TILE, y: cell.y * TILE - PLAYER_HEIGHT },
  );
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

/**
 * The stretches of ground the owner's report asks to be looked at, and the
 * cell to stand the wizard on so the camera carries each into the middle of
 * the frame. The view is twenty columns wide. The plateau runs from column
 * 20 to column 32 with its surface at row 13, so standing at 26 shows all of
 * it and standing at 21 shows its left face — the open side, with ground on
 * either side of the cut. The beacon tower runs from column 64 to column 71
 * with its surface at row 12 and seven rows of stone under the earth, so
 * standing at 67 carries its whole block of stone in.
 *
 * Which tile each cell shows, and which way round, is asserted cell by cell
 * in tests/render/tiles.test.ts. These are the acceptance lines that ask for
 * the ground itself to be looked at: the plateau interior the report called
 * wallpaper, the fringe running down the face from the corner piece to the
 * stone edge, and the tower's moss as the odd block rather than a band.
 */
const FRAMES = [
  {
    title: 'the plateau interior, which the report called wallpaper, is drawn turned',
    cell: { x: 26, y: 13 },
    shot: 'forest-glade-plateau.png',
  },
  {
    title: 'the left face of the plateau is fringed from the grass down to the stone',
    cell: { x: 21, y: 13 },
    shot: 'forest-glade-plateau-face.png',
  },
  {
    title: 'the beacon tower shows its mossy blocks as the odd block, not as a band',
    cell: { x: 67, y: 12 },
    shot: 'forest-glade-tower.png',
  },
] as const;

for (const { title, cell, shot } of FRAMES) {
  test(title, async ({ page }, run: TestInfo) => {
    test.slow();
    await open(page, 'forest-glade');

    const spawn = await room(page);

    await stand(page, cell);

    // Moving the camera must not change which cells were drawn, and the room
    // layer is built once per room, so the report is still the spawn's.
    expect(await room(page)).toEqual(spawn);
    await run.attach(shot, { body: await page.screenshot(), contentType: 'image/png' });
  });
}

test('a ?room= that names no room falls back to the glade', async ({ page }) => {
  // The retired ruin gate, which ADR-009 took out of game/content/rooms/: the
  // fallback in game/main.ts reads the glob, so any absent name does this.
  await open(page, 'ruin-gate');

  expect(await page.evaluate(() => window.wizard.state().roomName)).toBe('forest-glade');
});
