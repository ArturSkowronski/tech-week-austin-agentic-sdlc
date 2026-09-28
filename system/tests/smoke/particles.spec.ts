// The atmosphere pass on a real page (HWP-060): all four fields reach the
// screen in the room the run starts in, they reach the pixels of it and not
// only its report, and the loop still draws at the rate the ticket asks for
// while they do.
//
// The acceptance names the Pixi ticker's FPS. Pixi's ticker never runs here —
// scene.ts starts the application with `autoStart: false` and game/main.ts
// draws one frame per animation frame of its own
// (docs/plan/02-design/simulation-architecture.md) — so the rate is counted
// off that loop instead, which is the one the player actually sees.
//
// And it is counted twice. A headless browser has no graphics card, draws
// every pixel on its processor and reports a few frames a second whatever is
// on the screen, so an absolute threshold here measures the machine and not
// the pass — it would either fail on every run or, gated on the renderer,
// skip on every run and assert nothing at all. The measurement that does mean
// something on any machine is relative: the same bundle, on the same browser,
// with the pass and with `?atmosphere=off`, and the difference between them is
// what the pass costs. The absolute rate is asserted as well wherever there is
// a card to assert it on.

import { expect, test, type Page, type TestInfo } from '@playwright/test';
import sharp from 'sharp';

import { FIREFLIES, MOTES, VIEW_H, VIEW_W } from '../../game/render/config';

import { fieldsOf, wizardFrame } from './wizard-frame';

test.use({ viewport: { width: 1280, height: 720 } });

/** Seconds the frames are counted over, as the acceptance asks. */
const SAMPLE_SECONDS = 10;

/** Seconds of run let by before the count starts, for the first-frame costs. */
const WARM_UP_SECONDS = 1;

/**
 * Frames a second the count has to reach. The acceptance is the 60 of a
 * display's refresh, which a loop that draws every frame it is offered cannot
 * exceed and a browser's own scheduling lands just under, so this is that rate
 * with the jitter of one frame in twelve allowed for. Only a renderer with a
 * card behind it is held to it; see the head of this file.
 */
const LEAST_FPS = 55;

/**
 * The share of a frame the pass may add. It is measured against the very same
 * run without it, so this is the pass's own cost and nothing of the machine's:
 * a quarter is far above what four small fields of flat rectangles should ever
 * come to, and far below the half a frame that would turn 60 into 40.
 */
const SHARE_OF_A_FRAME = 0.25;

/**
 * Renderers with no graphics card behind them. The relative measurement below
 * runs on these too — that is the point of it — but the acceptance's absolute
 * 60 is about a 2020 laptop, which has a card, so it is asserted only where
 * there is one.
 */
const SOFTWARE = /^none$|swiftshader|software|llvmpipe|mesa|basic render/i;

/** The tick the frames below are compared on, and a later one. */
const TICKS = [300, 900];

/** Past the title, with the run going. */
async function open(page: Page, query = ''): Promise<void> {
  await page.goto(`/${query}`);
  await page.waitForFunction(() => window.wizard !== undefined);
  await page.evaluate(() => {
    window.wizard.start();
  });
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

/** What the browser draws on, as its own driver names it. */
function renderer(page: Page): Promise<string> {
  return page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');

    return gl == null || info == null
      ? 'none'
      : String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
  });
}

/** Milliseconds a frame, over the sample after the warm-up. */
function frameCost(page: Page): Promise<number> {
  return page.evaluate(
    ({ warmUp, sample }) =>
      new Promise<number>((done) => {
        let frames = 0;
        let from: number | undefined;

        const step = (now: number): void => {
          if (from === undefined) {
            from = now + warmUp * 1000;
          } else if (now >= from + sample * 1000) {
            done((now - from) / Math.max(frames, 1));

            return;
          } else if (now >= from) {
            frames += 1;
          }

          requestAnimationFrame(step);
        };

        requestAnimationFrame(step);
      }),
    { warmUp: WARM_UP_SECONDS, sample: SAMPLE_SECONDS },
  );
}

/**
 * The frame of a paused run at this tick, kept with the run as a file rather
 * than a body: `playwright.config.ts` reports with `list`, which keeps no
 * attachment bodies, so a frame attached as a body alone survives only under
 * a reporter nobody runs.
 */
async function frameAt(page: Page, tick: number, info: TestInfo, name: string): Promise<Buffer> {
  await page.evaluate((ticks) => {
    window.wizard.paused = true;
    window.wizard.step(ticks);
  }, tick);
  await drawn(page);

  const path = info.outputPath(name);

  await page.screenshot({ path });
  await info.attach(name, { path, contentType: 'image/png' });

  return page.screenshot();
}

