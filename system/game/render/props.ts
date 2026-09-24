// The props on screen, and the creature's two eyes
// (docs/plan/02-design/rendering-and-look.md, Sprites;
// docs/plan/02-design/bug-quest.md, the creature). Which cell of a prop's
// strip is shown is a pure function of the prop's own `hitTick`, its `active`
// flag and the tick the world stands on — never of wall time — so a replay
// draws the same frames twice, the way the wizard does.
//
// Every strip opens with the prop at rest and holds the frames asset-list.md
// gives it: the bush and the log rustle on their last two, the rock cracks
// through its four and stays open, the flag and the beacon play a one-shot
// and settle into the two frames they loop on. A kind the manifest has no
// strip for is simply not drawn — the waterfall, which HWP-025 draws in code,
// and the lantern and mushrooms nobody has generated yet.

import { Container, Graphics, Sprite } from 'pixi.js';

import { PROP_SIZE, type Prop, type PropKind, type Vec2, type WorldState } from '../sim';

import { wholePixels, type Camera } from './camera';
import {
  CREATURE_BLINK,
  CREATURE_EYES,
  PROP_FPS,
  PROP_RUSTLE_TICKS,
  PROP_SHAKE,
  SPRITE_FOOT_OFFSET,
} from './config';
import { cycle, framesIn, loadManifest, loadStrip, type Strip } from './sprites';
import type { WizardFrame } from './wizard';

/** Every prop kind there is, as the simulation's own table names them. */
const KINDS = Object.keys(PROP_SIZE) as PropKind[];

/** The frame every animated prop's strip opens with: the prop at rest. */
const IDLE = 0;

/** The first frame of the animation, just after the idle one. */
const FIRST = IDLE + 1;

/** Frames at the end of a flag's and a beacon's strip that it loops on. */
const LOOPED = 2;

/**
 * The cell a prop that has been set off shows: the frames after the idle one
 * played once, and then the last `looped` of them over and over. A rock's
 * tail is its one open frame, so it cracks through the rest and stays there.
 *
 * The one-shot is timed off `hitTick` because that is the only clock a prop
 * carries, and `stampProps` in game/sim/charge-hit.ts re-stamps it on every
 * prop the charge tip overlaps, with no `active` check. Charge-hitting an
 * already-open rock, an already-raised flag or a lit beacon therefore replays
 * its one-shot — the rock visibly re-cracks, and the rock is the one the glade
 * puts on the path. Telling the two apart needs an `activeSince` on the prop,
 * which is a change to game/sim/ and so belongs to a sim ticket, not here.
 */
function oneShot(prop: Prop, tick: number, count: number, looped: number): number {
  if (!prop.active) {
    return IDLE;
  }

  const loop = count - looped;
  const at = FIRST + framesIn(tick - prop.hitTick, PROP_FPS);

  return at < loop ? at : loop + ((at - loop) % looped);
}

/**
 * The cell one prop shows. `count` is how many its strip holds, as the
 * manifest recorded it, so no frame count is written down here as well
 * (AGENTS.md rule 9); which of them mean what is asset-list.md's props table.
 */
export function propFrame(prop: Prop, tick: number, count: number): number {
  const since = tick - prop.hitTick;

  switch (prop.kind) {
    case 'bush':
    case 'log':
      // Rustles or chatters for 24 ticks after a charge hit, then goes still.
      return prop.hitTick >= 0 && since < PROP_RUSTLE_TICKS
        ? cycle(since, PROP_FPS, count, FIRST)
        : IDLE;

    case 'rock':
      // Cracks a frame at a time and stays open. The sim latches `active` on
      // the tick of the hit and never clears it.
      return oneShot(prop, tick, count, 1);

    case 'flag':
    case 'beacon':
      // Raises or lights, then waves or burns for the rest of the run.
      return oneShot(prop, tick, count, LOOPED);

    default:
      // Torch, lantern and mushrooms: whatever their strip holds, looping.
      return cycle(tick, PROP_FPS, count);
  }
}

/**
 * How far a hit knocks a prop sideways this tick: a unit each way for four
 * ticks, which is two pixels at the density the world is drawn at (ADR-003).
 */
export function propShake(prop: Prop, tick: number): number {
  const since = tick - prop.hitTick;

  if (prop.hitTick < 0 || since >= PROP_SHAKE.ticks) {
    return 0;
  }

  return since % 2 === 0 ? PROP_SHAKE.units : -PROP_SHAKE.units;
}

/**
 * Where the creature's eyes are, in world units, or null when it shows none.
 * It rides the wizard's hat while carried, blinks at the prop it hides in
 * otherwise, and is not drawn at all while it runs between the two
 * (bug-quest.md, the creature).
 */
