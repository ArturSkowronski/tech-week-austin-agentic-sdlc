// The wizard in a real browser: the two lines of HWP-023's acceptance. A
// replay stepped twice through `window.wizard` draws the very same frames,
// and in every state the additive wand light stands on the crystal the asset
// kit found in that frame — checked against the manifest, and then against
// the pixels of a screenshot of it.

import { readFile } from 'node:fs/promises';

import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';

import { VIEW_H, VIEW_W, WAND_LIGHT } from '../../game/render/config';
import type { StripEntry } from '../../game/render/sprites';
import { LONG_FALL_TICKS, type InputFrame, type PlayerState, type Vec2 } from '../../game/sim/index';

import { wizardFrame, type Drawn } from './wizard-frame';

/**
 * The window the wizard is measured in: the view at the smallest scale
 * ADR-003 allows, so it fills the window exactly with no letterbox and a
 * world unit is a 2 by 2 block of it. Nothing here is a claim about window
 * size — ui.spec.ts makes those — and every frame this spec asks for is one
 * the software renderer has to draw, so the smallest exact fit is the one to
 * ask for: it is a quarter of the pixels of a 4x window per frame and per
 * screenshot, and the unit-level reading below is unchanged, because a unit
 * is still read from the middle of its own block.
 */
const VIEWPORT = { width: VIEW_W * 2, height: VIEW_H * 2 } as const;

test.use({ viewport: { ...VIEWPORT } });

/** Let the loop take a frame; it draws the world once per animation frame. */
function drawn(page: Page): Promise<void> {
  return page.evaluate(
    () =>
      new Promise<void>((done) => {
        requestAnimationFrame(() => requestAnimationFrame(() => done()));
      }),
  );
}

/** Open the glade past the title, with one frame drawn. */
async function open(page: Page, paused: boolean): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => window.wizard !== undefined);
  await page.evaluate((stop) => {
    window.wizard.paused = stop;
    window.wizard.start();
  }, paused);
  await drawn(page);
}

/**
 * A run that puts him through most of the state table: a walk, a jump and the
 * fall out of it, a stand, a wand charge and the cooldown after it.
 */
const SCRIPT: readonly { ticks: number; input: Partial<InputFrame> }[] = [
  { ticks: 20, input: { right: true } },
  { ticks: 25, input: { right: true, jump: true } },
  { ticks: 25, input: { right: true } },
  { ticks: 10, input: {} },
  { ticks: 20, input: { charge: true } },
  { ticks: 30, input: {} },
];

/** The frame drawn after every tick of the script, from a fresh run. */
function replay(page: Page): Promise<string[]> {
  return page.evaluate((script) => {
    window.wizard.reset();

    const frames: string[] = [];

    for (const step of script) {
      for (let tick = 0; tick < step.ticks; tick += 1) {
        window.wizard.step(1, step.input);

        const { sheet, frame } = window.wizard.debug;

        frames.push(`${sheet}:${frame}`);
      }
    }

    return frames;
  }, SCRIPT);
}

test('a replay stepped twice draws the very same frames', async ({ page }) => {
  await open(page, true);

  const once = await replay(page);
  const twice = await replay(page);

  expect(twice).toEqual(once);

  // And the run animates, so the comparison above is not two flat lines: it
  // visits several strips and a good spread of the cells in them.
  expect(new Set(once.map((frame) => frame.split(':')[0])).size).toBeGreaterThan(2);
  expect(new Set(once).size).toBeGreaterThan(6);
});

/**
 * Stand him in one state. The states are what is under test, so he is put in
 * them rather than played into them; only a test writes to the world like
 * this. `fellFor` chooses the flail and the hard landing, and the tick count
 * chooses the cell inside a cycle.
 */
async function pose(
  page: Page,
  state: PlayerState,
  at: { stateTimer: number; fellFor: number; facing: 1 | -1 },
): Promise<Drawn> {
  await page.evaluate(
    (stand) => {
      const { player } = window.wizard.state();

      player.state = stand.state as PlayerState;
      player.stateTimer = stand.stateTimer;
      player.fellFor = stand.fellFor;
      player.facing = stand.facing;
    },
    { state, ...at },
  );
  await drawn(page);

  return wizardFrame(page);
}

