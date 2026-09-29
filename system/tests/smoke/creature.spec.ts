// The creature on a real page: HWP-061's two acceptance lines. The glitch
// aura at its hiding place grows as the wizard closes on it, shown at the
// three distances the ticket names, and the wisp it turns into while it rides
// stands on the hat in every state the wizard's own table has.
//
// What was drawn is read off the report game/render/props.ts publishes on the
// canvas — `aura`, `throw` and `form` are game/render/creature.ts's own fields
// of it — and a frame of each is written to the run's output directory so the
// aura and the wisp can be looked at as well.
//
// The world is written to rather than played into: the aura is a function of
// how far the wizard stands from the prop and the wisp of which state he is
// in, so both are set directly, the way tests/smoke/wizard.spec.ts stands him
// in a pose and tests/smoke/props.spec.ts puts him beside a prop. The tick is
// set the same way — nothing here steps the simulation, so every frame below
// is the renderer's alone.

import { expect, test, type Page, type TestInfo } from '@playwright/test';

import { CREATURE_AURA, VIEW_H, VIEW_W } from '../../game/render/config';
import { PLAYER_HEIGHT, PLAYER_WIDTH, type PlayerState, type Vec2 } from '../../game/sim/index';

import { fieldsOf, hatOf, numbers } from './wizard-frame';

/** The view at the smallest scale ADR-003 allows: it fills the window exactly. */
const VIEWPORT = { width: VIEW_W * 2, height: VIEW_H * 2 } as const;

test.use({ viewport: { ...VIEWPORT } });

/** Window pixels per world unit here; the view fills the window, so no offset. */
const SCALE = VIEWPORT.width / VIEW_W;

/** The three distances from the hiding place the acceptance asks to see. */
const DISTANCES = [120, 60, 16] as const;

/** Units either side of a point a shot of it is clipped to. */
const AROUND = 20;

