// The loop. Real time is accumulated and spent in whole 60 Hz ticks, the scene
// is drawn once per frame with no interpolation, and `window.wizard` exposes
// the run to browser tests (docs/plan/02-design/simulation-architecture.md).

import { LEVEL } from './content/order';
import { rooms } from './content/rooms';
import { createHud } from './render/hud';
import { issueBug, issueUrl, type IssueBug } from './render/issue';
import { createScene } from './render/scene';
import { createKeyboard } from './render/input';
import { createBanner } from './render/panel';
import { createProps } from './render/props';
import { cardBug, createTicketCard, type CardBug, type CardFacts } from './render/ticket';
import { createTitle, startsRun } from './render/title';
import { createWaterfall, logsRead, type WaterfallView } from './render/waterfall';
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

/**
 * The room `?room=` falls back to: the first room of the level, taken from the
 * order table rather than spelled again here, so a table whose first entry
 * changes moves the boot with it (AGENTS.md rule 9).
 */
const firstRoom = LEVEL[0];

if (firstRoom === undefined) {
  throw new Error('game/content/order.ts lists no rooms for the run to start in');
}

const DEFAULT_ROOM = firstRoom.name;

/**
 * The longest stretch of real time one frame may spend. A tab that was in the
 * background for a minute resumes the run, it does not fast-forward it.
 */
const MAX_CATCH_UP_SECONDS = 0.25;

/** The automation surface (simulation-architecture.md, AGENTS.md rule 8). */
export interface Wizard {
  /** Leave the title screen. */
  start(): void;
  /** Restart the run, from the first room of its level. */
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

// The boot with no `?room=` plays the level of game/content/order.ts, so its
// beacons hand the run on from room to room; a room asked for by name is a
// level of that room alone, whose beacon ends the run
// (docs/plan/02-design/level-design.md).
const level = wanted === null ? LEVEL : [{ name: roomName, text: roomText }];

/** Every room this run can walk into, the first one first. */
const reachable = level.map((room) => room.name);

const freshWorld = (): WorldState =>
  createWorld(roomText, { roomName, level, creature: bugForRoom(roomName) !== undefined });

// No load needs anything of the others, so all three chains are in flight at
// once and the wizard's sheets do not wait on the backdrops.
const [scene, wizardView, propsView] = await Promise.all([
  createScene(mount, reachable),
  createWizard(),
  createProps(),
]);

// The props behind the wizard, and the creature's eyes in front of him
// (rendering-and-look.md, layer stack): carried, they ride on the hat, which
// is inside the wizard's own cell, so eyes behind him would be painted over.
// A room's waterfall goes behind all of them as the room is entered.
scene.actors.addChild(propsView.view, wizardView.view, propsView.eyes);
scene.lights.addChild(wizardView.light);

/** What one room's planted bug gives the screen (ADR-005, bug-quest.md). */
interface Stage {
  /** The room this was built for. */
  room: string;
  /** The manifest's entry as the card takes it, or null in a clean room. */
  card: CardBug | null;
  /** The entry as the prefilled issue takes it, with the defect's file dropped. */
  issue: IssueBug | null;
  /** The water that hides this beat's log lines. */
  waterfall: WaterfallView;
}

/**
 * Take the stage of the room the run has walked into. The manifest of the
 * branch being built is the one source: it decides which lines the waterfall
 * hides and what the ticket card is able to say, and a chained run asks it
 * again of every room.
 *
 * The waterfall is drawn in code and loads nothing, so a room's own is built
 * on the way in rather than awaited with the art. It goes behind everything
 * else on the actor layer — its water is near opaque, and a wizard swept into
 * the column has to stay in sight.
 */
function enterStage(room: string): Stage {
  const bug = bugForRoom(room);
  const entered: Stage = {
    room,
    card: cardBug(bug),
    issue: issueBug(bug),
    waterfall: createWaterfall(bug?.logs ?? []),
  };

  scene.actors.addChildAt(entered.waterfall.view, 0);

  return entered;
}

let stage = enterStage(roomName);

const title = createTitle();
const hud = createHud();
const banner = createBanner();
// The way out of the card: the prefilled issue, opened from the pointer press
// panel.ts binds and from the keydown the keyboard hands on below (ADR-006).
// A clean room never reaches the face that offers it; the null is what tells
// the compiler so.
const card = createTicketCard(() => {
  const bug = stage.issue;

  if (bug !== null) {
    window.open(issueUrl(bug, world), '_blank', 'noopener');
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
    bug: stage.card,
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

  // A run that has walked into another room leaves behind everything the
  // render layer was holding for the room it left — its water, the sprites of
  // its props and its ticket card — and takes the new room's, before anything
  // this frame is drawn or said.
  if (stage.room !== world.roomName) {
    scene.actors.removeChild(stage.waterfall.view);
    // Nothing else holds the water of the room just left, so it goes for
    // good rather than being orphaned for the rest of the run.
    stage.waterfall.view.destroy({ children: true });
    // The prop sprites are cached by prop id and the new room numbers its own
    // from zero, so the cache is dropped rather than drawn over: the glade's
    // bush and the ruin gate's waterfall are both id 1, and a kind with no
    // strip is skipped, which would leave the bush hanging at its glade
    // position inside the ruin gate.
    propsView.clear();
    // The card speaks for the room it was raised in: its faces are chosen
    // from that room's manifest entry, that room's parted water and that
    // room's creature (ticket-card.md). In a room just entered the player has
    // felt nothing and read nothing, so the `card.update` below says nothing
    // and would leave the previous room's words up, with its Raise ticket
    // button now wired to the new room's issue.
    card.hide();
    stage = enterStage(world.roomName);
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

  scene.watch(world, debugHud);
  stage.waterfall.update(world, scene.camera);
  propsView.update(world, wizardView.update(world.player, scene.camera), scene.camera);
  scene.render();
  publish('wizard', wizardView.report());
  publish('props', propsView.report());
  publish('waterfall', stage.waterfall.report());
  publishUi();
}

requestAnimationFrame(frame);
