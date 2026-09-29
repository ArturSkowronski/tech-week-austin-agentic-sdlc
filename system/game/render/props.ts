// The props on screen, and the creature among them
// (docs/plan/02-design/rendering-and-look.md, Sprites;
// docs/plan/02-design/bug-quest.md, the creature). What the creature itself
// looks like — its eyes, its wisp and the glitch aura that throws its hiding
// place about — is game/render/creature.ts's; this layer only says where it
// stands. Which cell of a prop's strip is shown is a pure function of the
// prop's own `hitTick`, its `active` flag and the tick the world stands on —
// never of wall time — so a replay draws the same frames twice, the way the
// wizard does.
//
// Every strip opens with the prop at rest and holds the frames asset-list.md
// gives it: the bush and the log rustle on their last two, the rock cracks
// through its four and stays open, the flag and the beacon play a one-shot
// and settle into the two frames they loop on. A kind the manifest has no
// strip for is simply not drawn — the waterfall, which HWP-025 draws in code,
// and the lantern and mushrooms nobody has generated yet.

import { Container, Sprite } from 'pixi.js';

import { PROP_SIZE, type Prop, type PropKind, type Vec2, type WorldState } from '../sim';

import { wholePixels, type Camera } from './camera';
import {
  CREATURE_EYES,
  PROP_FPS,
  PROP_RUSTLE_TICKS,
  PROP_SHAKE,
  SPRITE_FOOT_OFFSET,
} from './config';
import { auraAt, CALM, createCreatureMark } from './creature';
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
 * Where the creature stands, in world units, or null when it shows nothing.
 * It rides the wizard's hat while carried, sits in the prop it hides in
 * otherwise, and is not drawn at all while it runs between the two
 * (bug-quest.md, the creature).
 *
 * The glitch aura is left out of this on purpose: HWP-061 throws the hiding
 * place's *sprite* about, and a creature that went with it would only be
 * jittering in place. The prop tears around it; the creature is what it tears
 * around.
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

/**
 * Where the creature was drawn, in view units, or `none` when it showed
 * nothing. Which of its two forms stood there, and how hard its aura pulled,
 * are game/render/creature.ts's own to report.
 */
function eyeReport(at: Vec2 | null, camera: Camera): string {
  return at === null ? 'none' : `${at.x - camera.x},${at.y - camera.y}`;
}

/** The props of a room, and the creature hiding among them. */
export interface PropsView {
  /** One node for the props of the room, drawn behind the wizard. */
  readonly view: Container;
  /**
   * The creature, on a node of its own so the caller can hang it in front of
   * the wizard. rendering-and-look.md's layer stack puts the props, the
   * creature and the player on one layer and says nothing of their order
   * inside it, but bug-quest.md has the creature ride on the hat while it is
   * carried — and the hat is inside the wizard's own cell, so a creature drawn
   * with the props would be painted over by it and never seen.
   */
  readonly creature: Container;
  /** Draw every prop of this world, and the creature wherever it belongs. */
  update(state: WorldState, wizard: WizardFrame, camera: Camera): void;
  /**
   * What was drawn: each prop's cell and shake, and where the creature stands
   * and what game/render/creature.ts made of it.
   */
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
  const creature = createCreatureMark();

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
    creature: creature.view,

    update(state: WorldState, wizard: WizardFrame, camera: Camera): void {
      const fields: string[] = [];
      /** The aura of the hiding place, kept for the creature's own report. */
      let glitch = CALM;

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
        // The glitch aura throws the hiding place's own sprite off its place
        // as the wizard closes on it (HWP-061). Every other prop is handed the
        // one calm back, so the prop that is not is the creature's own.
        const aura = auraAt(state, prop);
        const sprite = spriteFor(prop, strip);

        if (aura !== CALM) {
          glitch = aura;
        }

        sprite.texture = texture;
        // Props stand on the render texture's whole pixels, the way the camera
        // and the wizard do, two units below their collision line.
        sprite.position.set(
          wholePixels(prop.x + shake + aura.x),
          wholePixels(prop.y + SPRITE_FOOT_OFFSET + aura.y),
        );

        fields.push(`${prop.kind}:${prop.id}=${frame},${shake}`);
      }

      const at = eyesAt(state, wizard);

      creature.update(state, glitch);
      creature.view.visible = at !== null;

      if (at !== null) {
        creature.view.position.set(wholePixels(at.x), wholePixels(at.y));
      }

      shown = `${fields.join(' ')} eyes=${eyeReport(at, camera)} ${creature.report()}`;
    },

    report(): string {
      return shown;
    },
  };
}
