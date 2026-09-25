// The loop. Real time is accumulated and spent in whole 60 Hz ticks, the scene
// is drawn once per frame with no interpolation, and `window.wizard` exposes
// the run to browser tests (docs/plan/02-design/simulation-architecture.md).

import { rooms } from './content/rooms';
import { createHud } from './render/hud';
import { createScene } from './render/scene';
import { createKeyboard } from './render/input';
import { createBanner } from './render/panel';
import { createProps } from './render/props';
import { cardBug, createTicketCard, type CardFacts } from './render/ticket';
import { createTitle, startsRun } from './render/title';
import { createWaterfall, logsRead } from './render/waterfall';
import { createWizard, type WizardFrame } from './render/wizard';
import {
  bugForRoom,
  createWorld,
  DT,
  NO_INPUT,
  tick,
  type InputFrame,
  type WorldState,
} from './sim';

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
  /** The frame the renderer draws for the world as it stands right now. */
  readonly debug: WizardFrame;
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

// The room's planted bug, or undefined in a clean room. The manifest of the
// branch being built is the one source (ADR-005): it decides whether the room
// has a creature to carry the bug, which lines the waterfall hides, and what
// the ticket card is able to say.
const roomBug = bugForRoom(roomName);

/** The manifest's entry as the card takes it, settled once with the room. */
const CARD_BUG = cardBug(roomBug);

const freshWorld = (): WorldState =>
  createWorld(roomText, { roomName, creature: roomBug !== undefined });

// No load needs anything of the others, so all three chains are in flight at
// once and the wizard's sheets do not wait on the backdrops.
const [scene, wizardView, propsView] = await Promise.all([
  createScene(mount, roomName),
  createWizard(),
  createProps(),
]);
const keyboard = createKeyboard();

// The waterfall is drawn in code and loads nothing, so it is built here rather
// than awaited with the rest. The lines it shows are the room's bug's, as
// bug-quest.md's manifest gives them; a clean room is handed none and the
// water hides the renderer's own fictional chatter alone.
const waterfallView = createWaterfall(roomBug?.logs ?? []);

// The waterfall stands behind everything else on the actor layer — its water
// is near opaque, and a wizard swept into the column has to stay in sight.
// Then the props behind the wizard, and the creature's eyes in front of him
// (rendering-and-look.md, layer stack): carried, they ride on the hat, which
// is inside the wizard's own cell, so eyes behind him would be painted over.
scene.actors.addChild(waterfallView.view, propsView.view, wizardView.view, propsView.eyes);
scene.lights.addChild(wizardView.light);

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
  publish('uiCard', card.says());
  publish('uiCardText', card.report());
  publish('uiTitleText', title.report());
}

/** What the player knows on this frame (bug-quest.md, the ticket card). */
function cardFacts(): CardFacts {
  return {
    bug: CARD_BUG,
    felt: world.creature?.firstCarried ?? false,
    logsRead: logsRead(world),
  };
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
let debugHud = false;
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

  // A getter, so a test that steps the clock reads the frame of the tick it
  // has just run without waiting for one to be drawn. It answers the same
  // frame the loop below draws: both ask the renderer the same question of
  // the same state.
  get debug(): WizardFrame {
    return wizardView.read(world.player);
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
    debugHud = !debugHud;
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

  // The card is read after the ticks of this frame, so what it says is what
  // the world says now: it comes up by itself as soon as the player has felt
  // the bug or read the logs, and T is the way back to it and the way out
  // through it (bug-quest.md, the ticket card).
  if (started) {
    const facts = cardFacts();

    if (edges.ticket) {
      card.press(facts, world.tick);
    }

    card.update(facts, world.tick);
  }

  title.view.visible = !started;
  hud.view.visible = started;
  hud.update(world, debugHud);
  banner.update(world);

  scene.watch(world, debugHud);
  waterfallView.update(world, scene.camera);
  propsView.update(world, wizardView.update(world.player, scene.camera), scene.camera);
  scene.render();
  publish('wizard', wizardView.report());
  publish('props', propsView.report());
  publish('waterfall', waterfallView.report());
  publishUi();
}

requestAnimationFrame(frame);