export function eyesAt(state: WorldState, wizard: WizardFrame): Vec2 | null {
  const creature = state.creature;

  if (creature === null) {
    return null;
  }

  if (creature.carriedSince >= 0) {
    return { x: wizard.cell.x + wizard.cell.w / 2, y: wizard.cell.y + CREATURE_EYES.hat };
  }

  // `at` is -1 while it travels, and reads as no prop at all.
  const hiding = state.props[creature.at];

  if (hiding === undefined) {
    return null;
  }

  // The shake moves the prop's own sprite, so the eyes take it too: a
  // charge-hit bush would otherwise rustle out from under its eyes for four
  // ticks while they sat still in its untouched middle.
  return {
    x: hiding.x + hiding.w / 2 + propShake(hiding, state.tick),
    y: hiding.y + hiding.h / 2,
  };
}

/** Where the eyes were drawn, in view units, or why they were not drawn. */
function eyeReport(at: Vec2 | null, open: boolean, camera: Camera): string {
  if (at === null) {
    return 'none';
  }

  return open ? `${at.x - camera.x},${at.y - camera.y}` : 'shut';
}

/**
 * Are the eyes open on this tick? They shut briefly, on the run's own clock.
 * The blink is phased to the end of each period rather than the start, so tick
 * 0 is an open one: the acceptance asks for a screenshot of the eyes at the
 * bush at the start of a run, and an unphased blink would make that the one
 * frame of the whole period with no eyes in it.
 */
export function eyesOpen(tick: number): boolean {
  return (tick + CREATURE_BLINK.shut) % CREATURE_BLINK.period >= CREATURE_BLINK.shut;
}

/** The two red eyes, drawn in code: squares at the ends of their patch. */
function createEyes(): Graphics {
  const { patch, eye, colour } = CREATURE_EYES;
  const eyes = new Graphics();

  // Drawn around their own middle, so the point they are put at is the middle
  // of the hiding place or of the hat.
  eyes.rect(-patch / 2, -eye / 2, eye, eye).fill(colour);
  eyes.rect(patch / 2 - eye, -eye / 2, eye, eye).fill(colour);

  return eyes;
}

/** The props of a room, and the creature hiding among them. */
export interface PropsView {
  /** One node for the props of the room, drawn behind the wizard. */
  readonly view: Container;
  /**
   * The creature's two eyes, on a node of their own so the caller can hang
   * them in front of the wizard. rendering-and-look.md's layer stack puts the
   * props, the eyes and the player on one layer and says nothing of their
   * order inside it, but bug-quest.md has the eyes ride on the hat while the
   * creature is carried — and the hat is inside the wizard's own cell, so eyes
   * drawn with the props would be painted over by it and never seen.
   */
  readonly eyes: Container;
  /** Draw every prop of this world, and the eyes wherever they belong. */
  update(state: WorldState, wizard: WizardFrame, camera: Camera): void;
  /** What was drawn: each prop's cell and shake, and where the eyes stand. */
  report(): string;
}

/** Load every prop strip the manifest holds and hand back the node they draw on. */
export async function createProps(): Promise<PropsView> {
  const manifest = await loadManifest();
  const strips = new Map<PropKind, Strip>();

  await Promise.all(
    KINDS.map(async (kind) => {
      const name = `props/${kind}`;

      if (manifest[name] !== undefined) {
        strips.set(kind, await loadStrip(manifest, name));
      }
    }),
  );

  const view = new Container();
  const eyes = createEyes();

  /** One sprite per prop, by its id. A room's props stand still for the run. */
  const sprites = new Map<number, Sprite>();

  function spriteFor(prop: Prop, strip: Strip): Sprite {
    const known = sprites.get(prop.id);

    if (known !== undefined) {
      return known;
    }

    const sprite = new Sprite();

    sprite.scale.set(1 / strip.density);
    sprites.set(prop.id, sprite);
    view.addChild(sprite);

    return sprite;
  }

  let shown = '';

  return {
    view,
    eyes,

    update(state: WorldState, wizard: WizardFrame, camera: Camera): void {
      const fields: string[] = [];

      for (const prop of state.props) {
        const strip = strips.get(prop.kind);

        if (strip === undefined) {
          continue;
        }

        const frame = propFrame(prop, state.tick, strip.frames.length);
        const texture = strip.frames[frame];

        // The same refusal game/render/wizard.ts makes: a frame the strip does
        // not hold would otherwise leave the last one on screen, and a prop
        // that quietly stopped animating is a picture rather than a failure.
        if (texture === undefined) {
          throw new Error(
            `the ${prop.kind} strip of ${strip.frames.length} frames has no frame ${frame}`,
          );
        }

        const shake = propShake(prop, state.tick);
        const sprite = spriteFor(prop, strip);

        sprite.texture = texture;
        // Props stand on the render texture's whole pixels, the way the camera
        // and the wizard do, two units below their collision line.
        sprite.position.set(wholePixels(prop.x + shake), wholePixels(prop.y + SPRITE_FOOT_OFFSET));

        fields.push(`${prop.kind}:${prop.id}=${frame},${shake}`);
      }

      const at = eyesAt(state, wizard);
      const open = at !== null && eyesOpen(state.tick);

      eyes.visible = open;

      if (at !== null) {
        eyes.position.set(wholePixels(at.x), wholePixels(at.y));
      }

      shown = `${fields.join(' ')} eyes=${eyeReport(at, open, camera)}`;
    },

    report(): string {
      return shown;
    },
  };
}
