// The layer stack in a real browser (docs/plan/02-design/rendering-and-look.md,
// layer stack): what the two frames of the ticket's acceptance actually show —
// trunks and the gold light at rest, the canopy and the peaks at the top of the
// ledge climb, no pale gap between the layers — and that a camera clamped at a
// room edge draws the very same frame twice.
//
// The frames are asserted on their pixels, not on their existence: every claim
// below is a count of the artwork's own colours in a named band of the view,
// and each of them does fail when the stack is wrong. Both frames are attached
// to the run so the acceptance can be looked at as well as measured.

import { readFile } from 'node:fs/promises';

import { expect, test, type Page, type TestInfo } from '@playwright/test';
import sharp from 'sharp';

import { BASE_COLOURS, LAYERS, VIEW_H, VIEW_W, type Layer } from '../../game/render/config';
import { PLAYER_HEIGHT, TILE } from '../../game/sim/index';

test.use({ viewport: { width: 1280, height: 720 } });

/** Tiles of the glade's text map this spec stands the wizard on top of. */
const TILES = {
  /** The last step of the ledge climb over the spikes, the top of the room. */
  ledgeTop: { x: 48, y: 9 },
  /** Far enough right along the floor that the camera is clamped to the room. */
  wall: { x: 74, y: 18 },
  further: { x: 78, y: 18 },
  /** Back where the camera is free again, so a still frame means something. */
  middle: { x: 40, y: 18 },
};

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

/**
 * Stand the wizard on top of a tile. The camera is what is under test, so he
 * is put where he has to be rather than played there; only a test writes to
 * the world like this, the game itself moves him through `tick`.
 */
async function stand(page: Page, tile: { x: number; y: number }): Promise<void> {
  await page.evaluate(
    (at) => {
      const { player } = window.wizard.state();

      player.x = at.x;
      player.y = at.y;
    },
    { x: tile.x * TILE, y: tile.y * TILE - PLAYER_HEIGHT },
  );
  await drawn(page);
}

/** The top edge of every layer, the horizon and the sky count, as scene.ts published them. */
async function stack(page: Page): Promise<Record<string, number>> {
  const report = await page.locator('#game canvas').getAttribute('data-layers');

  return Object.fromEntries(
    (report ?? '').split(' ').map((pair) => {
      const [name, value] = pair.split('=');

      return [name ?? '', Number(value)];
    }),
  );
}

/**
 * The frame the window shows. At this viewport the view fills the window
 * exactly, so the window's own shot is the view and nothing else — and it is
 * three times quicker than an element shot, which polls the canvas for a
 * stability an animated canvas never reports.
 */
function frame(page: Page): Promise<Buffer> {
  return page.screenshot();
}

/**
 * A frame read back as one colour per world unit, taken from the middle of the
 * block each unit is shown as. The shot has to be the view and nothing else
 * for that to hold, so the size is checked rather than assumed.
 */
async function units(shot: Buffer): Promise<number[]> {
  const { data, info } = await sharp(shot).raw().toBuffer({ resolveWithObject: true });
  const scale = info.height / VIEW_H;

  expect(`${info.width}x${info.height}`).toBe(`${VIEW_W * scale}x${VIEW_H * scale}`);

  const middle = Math.floor(scale / 2);
  const read: number[] = [];

  for (let row = 0; row < VIEW_H; row += 1) {
    for (let col = 0; col < VIEW_W; col += 1) {
      const at = ((row * scale + middle) * info.width + col * scale + middle) * info.channels;

      read.push(((data[at] ?? 0) << 16) | ((data[at + 1] ?? 0) << 8) | (data[at + 2] ?? 0));
    }
  }

  return read;
}

/** How many units of a frame a colour test finds, and the rows they lie on. */
interface Found {
  count: number;
  /** The first and last row the colour is on; -1 for a colour that is absent. */
  top: number;
  bottom: number;
}

function count(read: number[], shows: (colour: number) => boolean): Found {
  const found: Found = { count: 0, top: -1, bottom: -1 };

  for (let at = 0; at < read.length; at += 1) {
    if (!shows(read[at] ?? 0)) continue;

    const row = Math.floor(at / VIEW_W);

    found.count += 1;
    found.bottom = row;
    if (found.top < 0) found.top = row;
  }

  return found;
}

/**
 * The colours a layer can put on screen: the art the kit wrote, each colour
 * multiplied by the layer's own tint the way Pixi multiplies it, so the test
 * reads the artwork instead of carrying a second copy of the palette
 * (AGENTS.md rule 9). A channel can land a step either side of that multiply
 * on a different renderer, so each colour is matched with its neighbours.
 */
async function palette(
  layer: Layer,
  keep: (r: number, g: number, b: number) => boolean,
): Promise<Set<number>> {
  const { data, info } = await sharp(await readFile(`public/assets/${layer.asset}.png`))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const tint = Math.round(layer.tint * 0xff);
  const colours = new Set<number>();

  for (let at = 0; at < data.length; at += info.channels) {
    const [r, g, b] = [data[at] ?? 0, data[at + 1] ?? 0, data[at + 2] ?? 0];

    if ((data[at + 3] ?? 0) < 0x80 || !keep(r, g, b)) continue;

    const lit = (channel: number): number => Math.round((channel * tint) / 0xff);

    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dg = -1; dg <= 1; dg += 1) {
        for (let db = -1; db <= 1; db += 1) {
          colours.add(((lit(r) + dr) << 16) | ((lit(g) + dg) << 8) | (lit(b) + db));
        }
      }
    }
  }

  return colours;
}

