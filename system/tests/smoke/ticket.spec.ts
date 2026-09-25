// The ticket card in a real browser: HWP-052's acceptance. The card is down
// before the player has done anything, it comes up by itself with what the
// waterfall's logs told him, it names the bug and offers the way out once the
// creature has ridden along as well, and the eyes are on the hat while it does
// (docs/plan/02-design/bug-quest.md, evidence and the ticket card).
//
// What the card says is read off the report game/main.ts publishes on the
// canvas, the way the props and the layer stack are read, and the carried
// frame is attached to the run so the eyes can be looked at.

import { expect, test, type Page } from '@playwright/test';

import { TICKET_DISMISS_TICKS, VIEW_H, VIEW_W } from '../../game/render/config';
import { bugForRoom } from '../../game/sim/index';

import { fieldsOf, hatOf } from './wizard-frame';

/** The view at the smallest scale ADR-003 allows: it fills the window exactly. */
test.use({ viewport: { width: VIEW_W * 2, height: VIEW_H * 2 } });

/** The room game/main.ts opens on, and the bug its manifest plants there. */
const ROOM = 'forest-glade';
const BUG = bugForRoom(ROOM);

/**
 * The two faces the acceptance names, in the manifest's own words. They are
 * spelled out here rather than asked of game/render/ticket.ts, so this suite
 * asserts the sentence the player reads and not the rule that built it. A
 * clean manifest has neither half of a bug to say and both of them are the
 * clean face; with HW-001 planted (HWP-054) they read as HWP-052's acceptance
 * writes them.
 */
const CLEAN = 'no button: The logs are clean.';

const LOGS_READ =
  BUG === undefined
    ? CLEAN
    : `no button: The logs mention a bug in ${BUG.clue}. It hides in the ${BUG.creature.hides}.`;

const FELT_AS_WELL =
  BUG === undefined
    ? CLEAN
    : `button: The logs name your bug: ${BUG.id} ${BUG.title}. Raise a ticket.`;

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
 * Put the wizard in the waterfall's column, a tile below its lip, and let one
 * tick see him there: that is the touch game/sim/water.ts stamps, which parts
 * the water and shows the logs behind it. The card is what is under test, so
 * he is put in the water rather than played into it, the way
 * tests/smoke/props.spec.ts puts him in front of a prop.
 */
async function partTheWater(page: Page): Promise<void> {
  await page.evaluate(() => {
    const state = window.wizard.state();
    const water = state.props.find((prop) => prop.kind === 'waterfall');

    if (water === undefined) {
      throw new Error('the glade carries no waterfall');
    }

    state.player.x = water.x + water.w / 2;
    state.player.y = water.y + 16;
    window.wizard.step(1);

    if (water.hitTick < 0) {
      throw new Error('the water was never touched');
    }
  });
  await drawn(page);
}

/**
 * Hand the creature to the wizard, which is what makes the bug felt. A clean
 * manifest builds the world without one (game/sim/state.ts), so the test
 * carries it the way tests/smoke/props.spec.ts does.
 */
async function carryTheCreature(page: Page): Promise<void> {
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
}

/** What the card is saying this frame, and what the UI is showing at all. */
async function card(page: Page): Promise<{ says: string; up: boolean }> {
  const canvas = page.locator('#game canvas');
  const says = (await canvas.getAttribute('data-ui-card')) ?? '';
  const up = ((await canvas.getAttribute('data-ui')) ?? '').split(' ').includes('card');

  return { says, up };
}

test('the card is down until the player has felt the bug or read the logs', async ({ page }) => {
  await open(page);

  expect(await card(page)).toEqual({ says: '', up: false });

  // And it stays down while the run goes on and he touches nothing.
  await page.evaluate(() => {
    window.wizard.step(120);
  });
  await drawn(page);

  expect(await card(page)).toEqual({ says: '', up: false });
});

test('parting the water brings the card up with what the logs said', async ({ page }) => {
  await open(page);
  await partTheWater(page);

  expect(await card(page)).toEqual({ says: LOGS_READ, up: true });
});

test('words that have been waved away are not put straight back up', async ({ page }) => {
  await open(page);
  await partTheWater(page);

  expect(await card(page)).toEqual({ says: LOGS_READ, up: true });

  // Three seconds of the card are the player's, and after them Enter takes it
  // down (tests/smoke/ui.spec.ts holds that boundary itself).
  await page.evaluate((ticks) => {
    window.wizard.step(ticks);
  }, TICKET_DISMISS_TICKS);
  await page.keyboard.press('Enter');
  await drawn(page);

  expect(await card(page)).toEqual({ says: '', up: false });

  // And it stays down. The facts have not changed, and the card remembers what
  // it said while it was up: a card that forgot would be raised again by the
  // very next frame's update, pushing the same sentence back at the player.
  await page.evaluate(() => {
    window.wizard.step(60);
  });
  await drawn(page);

  expect(await card(page)).toEqual({ says: '', up: false });
});

test('carrying the creature as well names the bug and offers the way out', async ({
  page,
}, info) => {
  await open(page);
  await partTheWater(page);
  await carryTheCreature(page);

  expect(await card(page)).toEqual({ says: FELT_AS_WELL, up: true });

  // The creature is on the hat while the card names what it carries, which is
  // the frame the acceptance asks to see.
  const hat = await hatOf(page);

  expect((await fieldsOf(page, 'props')).get('eyes')).toBe(`${hat.x},${hat.y}`);
  // A file the run keeps, not a body: the list reporter drops body-only
  // attachments, and the acceptance asks for a frame that can be looked at.
  const shot = info.outputPath('card-while-carried.png');

  await page.screenshot({ path: shot });
  await info.attach('card-while-carried.png', { path: shot, contentType: 'image/png' });
});
