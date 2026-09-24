// The loop. Real time is accumulated and spent in whole 60 Hz ticks, the scene
// is drawn once per frame with no interpolation, and `window.wizard` exposes
// the run to browser tests (docs/plan/02-design/simulation-architecture.md).

import { rooms } from './content/rooms';
import { createHud } from './render/hud';
import { createScene } from './render/scene';
import { createKeyboard } from './render/input';
import { createBanner } from './render/panel';
import { createTicketCard, type CardFacts } from './render/ticket';
import { createTitle, startsRun } from './render/title';
import { createWorld, DT, NO_INPUT, tick, type InputFrame, type WorldState } from './sim';

/** The room `?room=` falls back to. */
const DEFAULT_ROOM = 'forest-glade';

/**
 * The longest stretch of real time one frame may spend. A tab that was in the
 * background for a minute resumes the run, it does not fast-forward it.
 */
const MAX_CATCH_UP_SECONDS = 0.25;

/** The automation surface (simulation-architecture.md, AGENTS.md rule 8). */
export interface Wizard {
  /** Leave the title screen. */
  start(): void;
  /** Restart the current room. */
  reset(): void;
  /** Stops the loop from ticking; `step` still runs. */
  paused: boolean;
  /** Run `n` ticks on one input frame, right now. Unheld buttons are false. */
  step(n: number, input?: Partial<InputFrame>): void;
  /** The live world. */
  state(): WorldState;
}

declare global {
  interface Window {
    wizard: Wizard;
  }
}

const mount = document.querySelector<HTMLElement>('#game');

if (mount === null) {
  throw new Error('index.html must provide a #game container');
}

const wanted = new URLSearchParams(window.location.search).get('room');
// `hasOwn`, not `in`: `?room=toString` would otherwise find a function on the
// prototype of the plain object the glob builds and skip the fallback.
const roomName = wanted !== null && Object.hasOwn(rooms, wanted) ? wanted : DEFAULT_ROOM;
const roomText = rooms[roomName];

if (roomText === undefined) {
  throw new Error(`game/content/rooms/ has no ${DEFAULT_ROOM}.ts to fall back to`);
}

const freshWorld = (): WorldState => createWorld(roomText, { roomName });

const scene = await createScene(mount);
const keyboard = createKeyboard();

/** No manifest and no creature yet, so the card holds the clean state. */
const CARD_FACTS: CardFacts = { bug: null, felt: false, logsRead: false };

const title = createTitle();
const hud = createHud();
const banner = createBanner();
const card = createTicketCard(() => {
  // HWP-053 opens the prefilled issue here. The button's path already obeys
  // ADR-006 — panel.ts binds it to pointerdown — but the T key's does not:
  // takeEdges() buffers the press and card.press runs in the frame loop below,
  // so a window.open called from here on the T path would be popup-blocked.
  // HWP-053 has to close that gap by giving createKeyboard a synchronous
  // one-shot callback for T rather than reusing the edge flags. Nothing is
  // wrong today only because this is empty, and because a clean manifest never
  // reaches the face that offers the button.
});

scene.ui.addChild(title.view, hud.view, card.view, banner.view);

function layout(): void {
  const { innerWidth, innerHeight } = window;

  title.layout(innerWidth, innerHeight);
  hud.layout(innerWidth, innerHeight);
  card.layout(innerWidth, innerHeight);
  banner.layout(innerWidth, innerHeight);
}

/**
 * What the UI actually drew, measured off the live objects so a browser test
 * reads the result and not the rule, the way scene.ts publishes the fit.
 */
function publishUi(): void {
  const up = [
    title.view.visible ? 'title' : '',
    card.view.visible ? 'card' : '',
    banner.view.visible ? 'banner' : '',
  ];

  publish('ui', up.filter((name) => name !== '').join(' '));
  publish('uiText', hud.report());
  publish('uiCardText', card.report());
  publish('uiTitleText', title.report());
}

/** Written only when it changes, the way scene.ts writes its own fit. */
const published = new Map<string, string>();

function publish(name: string, value: string): void {
  if (published.get(name) !== value) {
    published.set(name, value);
    scene.canvas.dataset[name] = value;
  }
}

layout();
window.addEventListener('resize', layout);

let world = freshWorld();
let started = false;
let debug = false;
let pending = 0;
let previous = performance.now();

const wizard: Wizard = {
  paused: false,

  start(): void {
    started = true;
  },

  reset(): void {
    world = freshWorld();
    pending = 0;
    // A fresh run starts with no card, and the tick its clock counts from.
    card.hide();
  },

  step(n: number, input: Partial<InputFrame> = {}): void {
    const frame = { ...NO_INPUT, ...input };

    for (let i = 0; i < n; i += 1) {
      tick(world, frame);
    }
  },

  state(): WorldState {
    return world;
  },
};

window.wizard = wizard;

function frame(now: number): void {
  requestAnimationFrame(frame);

  const elapsed = Math.min((now - previous) / 1000, MAX_CATCH_UP_SECONDS);

  previous = now;

  const edges = keyboard.takeEdges();

  if (startsRun(edges, started)) {
    wizard.start();
  } else if (edges.start) {
    // Mid-run the start keys are the card's: they wave it away, and a card
    // that has been up for less than three seconds ignores them.
    card.dismiss(world.tick);
  }

  if (edges.restart) {
    wizard.reset();
  }

  if (edges.debug) {
    debug = !debug;
  }

  if (edges.ticket && started) {
    card.press(CARD_FACTS, world.tick);
  }

  if (started && !wizard.paused) {
    pending += elapsed;

    // Held keys cannot change inside this loop, so they are sampled once.
    const input = keyboard.frame();

    while (pending >= DT) {
      tick(world, input);
      pending -= DT;
    }
  }

  title.view.visible = !started;
  hud.view.visible = started;
  hud.update(world, debug);
  banner.update(world);

  scene.watch(world);
  scene.render();
  publishUi();
}

requestAnimationFrame(frame);
