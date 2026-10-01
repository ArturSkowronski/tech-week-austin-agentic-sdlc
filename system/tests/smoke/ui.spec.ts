// The UI in a real browser: the splash under the title screen's own lettering,
// text rasterised at the size the window asks for, the card's three seconds,
// and an Enter that leaves a running world alone.

import { readFile } from 'node:fs/promises';

import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';

import { TICKET_DISMISS_TICKS, UI_COLOURS, UI_SIZES, VIEW_H, VIEW_W } from '../../game/render/config';
import { VICTORY_CAST_HIT_TICKS } from '../../game/sim/index';

/**
 * The two windows the plan names, and the size UI text comes out at in each:
 * the UI steps in whole pixels with the window, so its glyphs are rasterised
 * at their own size and drawn unscaled, never blown up from the world's.
 */
const WINDOWS = [
  { width: 1280, height: 720, scale: 2 },
  { width: 1920, height: 1080, scale: 3 },
];

/**
 * Let the loop take the presses it is holding: it reads them once a frame.
 * Needed before an assertion that would pass anyway, and only there.
 */
function settle(page: Page): Promise<void> {
  return page.evaluate(
    () =>
      new Promise<void>((done) => {
        requestAnimationFrame(() => requestAnimationFrame(() => done()));
      }),
  );
}

/**
 * Read the room's log lines, which is what brings the card up whatever the
 * manifest holds: a clean room answers with "The logs are clean." and a room
 * with a bug with what the logs said, but both have something to say. A bare
 * T does not — in a room whose bug the player has neither felt nor read about
 * the card has no face yet (bug-quest.md, the four states) — so the tests
 * below that only need the card on the screen ask for it this way, and stay
 * green on the branch that plants HW-001.
 *
 * The water is stamped rather than swum through, the way
 * tests/smoke/waterfall.spec.ts stamps it: what the card does with a parted
 * waterfall is the subject here, not how the wizard parts one.
 */
async function readTheLogs(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = window.wizard.state();
    const water = state.props.find((prop) => prop.kind === 'waterfall');

    if (water === undefined) {
      throw new Error('the room carries no waterfall');
    }

    water.hitTick = state.tick;
  });
  await settle(page);
}

/** Open the game with its clock in the test's hands, not the browser's. */
async function open(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.wizard !== undefined);
  await page.evaluate(() => {
    window.wizard.paused = true;
  });
}

