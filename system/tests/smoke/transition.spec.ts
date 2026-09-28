// The hand-over in a real browser (level-design.md): lighting the glade's
// beacon in the run the page boots puts the wizard in the ruin gate, and the
// render layer draws the room the world is in rather than the one it was built
// for — the painting behind him, the props on the actor layer, and the ticket
// card, which speaks for one room's bug and no other (ticket-card.md). The
// simulation's half of this is a replay test, tests/sim/transition.test.ts;
// what needs a browser is the art and the UI that follow it.

import { expect, test, type Page } from '@playwright/test';

import { fieldsOf } from './wizard-frame';

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
 * Open the run the page boots — the level of game/content/order.ts, so its
 * beacons hand over — on a paused clock, past the title, with one frame drawn.
 * That frame matters here: it is what makes the render layer hold the glade,
 * which is the state a hand-over has to clear.
 */
async function open(page: Page): Promise<string[]> {
  const errors: string[] = [];

  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto('/');
  await page.waitForFunction(() => window.wizard !== undefined);
  await page.evaluate(() => {
    window.wizard.paused = true;
    window.wizard.start();
  });
  await drawn(page);

  return errors;
}

/**
 * Stand the wizard in the glade's beacon, the way tests/smoke/props.spec.ts
 * stands him in a prop, and step the tick that lights it and the one after it.
 * Gives back the room the world is in once they have run.
 */
async function handOver(page: Page): Promise<string> {
  const room = await page.evaluate(() => {
    const { props, player } = window.wizard.state();
    const beacon = props.find((prop) => prop.kind === 'beacon');

    if (beacon === undefined) {
      throw new Error('the glade carries no beacon');
    }

    player.x = beacon.x;
    player.y = beacon.y;
    window.wizard.step(2, {});

    return window.wizard.state().roomName;
  });

  await drawn(page);

  return room;
}

/** What the card is saying this frame, and whether it is up at all. */
async function card(page: Page): Promise<{ says: string; up: boolean }> {
  const canvas = page.locator('#game canvas');
  const says = (await canvas.getAttribute('data-ui-card')) ?? '';
  const up = ((await canvas.getAttribute('data-ui')) ?? '').split(' ').includes('card');

  return { says, up };
}

test('lighting the glade beacon draws the ruin gate', async ({ page }) => {
  const errors = await open(page);

  expect(await handOver(page)).toBe('ruin-gate');
  // The loop draws every animation frame, paused clock or not, so the room
  // layer's own report says which painting it put up as soon as it has.
  await expect
    .poll(async () => (await fieldsOf(page, 'room')).get('painting'))
    .toBe('ruin-gate');
  expect(errors).toEqual([]);
});

test('the props of the room left behind are not left on screen', async ({ page }, info) => {
  const errors = await open(page);
  const glade = await fieldsOf(page, 'props');

  // The glade drew props of its own, which is what the actor layer is holding
  // when the beacon is touched.
  expect(Number(glade.get('held'))).toBeGreaterThan(0);

  expect(await handOver(page)).toBe('ruin-gate');

  const gate = await fieldsOf(page, 'props');
  // `held` is every sprite on the layer and the rest of the fields are the
  // props of the room the world is in, so the two agreeing is the whole claim:
  // nothing is being drawn that this room did not ask for. Both rooms number
  // their props from zero and the same id is a bush in one and a waterfall in
  // the other, so a layer that kept the glade's sprites would hang its bush
  // in mid-air here — a stale draw the prop fields alone cannot see.
  const drawnHere = [...gate.keys()].filter((name) => name.includes(':')).length;

  expect(drawnHere).toBeGreaterThan(0);
  expect(Number(gate.get('held'))).toBe(drawnHere);
  expect(errors).toEqual([]);

  // A file the run keeps, not a body: the list reporter drops body-only
  // attachments, and the ruin gate's first frame is worth being able to look at.
  const shot = info.outputPath('ruin-gate-after-handover.png');

  await page.screenshot({ path: shot });
  await info.attach('ruin-gate-after-handover.png', { path: shot, contentType: 'image/png' });
});

test('the card of the room left behind goes down on the hand-over', async ({ page }) => {
  const errors = await open(page);

  // Hand the creature to the wizard, which is what makes the glade's bug felt
  // and brings its card up by itself, the way tests/smoke/ticket.spec.ts does
  // it. A clean manifest builds the world without a creature, so the test
  // carries one.
  await page.evaluate(() => {
    const state = window.wizard.state();

    state.creature = {
      at: -1,
      travelTo: -1,
      travelUntil: -1,
      carriedSince: state.tick,
      firstCarried: true,
    };
  });
  await drawn(page);

  const inTheGlade = await card(page);

  expect(inTheGlade.up).toBe(true);
  expect(inTheGlade.says).not.toBe('');

  expect(await handOver(page)).toBe('ruin-gate');

  // The ruin gate's player has felt nothing and read nothing there, so the
  // card has nothing to say: the glade's words and its Raise ticket button
  // must not still be on screen (ticket-card.md — the faces are chosen from
  // the room's own manifest entry, water and creature).
  expect(await card(page)).toEqual({ says: '', up: false });
  expect(errors).toEqual([]);
});