/**
 * The pale grey-green the mountains' ridges are drawn in, as the 85 % alpha
 * over the dusk sky leaves them: nothing else in the stack is at once this
 * light and this colourless — the forest is dark, the sky is mauve, and the
 * UI's gold is far from grey — so a unit this pale is a peak.
 */
function peak(colour: number): boolean {
  const channels = [(colour >> 16) & 0xff, (colour >> 8) & 0xff, colour & 0xff];

  return Math.min(...channels) >= 0x80 && Math.max(...channels) - Math.min(...channels) <= 0x30;
}

/**
 * A pale gap: the fill below the horizon showing through the stack instead of
 * the forest. Drawn flat and covered only by the mountains' base in the very
 * same colour, so a gap is this colour exactly, whatever is in front of it.
 */
function gap(colour: number): boolean {
  return colour === BASE_COLOURS.mountains;
}

test('the climb brings the canopy and the peaks into view, with no pale gap between the layers', async ({
  page,
}, run: TestInfo) => {
  // Reading pixels back off a software renderer is slow.
  test.slow();

  // The gold light between the trunks is the tall forest's own warm end: the
  // colours of its art that fall away from red through green to blue.
  const gold = await palette(LAYERS.tallForest, (r, g, b) => r > g && g > b);
  const forest = await palette(LAYERS.tallForest, () => true);

  await open(page);

  const rest = await stack(page);
  const atRest = await frame(page);

  await run.attach('at-rest.png', { body: atRest, contentType: 'image/png' });

  const still = await units(atRest);

  // At rest the canopy and the peaks are both above the view: the tall forest
  // shows its trunks and the gold light between them, and nothing else.
  expect(rest[LAYERS.tallForest.asset]).toBeLessThan(0);
  expect(rest[LAYERS.mountains.asset]).toBeLessThan(0);
  expect(count(still, (colour) => forest.has(colour)).top).toBe(0);
  expect(count(still, peak).count).toBe(0);

  const restGold = count(still, (colour) => gold.has(colour));

  expect(restGold.count).toBeGreaterThan(0);
  expect(count(still, gap).count).toBe(0);

  // A still camera leaves the horizon alone, and the sky is not drawn again.
  await drawn(page);
  await drawn(page);
  expect((await stack(page))['skies']).toBe(rest['skies']);

  await stand(page, TILES.ledgeTop);

  const climbed = await stack(page);
  const atLedgeTop = await frame(page);

  await run.attach('at-the-top-of-the-climb.png', {
    body: atLedgeTop,
    contentType: 'image/png',
  });

  const high = await units(atLedgeTop);

  // The canopy is on screen and the horizon has come down with the peaks.
  expect(climbed[LAYERS.tallForest.asset]).toBeGreaterThan(0);
  expect(climbed['horizon']).toBeGreaterThan(rest['horizon'] ?? 0);
  expect(climbed['skies']).toBe((rest['skies'] ?? 0) + 1);

  // The top edge of the artwork is where the report says the layer is, so the
  // canopy really is in the frame, and the peaks stand above it in the open
  // sky the canopy has come down out of.
  const canopy = count(high, (colour) => forest.has(colour));
  const peaks = count(high, peak);

  expect(canopy.top).toBe(climbed[LAYERS.tallForest.asset]);
  expect(peaks.count).toBeGreaterThan(0);
  expect(peaks.top).toBeLessThan(canopy.top);

  // Every layer moved by its own share of the climb: the bushes in front take
  // all of it, and the table's vertical factors say what the rest take.
  const climbedBy =
    (climbed[LAYERS.bushesFront.asset] ?? 0) - (rest[LAYERS.bushesFront.asset] ?? 0);

  for (const layer of Object.values(LAYERS)) {
    expect((climbed[layer.asset] ?? 0) - (rest[layer.asset] ?? 0)).toBeCloseTo(
      climbedBy * layer.parallaxY,
      0,
    );
  }

  // And the gold light is carried down by the tall forest's share of it, which
  // is the pixels agreeing with the report rather than the report alone.
  expect(count(high, (colour) => gold.has(colour)).bottom - restGold.bottom).toBe(
    Math.round(climbedBy * LAYERS.tallForest.parallaxY),
  );

  // No pale gap opens between the layers in either frame.
  expect(count(high, gap).count).toBe(0);
});

test('a camera clamped at the room edge draws the very same frame twice', async ({ page }) => {
  test.slow();
  await open(page);

  const canvas = page.locator('#game canvas');

  await stand(page, TILES.wall);

  const clamped = await frame(page);
  const report = await canvas.getAttribute('data-layers');

  await stand(page, TILES.further);

  expect(await canvas.getAttribute('data-layers')).toBe(report);
  expect(await frame(page)).toEqual(clamped);

  // And away from the edge it does move, so the comparison above means something.
  await stand(page, TILES.middle);

  expect(await frame(page)).not.toEqual(clamped);
});
