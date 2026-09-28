// The props in a real browser: HWP-024's acceptance. Every prop of the glade
// is drawn from the first frame, charging one plays the animation its kind
// has (rendering-and-look.md, Sprites), a hit shakes it, and the creature's
// eyes blink at the prop it hides in (bug-quest.md, the creature).
//
// What was drawn is read off the report game/render/props.ts publishes on the
// canvas, the way the wizard's frame and the layer stack are read, and one
// screenshot of each animation is attached to the run so the frames can be
// looked at as well.

import { expect, test, type Page, type TestInfo } from '@playwright/test';
import sharp from 'sharp';

import forestGlade from '../../game/content/rooms/forest-glade';
import { CREATURE_EYES, PROP_SHAKE, VIEW_H, VIEW_W } from '../../game/render/config';
import { parseRoom, PLAYER_HEIGHT, type InputFrame, type Vec2 } from '../../game/sim/index';

import { fieldsOf, hatOf } from './wizard-frame';

/** The view at the smallest scale ADR-003 allows: it fills the window exactly. */
const VIEWPORT = { width: VIEW_W * 2, height: VIEW_H * 2 } as const;

test.use({ viewport: { ...VIEWPORT } });

/** Window pixels per world unit here; the view fills the window, so no offset. */
const SCALE = VIEWPORT.width / VIEW_W;

/** How far left of a prop the wizard is stood before he goes at it. */
const CLEAR = 28;

/** Ticks he is given to reach the prop from there; he needs a third of them. */
const PATIENCE = 40;

/**
 * Ticks that outlast both the rustle and the dash that starts it: the charge
 * stamps a prop again on every tick its tip is still inside it, so the last
 * hit of one charge can be a dozen ticks after the first.
 */
const SETTLE = 60;

/** The props the glade's map carries, in the order the parser finds them. */
const GLADE_PROPS = parseRoom(forestGlade).props;

/** Let the loop take a frame; it draws the world once per animation frame. */
function drawn(page: Page): Promise<void> {
  return page.evaluate(
    () =>
      new Promise<void>((done) => {
        requestAnimationFrame(() => requestAnimationFrame(() => done()));
      }),
  );
}

/**
 * Open the glade on a paused clock, past the title, with one frame drawn. It
 * is asked for by name so it is played on its own: in the chained run of
 * game/content/order.ts its beacon hands the wizard to the next room instead
 * of lighting and burning where he left it (level-design.md).
 */
async function open(page: Page): Promise<void> {
  await page.goto('/?room=forest-glade');
  await page.waitForFunction(() => window.wizard !== undefined);
  await page.evaluate(() => {
    window.wizard.paused = true;
    window.wizard.start();
  });
  await drawn(page);
}

/** What every prop of the glade drew, by kind and prop id, and the eyes. */
async function shown(page: Page): Promise<Map<string, string>> {
  return fieldsOf(page, 'props');
}

/** The cell the first prop of one kind is showing, and how far a hit shook it. */
async function drew(page: Page, kind: string): Promise<{ frame: number; shake: number }> {
  const prop = GLADE_PROPS.find((found) => found.kind === kind);
  const [frame = '', shake = ''] = ((await shown(page)).get(`${kind}:${prop?.id}`) ?? '').split(
    ',',
  );

  return { frame: Number(frame), shake: Number(shake) };
}

/**
 * Stand the wizard beside the first prop of a kind and hold one input until
 * the prop has been touched. The props are what is under test, so he is put
 * in front of them rather than played across the room to each; only a test
 * writes to the world like this, the way tests/smoke/wizard.spec.ts does.
 */
async function reach(page: Page, kind: string, input: Partial<InputFrame>): Promise<void> {
  await page.evaluate(
    (at) => {
      const state = window.wizard.state();
      const prop = state.props.find((found) => found.kind === at.kind);

      if (prop === undefined) {
        throw new Error(`the glade carries no ${at.kind}`);
      }

      const { player } = state;

      // On the prop's own base line, a little clear of its left edge, facing it.
      player.x = prop.x - at.clear;
      player.y = prop.y + prop.h - at.height;
      player.vx = 0;
      player.vy = 0;
      player.facing = 1;
      player.chargeCooldown = 0;

      for (let tick = 0; tick < at.patience && prop.hitTick < 0; tick += 1) {
        window.wizard.step(1, at.input);
      }

      if (prop.hitTick < 0) {
        throw new Error(`the wizard never reached the ${at.kind}`);
      }
    },
    { kind, input, clear: CLEAR, height: PLAYER_HEIGHT, patience: PATIENCE },
  );
  await drawn(page);
}