/**
 * Window pixels per world unit at this viewport. The view fills the window
 * exactly here, so a shot of a box of the window is a shot of the same box of
 * the view, and only the wizard's own cell has to be read back.
 */
const SCALE = VIEWPORT.width / VIEW_W;

/** A shot of one cell of the view, read back as one colour per world unit. */
async function unitsOf(page: Page, cell: Drawn['cell']): Promise<{ shot: Buffer; read: number[] }> {
  const shot = await page.screenshot({
    clip: { x: cell.x * SCALE, y: cell.y * SCALE, width: cell.w * SCALE, height: cell.h * SCALE },
  });
  const { data, info } = await sharp(shot).raw().toBuffer({ resolveWithObject: true });
  const middle = Math.floor(SCALE / 2);
  const read: number[] = [];

  for (let row = 0; row < cell.h; row += 1) {
    for (let col = 0; col < cell.w; col += 1) {
      const at = ((row * SCALE + middle) * info.width + col * SCALE + middle) * info.channels;

      read.push(((data[at] ?? 0) << 16) | ((data[at + 1] ?? 0) << 8) | (data[at + 2] ?? 0));
    }
  }

  return { shot, read };
}

/** How much light of any colour a unit shows. */
function brightness(colour: number): number {
  return ((colour >> 16) & 0xff) + ((colour >> 8) & 0xff) + (colour & 0xff);
}

/**
 * The radius the glow is at full strength inside: its brightest ring, and a
 * unit for the block each unit is read from. The light adds its pale blue
 * over whatever the art underneath it is, and at the middle that comes out
 * saturated — so the light is measured as the brightness it lays down over a
 * patch, not as the colour of any one unit of it.
 */
const CORE = WAND_LIGHT.radius / WAND_LIGHT.rings + 1;

/** Mean brightness of the units within `radius` of a point of the cell. */
function glow(read: number[], cell: Drawn['cell'], middle: Vec2, radius: number): number {
  let total = 0;
  let seen = 0;

  for (let at = 0; at < read.length; at += 1) {
    const x = (at % cell.w) + 0.5;
    const y = Math.floor(at / cell.w) + 0.5;

    if (Math.hypot(x - middle.x, y - middle.y) > radius) continue;

    total += brightness(read[at] ?? 0);
    seen += 1;
  }

  return seen === 0 ? 0 : total / seen;
}

/** Mean brightness of the whole cell, the light and the art in it together. */
function litness(read: number[]): number {
  return read.reduce((total, colour) => total + brightness(colour), 0) / read.length;
}

/** Every state, with the ticks that pick a cell well inside its animation. */
const STATES: readonly { state: PlayerState; stateTimer: number; fellFor: number }[] = [
  { state: 'idle', stateTimer: 14, fellFor: 0 },
  { state: 'run', stateTimer: 21, fellFor: 0 },
  { state: 'jump', stateTimer: 1, fellFor: 0 },
  { state: 'fall', stateTimer: 8, fellFor: 3 },
  { state: 'fall', stateTimer: 30, fellFor: LONG_FALL_TICKS + 5 },
  { state: 'charge', stateTimer: 0, fellFor: 0 },
  { state: 'charge', stateTimer: 9, fellFor: 0 },
  { state: 'chargeRecoil', stateTimer: 1, fellFor: 0 },
  { state: 'land', stateTimer: 0, fellFor: 2 },
  { state: 'land', stateTimer: 0, fellFor: LONG_FALL_TICKS },
  { state: 'hurt', stateTimer: 4, fellFor: 0 },
  { state: 'victory', stateTimer: 18, fellFor: 0 },
];

/**
 * Where the light belongs inside the cell: the middle of the pixel the kit
 * found the crystal on, mirrored about the cell when he faces left, exactly
 * as the sprite itself is mirrored. Worked out from the manifest here rather
 * than imported from the renderer, so the two are independent readings of
 * the same recorded point — including the density the cell's own height
 * against the file's gives (ADR-003).
 */