/**
 * The world units in which two frames of the same tick differ, as `col,row`.
 * Both frames are the same run on the same browser at the same tick, and the
 * only thing between them is `?atmosphere=off` — so every unit in here is a
 * unit the pass drew on, and nothing else is.
 */
async function differing(one: Buffer, other: Buffer): Promise<Set<string>> {
  const [a, b] = await Promise.all(
    [one, other].map((shot) => sharp(shot).raw().toBuffer({ resolveWithObject: true })),
  );
  const { data, info } = a as { data: Buffer; info: { width: number; height: number; channels: number } };
  const read = (b as { data: Buffer }).data;
  const scale = info.height / VIEW_H;

  expect(`${info.width}x${info.height}`).toBe(`${VIEW_W * scale}x${VIEW_H * scale}`);

  const units = new Set<string>();

  for (let at = 0; at < data.length; at += info.channels) {
    const pixel = at / info.channels;

    if (
      data[at] === read[at] &&
      data[at + 1] === read[at + 1] &&
      data[at + 2] === read[at + 2]
    ) {
      continue;
    }

    units.add(
      `${Math.floor((pixel % info.width) / scale)},${Math.floor(pixel / info.width / scale)}`,
    );
  }

  return units;
}

/** The units of a set that lie inside a box of the view. */
function inside(
  units: ReadonlySet<string>,
  box: { x: number; y: number; w: number; h: number },
): number {
  let found = 0;

  for (const unit of units) {
    const [col = 0, row = 0] = unit.split(',').map(Number);

    if (col >= box.x && col < box.x + box.w && row >= box.y && row < box.y + box.h) found += 1;
  }

  return found;
}

test('draws every field of the pass in the room the run starts in', async ({ page }) => {
  await open(page);

  await page.waitForFunction(
    () => document.querySelector('#game canvas')?.getAttribute('data-particles') != null,
  );

  // The counts scene.ts publishes off the layers themselves. The glade has
  // bushes for the spores and a floor line for the mist, so every field of
  // game/render/particles.ts has something to draw there.
  const fields = await fieldsOf(page, 'particles');
  const drawing = [...fields].map(([name, count]) => [name, Number(count) > 0] as const);

  expect(Object.fromEntries(drawing)).toEqual({
    fireflies: true,
    motes: true,
    spores: true,
    mist: true,
  });
});

test('puts the fireflies and the motes on the pixels, and moves them on', async ({
  page,
}, info) => {
  // Reading whole frames back off a software renderer is slow.
  test.slow();

  const moved: Array<Set<string>> = [];

  for (const tick of TICKS) {
    await open(page);

    const withPass = await frameAt(page, tick, info, `tick-${tick}.png`);
    const { light } = await wizardFrame(page);

    await open(page, '?atmosphere=off');

    const without = await frameAt(page, tick, info, `tick-${tick}-without-the-pass.png`);
    const units = await differing(withPass, without);

    // The fireflies are drawn behind the room layer, in among the trunks the
    // backdrops draw, so only the ones that fall clear of the painting are
    // seen — but some of them have to be, or the field is drawn where nobody
    // can look at it.
    expect(
      inside(units, { x: 0, y: FIREFLIES.top, w: VIEW_W, h: FIREFLIES.band + FIREFLIES.bob }),
    ).toBeGreaterThan(0);

    // And the motes are dust in the wand's light, so they land within its
    // reach of the crystal the renderer published for this very frame.
    expect(
      inside(units, {
        x: light.x - MOTES.radius,
        y: light.y - MOTES.radius,
        w: 2 * MOTES.radius,
        h: 2 * MOTES.radius,
      }),
    ).toBeGreaterThan(0);

    moved.push(units);
  }

  // Ten seconds of run apart, the pass is not standing where it stood: the
  // units it draws on are its own, so a field frozen on the screen would
  // leave this set unchanged however far the run went.
  expect([...(moved[1] as Set<string>)].sort()).not.toEqual([...(moved[0] as Set<string>)].sort());
});

test('costs only a small share of the frame it is drawn in', async ({ page }) => {
  test.setTimeout(120_000);

  await open(page);

  const on = await renderer(page);
  const withPass = await frameCost(page);

  await open(page, '?atmosphere=off');

  const without = await frameCost(page);

  console.log(
    `${(1000 / withPass).toFixed(1)} frames a second with the pass and ` +
      `${(1000 / without).toFixed(1)} without it, over ${SAMPLE_SECONDS}s each on ${on}`,
  );

  // The claim that holds on any machine: the pass is a small share of a
  // frame, measured against the very same frame without it.
  expect(withPass).toBeLessThanOrEqual(without * (1 + SHARE_OF_A_FRAME));

  // And where there is a card to measure it on, the acceptance's own rate.
  if (!SOFTWARE.test(on)) expect(1000 / withPass).toBeGreaterThanOrEqual(LEAST_FPS);
});