for (const { width, height, scale } of WINDOWS) {
  test(`UI text is drawn at the window's own resolution at ${width} by ${height}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await open(page);

    const canvas = page.locator('#game canvas');

    // Each line is measured off the live text object by game/main.ts: the size
    // it was rasterised at, and the scale it is drawn at. Scale 1 is the point
    // — the UI hangs off scene.ui, not the world container, so the glyphs are
    // never blown up from the world's render texture. Each of the three is
    // read while it is on screen, because a hidden container's transform is
    // not updated. The wordmark first: the title is what a visitor sees.
    await expect(canvas).toHaveAttribute(
      'data-ui-title-text',
      `${UI_SIZES.wordmark * scale}px scale 1`,
    );

    await page.evaluate(() => {
      window.wizard.start();
    });

    // The HUD's line is read behind F1, because that is the only time it is
    // on the screen: outside F1 it has nothing to say and hides itself.
    await page.keyboard.press('F1');
    await settle(page);
    await expect(canvas).toHaveAttribute('data-ui-text', `${UI_SIZES.body * scale}px scale 1`);

    // And back off it, so the lines below are read off the frame a player is
    // shown rather than one carrying the debug line and the debug drawing.
    await page.keyboard.press('F1');
    await settle(page);

    // And the card's own lines, which the HUD's size says nothing about: a
    // dropped `* scale` in panel.ts or title.ts would leave the HUD green.
    await readTheLogs(page);
    await expect(canvas).toHaveAttribute('data-ui', 'card');
    await expect(canvas).toHaveAttribute('data-ui-card-text', `${UI_SIZES.body * scale}px scale 1`);
  });
}

/** The window the owner played at when he asked for the name to go. */
const CORNER_WINDOW = { width: 1280, height: 720 };

/** The box the room's name stood in, in window pixels of that window. */
const CORNER = { left: 0, top: 0, width: 300, height: 60 };

/** How far off the UI's own gold a pixel may be, per channel, and still be it. */
const HUD_TOLERANCE = 12;

/**
 * The HUD's colour, taken apart from the one place it is written down
 * (AGENTS.md rule 9) rather than copied into this file as three numbers.
 */
const HUD_R = (UI_COLOURS.dim >> 16) & 0xff;
const HUD_G = (UI_COLOURS.dim >> 8) & 0xff;
const HUD_B = UI_COLOURS.dim & 0xff;

/**
 * The pixels of the HUD's gold in the top-left corner of the drawn frame. The
 * claim is made against the frame rather than against the text object, because
 * what the owner saw and asked to be rid of is the drawing.
 */
async function goldInTheCorner(page: Page): Promise<number> {
  const corner = await sharp(await page.screenshot())
    .extract(CORNER)
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  let gold = 0;

  for (let at = 0; at < corner.data.length; at += corner.info.channels) {
    const off = Math.max(
      Math.abs((corner.data[at] ?? 0) - HUD_R),
      Math.abs((corner.data[at + 1] ?? 0) - HUD_G),
      Math.abs((corner.data[at + 2] ?? 0) - HUD_B),
    );

    if (off <= HUD_TOLERANCE) gold += 1;
  }

  return gold;
}

// The line HWP-095 is judged by: a run at 1280 by 720 shows nothing in the
// top-left corner, where the room's name used to stand for the whole run.
// Pressing F1 is the control — it proves the box and the colour are the ones
// the line is really drawn in, so the empty half cannot pass by looking at the
// wrong place. Measured here rather than in tests/render/ui.test.ts because
// only a real canvas can say what was drawn.
test('a run leaves the top-left corner empty, and F1 writes the line into it', async ({ page }) => {
  await page.setViewportSize(CORNER_WINDOW);
  await open(page);
  await page.evaluate(() => {
    window.wizard.start();
  });
  await settle(page);

  expect(await goldInTheCorner(page)).toBe(0);

  await page.keyboard.press('F1');
  await settle(page);

  expect(await goldInTheCorner(page)).toBeGreaterThan(0);
});

test('the card cannot be waved away before three seconds and can after', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    window.wizard.start();
  });

  const canvas = page.locator('#game canvas');

  await readTheLogs(page);
  await expect(canvas).toHaveAttribute('data-ui', 'card');

  await page.keyboard.press('Enter');
  await settle(page);
  await expect(canvas).toHaveAttribute('data-ui', 'card');

  // One tick short of the three seconds, and the words are still the player's.
  await page.evaluate((ticks) => {
    window.wizard.step(ticks);
  }, TICKET_DISMISS_TICKS - 1);
  await page.keyboard.press('Enter');
  await settle(page);
  await expect(canvas).toHaveAttribute('data-ui', 'card');

  await page.evaluate(() => {
    window.wizard.step(1);
  });
  await page.keyboard.press('Enter');
  await expect(canvas).toHaveAttribute('data-ui', '');

  // And T is the way back to words that have been waved away: the card the
  // player asked for is put up again, however long ago he took it down.
  await page.keyboard.press('KeyT');
  await expect(canvas).toHaveAttribute('data-ui', 'card');
});

// The banner's one branch: it is raised on the tick the beacon is lit and
// taken down when the run starts over, which is what could strand a stale
// banner over a fresh run. Measured here and not in tests/render/ui.test.ts
// because drawing the panel's lines needs a real canvas to measure them.
test('the banner goes up at the beacon and comes down on a restart', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    window.wizard.start();
  });

  const canvas = page.locator('#game canvas');

  await expect(canvas).toHaveAttribute('data-ui', '');

  // The beacon's own lighting raises it, and that is the victory cast's beam
  // landing rather than the touch that starts the cast: the wizard spins,
  // gathers and fires first (level-design.md, the beacon ends the run).
  await page.evaluate(() => {
    window.wizard.state().victoryTick = window.wizard.state().tick;
  });
  await expect(canvas).toHaveAttribute('data-ui', '');

  await page.evaluate((cast) => {
    window.wizard.step(cast);
  }, VICTORY_CAST_HIT_TICKS);
  await expect(canvas).toHaveAttribute('data-ui', 'banner');

  await page.keyboard.press('KeyR');
  await expect(canvas).toHaveAttribute('data-ui', '');
});

/** Scale 4, the smaller of the two windows above: 1280 by 720 of the view. */
const SPLASH_SCALE = 4;

/** How far off the art's own colour a pixel may be, per channel, and still be it. */
const SPLASH_TOLERANCE = 8;

/**
 * The share of the frame the title's three lines and their legibility bands
 * cover: a tenth of it at most, so nine tenths of it has to be the splash
 * itself. The charcoal wash this screen drew before HWP-086 matches none of it.
 */
const SPLASH_SHARE = 0.9;

// The splash is one frame of the whole view (asset-pipeline.md), shown in the
// box config.ts fits the world into, so at a whole scale every window pixel is
// one pixel of the file the kit wrote. The claim is made against that file
// blown up the same way rather than against a second copy of its palette
// (AGENTS.md rule 9), and it holds the fit as well as the drawing: art shown at
// the wrong scale, or off the box, would match nothing.
test('the title screen draws the splash the asset kit built', async ({ page }) => {
  await page.setViewportSize({ width: VIEW_W * SPLASH_SCALE, height: VIEW_H * SPLASH_SCALE });
  await open(page);

  const canvas = page.locator('#game canvas');

  await expect(canvas).toHaveAttribute('data-ui', 'title');
  await settle(page);

  const frame = await sharp(await page.screenshot())
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  expect(`${frame.info.width}x${frame.info.height}`).toBe(
    `${VIEW_W * SPLASH_SCALE}x${VIEW_H * SPLASH_SCALE}`,
  );

  const art = await sharp(await readFile('public/assets/splash.png'))
    .removeAlpha()
    .resize({ width: frame.info.width, height: frame.info.height, kernel: 'nearest' })
    .raw()
    .toBuffer();
  let shown = 0;

  for (let at = 0; at < art.length; at += frame.info.channels) {
    const off = Math.max(
      Math.abs((frame.data[at] ?? 0) - (art[at] ?? 0)),
      Math.abs((frame.data[at + 1] ?? 0) - (art[at + 1] ?? 0)),
      Math.abs((frame.data[at + 2] ?? 0) - (art[at + 2] ?? 0)),
    );

    if (off <= SPLASH_TOLERANCE) shown += 1;
  }

  expect(shown / (VIEW_W * SPLASH_SCALE * VIEW_H * SPLASH_SCALE)).toBeGreaterThan(SPLASH_SHARE);
});

// Enter is pressed all over this file; the other two keys the title answers to
// are pressed only here (rendering-and-look.md, UI).
test('Space and Z leave the title screen, the way Enter does', async ({ page }) => {
  const canvas = page.locator('#game canvas');

  for (const key of ['Space', 'KeyZ']) {
    await open(page);
    await expect(canvas).toHaveAttribute('data-ui', 'title');

    await page.keyboard.press(key);
    await expect(canvas).toHaveAttribute('data-ui', '');
  }
});

test('Enter during a run does nothing to the run', async ({ page }) => {
  await open(page);

  const canvas = page.locator('#game canvas');
  const run = (): Promise<{ tick: number; x: number }> =>
    page.evaluate(() => {
      const state = window.wizard.state();

      return { tick: state.tick, x: state.player.x };
    });

  await expect(canvas).toHaveAttribute('data-ui', 'title');

  await page.keyboard.press('Enter');
  await expect(canvas).toHaveAttribute('data-ui', '');

  await page.evaluate(() => {
    window.wizard.step(60, { right: true });
  });

  const before = await run();

  expect(before.tick).toBe(60);

  await page.keyboard.press('Enter');
  await settle(page);

  expect(await run()).toEqual(before);

  // And R does start the run over, so the run above would have shown it.
  await page.keyboard.press('KeyR');
  await settle(page);

  expect((await run()).tick).toBe(0);
});
