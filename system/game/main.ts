// The loop. Real time is accumulated and spent in whole 60 Hz ticks, the scene
// is drawn once per frame with no interpolation, and `window.wizard` exposes
// the run to browser tests (docs/plan/02-design/simulation-architecture.md).

import { rooms } from './content/rooms';
import { createAudio } from './render/audio';
import { createHud } from './render/hud';
import { issueBug, issueUrl } from './render/issue';
import { createScene } from './render/scene';
import { createSettings } from './render/settings';
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

/** The room `?room=` falls back to: the first beat, which is the demo. */
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
// The atmosphere pass off, for the one measurement its frame-rate acceptance
// can be held to on a machine with no graphics card: the same run, twice,
// with the pass and without it (tests/smoke/particles.spec.ts). A query
// parameter rather than a build flag, so the measurement is of the very
// bundle that ships.
const atmosphere = new URLSearchParams(window.location.search).get('atmosphere') !== 'off';
const roomText = rooms[roomName];

if (roomText === undefined) {
  throw new Error(`game/content/rooms/ has no ${DEFAULT_ROOM}.ts to fall back to`);
}

// The room's planted bug, or undefined in a clean room. The manifest of the
// branch being built is the one source (ADR-005): it decides whether the room
// has a creature to carry the bug, which lines the waterfall hides, and what
// the ticket card is able to say.
const roomBug = bugForRoom(roomName);

const freshWorld = (): WorldState =>
  createWorld(roomText, { roomName, creature: roomBug !== undefined });

// No load needs anything of the others, so all five chains are in flight at
// once and the wizard's sheets do not wait on the backdrops.
const [scene, wizardView, propsView, title, audio] = await Promise.all([
  createScene(mount, roomName, atmosphere),
  createWizard(),
  createProps(),
  createTitle(),
  createAudio(),
]);

// The props behind the wizard, and the creature in front of him
// (rendering-and-look.md, layer stack): carried, it rides on the hat, which is
// inside the wizard's own cell, so a creature behind him would be painted over.
// The room's waterfall goes behind all of them.
scene.actors.addChild(propsView.view, wizardView.view, propsView.creature);
scene.lights.addChild(wizardView.light);

/** The manifest's entry as the card takes it, settled once with the room. */
const CARD_BUG = cardBug(roomBug);

/** The entry as the prefilled issue takes it, with the defect's file dropped. */
const ISSUE_BUG = issueBug(roomBug);

// The water that hides this beat's log lines. It is drawn in code and loads
// nothing, so it is built here rather than awaited with the art, and it goes
// behind everything else on the actor layer: its water is near opaque, and a
// wizard swept into the column has to stay in sight.
const waterfallView = createWaterfall(roomBug?.logs ?? []);

scene.actors.addChildAt(waterfallView.view, 0);

// The one setting there is. The toggle is pressed, and that press is also the
// gesture the browser wants before anything may be heard, so the two halves of
// the music's rule can never disagree. What the last visit asked for is
// applied here and still waits for a gesture.
const settings = createSettings(audio.setMusic, window.localStorage);

audio.setMusic(settings.music());

const hud = createHud();
const banner = createBanner();
// The way out of the card: the prefilled issue, opened from the pointer press
// panel.ts binds and from the keydown the keyboard hands on below (ADR-006).
// A clean room never reaches the face that offers it; the null is what tells
// the compiler so.
const card = createTicketCard(() => {
  if (ISSUE_BUG !== null) {
    window.open(issueUrl(ISSUE_BUG, world), '_blank', 'noopener');
  }
});

const keyboard = createKeyboard({
  // T puts the card up, and raises the ticket when the card already offers
  // that. Before the run starts the title screen has the keyboard.
  ticket(): void {
    if (started) {
      card.press(cardFacts(), world.tick);
    }
  },
});

scene.ui.addChild(title.view, hud.view, card.view, banner.view, settings.view);

function layout(): void {
  const { innerWidth, innerHeight } = window;

  title.layout(innerWidth, innerHeight);
  hud.layout(innerWidth, innerHeight);
  card.layout(innerWidth, innerHeight);
  banner.layout(innerWidth, innerHeight);
  settings.layout(innerWidth, innerHeight);
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
  publish('uiMusic', settings.report());
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
      // Inside the loop, for the same reason the draw loop below plays its
      // catch-up ticks' sounds inside its own: a sound belongs to the tick
      // that emitted it, and `events` is cleared at the top of the next one.
      // Without this the documented automation surface (AGENTS.md rule 8)
      // would advance the simulation silently, and a browser test could only
      // reach the audio by racing the frame loop with a held key.
      audio.update(world);
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
      // Inside the loop, not after it: a frame that owes three ticks clears
      // `events` three times, and a sound belongs to the tick that emitted it.
      audio.update(world);
      pending -= DT;
    }
  }

  // The card is read after the ticks of this frame, so what it says is what
  // the world says now: it comes up by itself as soon as the player has felt
  // the bug or read the logs (bug-quest.md, the ticket card). T is the other
  // way to it, and is answered in the press above, not here.
  if (started) {
    card.update(cardFacts(), world.tick);
  }

  title.view.visible = !started;
  hud.view.visible = started;
  hud.update(world, debugHud);
  banner.update(world);

  // The wand's crystal, read before the scene is moved: `read` asks the
  // player state and the sprite manifest and no camera, so it answers here as
  // well as after the follow. The atmosphere pass hangs its motes on the very
  // point the glow hangs on rather than working out a second one
  // (AGENTS.md rule 9).
  scene.watch(world, debugHud, wizardView.read(world.player).light);
  waterfallView.update(world, scene.camera);
  // The loops, once the camera has moved: what is in sight is a fact about the
  // frame, not about each of the ticks it spent.
  audio.watch(world, scene.camera);
  propsView.update(world, wizardView.update(world.player, scene.camera), scene.camera);
  scene.render();
  publish('wizard', wizardView.report());
  publish('props', propsView.report());
  publish('waterfall', waterfallView.report());
  publish('audio', audio.report());
  publishUi();
}

requestAnimationFrame(frame);