/** Run the clock on, without touching anything, and draw the frame it ends on. */
async function wait(page: Page, ticks: number): Promise<void> {
  await page.evaluate((count) => {
    window.wizard.step(count);
  }, ticks);
  await drawn(page);
}

/** Keep the frame with the run, so the animation can be looked at. */
async function shot(page: Page, info: TestInfo, name: string): Promise<void> {
  await info.attach(name, { body: await page.screenshot(), contentType: 'image/png' });
}

/** The point in view units the eyes stand at, as the report gives it. */
async function eyesAt(page: Page): Promise<string> {
  return (await shown(page)).get('eyes') ?? '';
}

/** How far off the eyes' own red, per channel, a pixel may be and still be one. */
const EYE_TOLERANCE = 60;

/**
 * How many pixels of the eyes' red are on screen around a point of the view.
 * The eyes are drawn in code in one flat colour, so counting that colour is
 * the only way to tell eyes that were drawn from eyes some other layer
 * painted over — which a report of where they were put cannot say.
 */
async function eyeRedAround(page: Page, at: Vec2): Promise<number> {
  const { patch, eye, colour } = CREATURE_EYES;
  const { data, info } = await sharp(
    await page.screenshot({
      clip: {
        x: Math.round((at.x - patch) * SCALE),
        y: Math.round((at.y - eye * 2) * SCALE),
        width: Math.round(patch * 2 * SCALE),
        height: Math.round(eye * 4 * SCALE),
      },
    }),
  )
    .raw()
    .toBuffer({ resolveWithObject: true });
  let seen = 0;

  for (let px = 0; px + info.channels <= data.length; px += info.channels) {
    const near = (shift: number, channel: number): boolean =>
      Math.abs((data[px + channel] ?? 0) - ((colour >> shift) & 0xff)) <= EYE_TOLERANCE;

    if (near(16, 0) && near(8, 1) && near(0, 2)) {
      seen += 1;
    }
  }

  return seen;
}

test('draws every prop of the glade at rest, and leaves the waterfall alone', async ({ page }) => {
  await open(page);

  const fields = await shown(page);
  // The waterfall is drawn in code (HWP-025), so it has no strip and this
  // layer never draws it.
  const expected = GLADE_PROPS.filter((prop) => prop.kind !== 'waterfall').map(
    (prop) => `${prop.kind}:${prop.id}`,
  );

  expect([...fields.keys()].filter((key) => key.includes(':'))).toEqual(expected);
  // Every one of them on its idle frame, and none of them shaken.
  expect(expected.map((key) => fields.get(key))).toEqual(expected.map(() => '0,0'));
});

test('a charge rustles the bush and shakes it, and it settles again', async ({ page }, info) => {
  await open(page);
  await reach(page, 'bush', { charge: true });

  const hit = await drew(page, 'bush');

  expect(hit.frame).toBeGreaterThan(0);
  expect(Math.abs(hit.shake)).toBe(PROP_SHAKE.units);
  await shot(page, info, 'bush-rustling.png');

  // The rustle is 24 ticks long, and the shake four of them.
  await wait(page, SETTLE);
  expect(await drew(page, 'bush')).toEqual({ frame: 0, shake: 0 });
});

test('a charge sets the log chattering', async ({ page }, info) => {
  await open(page);
  await reach(page, 'log', { charge: true });

  expect((await drew(page, 'log')).frame).toBeGreaterThan(0);
  await shot(page, info, 'log-chattering.png');
});

test('a charge cracks the rock and it stays open', async ({ page }, info) => {
  await open(page);
  await reach(page, 'rock', { charge: true });

  expect((await drew(page, 'rock')).frame).toBe(1);

  // Four crack frames, and the last of them is the open one it keeps.
  await wait(page, SETTLE);
  const cracked = (await drew(page, 'rock')).frame;

  await shot(page, info, 'rock-open.png');
  await wait(page, 120);
  expect(cracked).toBe(4);
  expect((await drew(page, 'rock')).frame).toBe(cracked);
});