/** A box of the window, in window pixels, for a clipped screenshot. */
interface Clip {
  x: number;
  y: number;
  width: number;
  height: number;
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

/** Open the glade on a paused clock, past the title, with one frame drawn. */
async function open(page: Page): Promise<void> {
  await page.goto('/?room=forest-glade');
  await page.waitForFunction(() => window.wizard !== undefined);
  await page.evaluate(() => {
    window.wizard.paused = true;
    window.wizard.start();
  });
  await drawn(page);
}

/** What the props layer last published, by field name. */
async function shown(page: Page): Promise<Map<string, string>> {
  return fieldsOf(page, 'props');
}

/**
 * Keep the frame with the run: written to the test's own output directory and
 * attached by path, because `playwright.config.ts` reports with `list` and a
 * body-only attachment is dropped by it (tests/smoke/waterfall.spec.ts).
 */
async function shot(page: Page, info: TestInfo, name: string, clip: Clip): Promise<void> {
  const path = info.outputPath(name);

  await page.screenshot({ path, clip });
  await info.attach(name, { path, contentType: 'image/png' });
}

/** The box around a point of the view, in window pixels, kept on the window. */
function around(at: Vec2): Clip {
  const side = AROUND * 2 * SCALE;
  const on = (value: number, edge: number): number =>
    Math.min(Math.max(0, value - side / 2), edge - side);

  return {
    x: on(at.x * SCALE, VIEWPORT.width),
    y: on(at.y * SCALE, VIEWPORT.height),
    width: side,
    height: side,
  };
}

/** Where the creature was drawn on the frame just published, in view units. */
async function creatureAt(page: Page): Promise<Vec2> {
  const [x = 0, y = 0] = numbers((await shown(page)).get('eyes'));

  return { x, y };
}

/**
 * Draw frames until the report stops changing. The clock is paused, so the
 * only thing still moving once the wizard has been put somewhere is the
 * camera: it drags towards him over several frames, and a shot taken while it
 * was still travelling would be clipped to where the hiding place was rather
 * than to where it is.
 */
async function settled(page: Page): Promise<void> {
  let last = '';

  for (let frame = 0; frame < 90; frame += 1) {
    await drawn(page);

    const now = (await shown(page)).get('eyes') ?? '';

    if (now === last) {
      return;
    }

    last = now;
  }

  throw new Error('the camera never came to rest');
}

/**
 * Hide the creature in the glade's bush, stand the wizard's middle this many
 * units left of the bush's middle, put the world on one tick and draw it.
 * Nothing here steps the simulation, so that tick is the whole of the clock
 * the aura is a function of — and a headless browser draws a few frames a
 * second (tests/smoke/particles.spec.ts), so the frames a test asks for are
 * counted rather than spent freely.
 */
async function closeOn(page: Page, away: number, tick: number): Promise<void> {
  await page.evaluate(
    (stand) => {
      const state = window.wizard.state();
      const bush = state.props.find((prop) => prop.kind === 'bush');

      if (bush === undefined) {
        throw new Error('the glade carries no bush for the creature to hide in');
      }

      state.creature = {
        at: bush.id,
        travelTo: -1,
        travelUntil: -1,
        carriedSince: -1,
        firstCarried: false,
      };
      state.tick = stand.tick;
      state.player.x = bush.x + bush.w / 2 - stand.width / 2 - stand.away;
      state.player.y = bush.y + bush.h / 2 - stand.height / 2;
    },
    { away, tick, width: PLAYER_WIDTH, height: PLAYER_HEIGHT },
  );
  await drawn(page);
}

/** How hard the aura pulled on the frame just drawn, and how far it threw. */
async function auraOf(page: Page): Promise<{ strength: number; thrown: number }> {
  const fields = await shown(page);
  const [x = 0, y = 0] = numbers(fields.get('throw'));

  return { strength: Number(fields.get('aura')), thrown: Math.hypot(x, y) };
}

/** The tick every frame of the aura below is read on and shown at. */
const AURA_TICK = 1;

test('the aura at the hiding place grows as the wizard comes near it', async ({ page }) => {
  await open(page);

  // The same tick for all three, so what the frames differ by is how hard the
  // aura is pulling and not which tick each was read on.
  await closeOn(page, DISTANCES[0], AURA_TICK);

  const far = await auraOf(page);

  await closeOn(page, DISTANCES[1], AURA_TICK);

  const middle = await auraOf(page);

  await closeOn(page, DISTANCES[2], AURA_TICK);

  const near = await auraOf(page);

  // Out past the aura's reach the prop stands where the room put it.
  expect(far).toEqual({ strength: 0, thrown: 0 });
  expect(middle.strength).toBeGreaterThan(far.strength);
  expect(near.strength).toBeGreaterThan(middle.strength);
  // And the pull reaches the sprite: the throw grows with it, up to the few
  // pixels CREATURE_AURA allows it and no further.
  expect(middle.thrown).toBeGreaterThan(0);
  expect(near.thrown).toBeGreaterThan(middle.thrown);
  expect(near.thrown).toBeLessThanOrEqual(Math.hypot(CREATURE_AURA.units, CREATURE_AURA.units));
});

/**
 * And the frame of each, kept with the run so the three can be looked at side
 * by side, as the acceptance asks. One test per distance, for the reason the
 * wisp's are split below: each waits for the camera to come to rest before it
 * clips a box of the view around the hiding place, and three of those waits
 * in a row overran the budget on a headless browser.
 */
for (const away of DISTANCES) {
  test(`the hiding place is drawn with the wizard ${away} units off it`, async ({ page }, info) => {
    await open(page);
    await closeOn(page, away, AURA_TICK);
    await settled(page);
    await shot(page, info, `aura-at-${away}-units.png`, around(await creatureAt(page)));

    expect((await auraOf(page)).strength).toBeCloseTo(
      Math.max(0, 1 - away / CREATURE_AURA.reach),
      2,
    );
  });
}

/** Ticks into the state each shot is taken, so the strips are past frame one. */
const STATE_TIMER = 4;

/** Every state of the wizard's own table (game/sim/state.ts). */
const STATES: readonly PlayerState[] = [
  'idle',
  'run',
  'jump',
  'fall',
  'charge',
  'chargeRecoil',
  'land',
  'hurt',
  'victory',
];

/**
 * One test per state rather than one loop over all of them, for the reason
 * tests/smoke/wizard.spec.ts splits its own: a headless browser draws and
 * shoots slowly enough that nine of these in a row overran the test budget,
 * and split they fill the workers instead of holding one of them.
 */
for (const state of STATES) {
  test(`the wisp rides the hat while the wizard is ${state}`, async ({ page }, info) => {
    await open(page);
    await page.evaluate(
      (stand) => {
        const world = window.wizard.state();

        world.player.state = stand.state as PlayerState;
        world.player.stateTimer = stand.stateTimer;
        world.creature = {
          at: -1,
          travelTo: -1,
          travelUntil: -1,
          carriedSince: 0,
          firstCarried: true,
        };
      },
      { state, stateTimer: STATE_TIMER },
    );
    await drawn(page);

    // The wisp, and not the plain eyes, on the hat of the very cell the
    // wizard published for this state. The clock is paused and the wizard has
    // not moved, so the two reports below are of the same frame.
    const fields = await shown(page);
    const hat = await hatOf(page);

    expect(fields.get('form')).toBe('wisp');
    expect(fields.get('eyes')).toBe(`${hat.x},${hat.y}`);
    await shot(page, info, `wisp-on-the-hat-${state}.png`, around(hat));
  });
}
