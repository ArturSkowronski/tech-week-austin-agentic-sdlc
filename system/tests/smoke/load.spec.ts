// The browser smoke test: the built dist/ loads, the automation surface drives
// the run, and the view fits the window at the density and scale ADR-003 asks
// for.

import { expect, test } from '@playwright/test';

const VIEWPORT = { width: 1280, height: 720 };

/** 1280 by 720 window, 320 by 180 view: the largest even scale that fits. */
const EXPECTED_SCALE = 4;

/** The view fills this window exactly, so it sits flush in the top corner. */
const EXPECTED_VIEW = `${320 * EXPECTED_SCALE}x${180 * EXPECTED_SCALE}@0,0`;

/** World units across the view, whatever the window: the 320 of ADR-003. */
const EXPECTED_UNITS = '320';

test.use({ viewport: VIEWPORT });

test('the page loads, steps the wizard, and fits the window', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => window.wizard !== undefined);

  const before = await page.evaluate(() => window.wizard.state().player.x);

  await page.evaluate(() => {
    window.wizard.start();
    window.wizard.step(60, { right: true });
  });

  const after = await page.evaluate(() => window.wizard.state().player.x);

  expect(after - before).toBeGreaterThan(60);

  const canvas = page.locator('#game canvas');

  // The canvas covers the window; the view is letterboxed inside it.
  const size = await canvas.evaluate((element: HTMLCanvasElement) => [
    element.width,
    element.height,
  ]);

  expect(size).toEqual([VIEWPORT.width, VIEWPORT.height]);

  // What the player sees, measured off the view sprite by scene.ts: its box on
  // screen is 1280 by 720, which is the view at scale 4.
  await expect(canvas).toHaveAttribute('data-view', EXPECTED_VIEW);

  // And it shows 320 world units across, not 640: the render texture is twice
  // the view in pixels only because the world is drawn into it at density 2.
  await expect(canvas).toHaveAttribute('data-units', EXPECTED_UNITS);
});