function crystalIn(entry: StripEntry | undefined, frame: number, facing: 1 | -1): Vec2 {
  const [x = 0, y = 0] = entry?.crystal[frame] ?? [];
  const density = (entry?.height ?? 1) / (entry?.cell ?? 1);
  const middle = (x + 0.5) / density;

  return { x: facing === 1 ? middle : (entry?.cellW ?? 0) - middle, y: (y + 0.5) / density };
}

/** The kit's manifest, as the site serves it. */
async function strips(): Promise<Record<string, StripEntry>> {
  return JSON.parse(await readFile('public/assets/manifest.json', 'utf8')) as Record<
    string,
    StripEntry
  >;
}

test('the wand light is put on the crystal of the frame it draws', async ({ page }) => {
  // Every state is drawn twice over, and drawing is slow on a software renderer.
  test.slow();

  const manifest = await strips();

  await open(page, true);

  const offsets = new Set<string>();

  for (const { state, stateTimer, fellFor } of STATES) {
    for (const facing of [1, -1] as const) {
      const shown = await pose(page, state, { stateTimer, fellFor, facing });
      const where = `${state} ${stateTimer}/${fellFor} facing ${facing}`;
      const entry = manifest[`sprites/wizard-${shown.sheet}`];

      expect(entry?.crystal[shown.frame], `${where} draws a frame the manifest has`).toBeDefined();

      const crystal = crystalIn(entry, shown.frame, facing);

      expect({ x: shown.light.x - shown.cell.x, y: shown.light.y - shown.cell.y }, where).toEqual(
        crystal,
      );

      offsets.add(`${crystal.x},${crystal.y}`);
    }
  }

  // The light really does move: the crystal is not at one place in the cell
  // for every state, so following it is more than standing still.
  expect(offsets.size).toBeGreaterThan(6);
});

/**
 * And the screenshots show it there, in every state — one test per state
 * rather than one loop over all of them.
 *
 * The claim is a claim about one frame at a time: this state's glow stands on
 * this state's crystal. Nothing is lost by splitting it, and the gate is won:
 * each test opens a page, draws one frame and reads one clipped shot back — a
 * few seconds against the default budget — where the loop was twelve of those
 * in a row and overran even a tripled one at the worker count
 * `.github/workflows/ci.yml` runs. Split, they also fill the workers CI has
 * instead of holding one of them for a minute and a half.
 */
for (const [at, { state, stateTimer, fellFor }] of STATES.entries()) {
  // Both ways round across the set: which of the two a state is shown in does
  // not change where in the cell the light goes — the test above proves that
  // for all twelve of them, both ways — so one shot each is evidence enough.
  const facing = at % 2 === 0 ? 1 : -1;
  const where = `${state} ${stateTimer}/${fellFor} facing ${facing}`;

  test(`the screenshot shows the light on the crystal: ${where}`, async ({ page }, run) => {
    const manifest = await strips();

    await open(page, true);

    const shown = await pose(page, state, { stateTimer, fellFor, facing });
    const crystal = crystalIn(manifest[`sprites/wizard-${shown.sheet}`], shown.frame, facing);
    const { shot, read } = await unitsOf(page, shown.cell);

    await run.attach(`${state}-${stateTimer}-${fellFor}-facing-${facing}.png`, {
      body: shot,
      contentType: 'image/png',
    });

    // The glow is on the crystal in the frame as drawn: the patch around it
    // is far brighter than the cell it stands in, and far brighter than the
    // same patch at the crystal's mirror image — which is where the light
    // would be if it followed the frame but not the facing.
    const core = glow(read, shown.cell, crystal, CORE);
    const mirrored = glow(read, shown.cell, { x: shown.cell.w - crystal.x, y: crystal.y }, CORE);
    const cell = litness(read);

    expect(core, `${where}: core ${core} against the cell's ${cell}`).toBeGreaterThan(cell * 1.5);
    expect(core, `${where}: core ${core} against its mirror's ${mirrored}`).toBeGreaterThan(
      mirrored * 2,
    );
  });
}
