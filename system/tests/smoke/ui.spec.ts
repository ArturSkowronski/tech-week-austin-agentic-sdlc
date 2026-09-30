// The UI in a real browser: text rasterised at the size the window asks for,
// the card's three seconds, and an Enter that leaves a running world alone.

import { expect, test, type Page } from '@playwright/test';

import { TICKET_DISMISS_TICKS, UI_SIZES } from '../../game/render/config';
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

    await expect(canvas).toHaveAttribute('data-ui-text', `${UI_SIZES.body * scale}px scale 1`);

    // And the card's own lines, which the HUD's size says nothing about: a
    // dropped `* scale` in panel.ts or title.ts would leave the HUD green.
    await readTheLogs(page);
    await expect(canvas).toHaveAttribute('data-ui', 'card');
    await expect(canvas).toHaveAttribute('data-ui-card-text', `${UI_SIZES.body * scale}px scale 1`);
  });
}

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