test('the flag raises and then waves, and the beacon lights and then burns', async ({
  page,
}, info) => {
  for (const kind of ['flag', 'beacon'] as const) {
    await open(page);
    await reach(page, kind, { right: true });

    expect((await drew(page, kind)).frame, `${kind} raised`).toBe(1);

    // Two frames of raising or lighting, then the two it loops on for good.
    await wait(page, 12);
    expect((await drew(page, kind)).frame, `${kind} looping`).toBeGreaterThan(2);
    await shot(page, info, `${kind}-lit.png`);
    await wait(page, 120);
    expect((await drew(page, kind)).frame, `${kind} still looping`).toBeGreaterThan(2);
  }
});

test('the creature blinks its eyes at the prop it hides in', async ({ page }, info) => {
  await open(page);

  /** Put the creature in the first prop of a kind and draw the frame. */
  async function hideIn(kind: string): Promise<string> {
    await page.evaluate((hides) => {
      const state = window.wizard.state();
      const prop = state.props.find((found) => found.kind === hides);

      // HWP-051 is what puts the creature in its hiding place; until it
      // lands, the test places it where bugs/manifest.json says it hides.
      state.creature = {
        at: prop?.id ?? -1,
        travelTo: -1,
        travelUntil: -1,
        carriedSince: -1,
        firstCarried: false,
      };
    }, kind);
    await drawn(page);

    return eyesAt(page);
  }

  // A run opens on tick 0 with the eyes open, so the start-of-run shot the
  // acceptance asks for has eyes in it rather than a blink.
  const atBush = await hideIn('bush');

  await shot(page, info, 'eyes-at-the-bush.png');

  const atLog = await hideIn('log');

  await shot(page, info, 'eyes-at-the-log.png');

  /** The middle of the first prop of a kind, in world units. */
  const middleOf = (kind: string): number => {
    const prop = GLADE_PROPS.find((found) => found.kind === kind);

    return (prop?.x ?? 0) + (prop?.w ?? 0) / 2;
  };

  expect(atBush).toMatch(/^-?[\d.]+,-?[\d.]+$/);
  // The wizard has not moved between the two frames, so neither has the
  // camera: the eyes moved by the distance between the two hiding places.
  expect(Number(atLog.split(',')[0]) - Number(atBush.split(',')[0])).toBeCloseTo(
    middleOf('log') - middleOf('bush'),
  );

  // And a creature on its way from one hiding place to the next shows nothing.
  await page.evaluate(() => {
    const creature = window.wizard.state().creature;

    if (creature !== null) {
      creature.at = -1;
      creature.travelTo = 0;
      creature.travelUntil = 30;
    }
  });
  await drawn(page);
  expect(await eyesAt(page)).toBe('none');
});

test('the eyes ride on the hat in front of the wizard, not behind him', async ({ page }, info) => {
  await open(page);

  const hat = await hatOf(page);

  // Nothing of the eyes' red is on the hat before a creature is carried, so
  // whatever the reading finds afterwards is the eyes and not the art there.
  expect(await eyeRedAround(page, hat)).toBe(0);

  // HWP-051 is what hands the creature to the wizard; until it lands, the
  // test carries it, the way it hides it in a prop above. HWP-052 owns the
  // hat case proper — this asserts only that the eyes are not painted over.
  await page.evaluate(() => {
    window.wizard.state().creature = {
      at: -1,
      travelTo: -1,
      travelUntil: -1,
      carriedSince: 0,
      firstCarried: false,
    };
  });
  await drawn(page);
  expect(await eyesAt(page)).toBe(`${hat.x},${hat.y}`);
  await shot(page, info, 'eyes-on-the-hat.png');

  // Two eyes of CREATURE_EYES.eye units square, drawn over the wizard rather
  // than under him: most of their pixels survive to the screen.
  expect(await eyeRedAround(page, hat)).toBeGreaterThan(CREATURE_EYES.eye ** 2 * SCALE ** 2);
});
