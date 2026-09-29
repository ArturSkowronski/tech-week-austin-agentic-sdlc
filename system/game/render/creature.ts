// The creature as it is seen (docs/plan/02-design/bug-quest.md, the creature;
// docs/plan/03-assets/asset-list.md, which draws it in code in Season 1): the
// glitch aura that throws its hiding place about as the wizard closes on it,
// the two red eyes blinking out of that hiding place, and the wisp it shows on
// the hat while it rides there.
//
// Every one of them is a pure function of the tick, of the room's own seed and
// of the world it is asked about — never of wall time or `Math.random`, which
// ESLint bans — so a replay draws the same frames twice, the way the props and
// the atmosphere pass do (docs/plan/02-design/rendering-and-look.md).

import { Container, Graphics } from 'pixi.js';

import { PLAYER_HEIGHT, PLAYER_WIDTH, type Prop, type Vec2, type WorldState } from '../sim';

import { wholePixels } from './camera';
import { CREATURE_AURA, CREATURE_BLINK, CREATURE_EYES, CREATURE_WISP } from './config';
import { own, roomSeed } from './particles';
import { spread } from './waterfall';

/** The salts of the aura's two throws: one for each axis (particles.ts). */
const ACROSS = 1;
const DOWN = 2;

/**
 * Are the eyes open on this tick? They shut briefly, on the run's own clock.
 * The blink is phased to the end of each period rather than the start, so tick
 * 0 is an open one: HWP-024's acceptance asks for a screenshot of the eyes at
 * the bush at the start of a run, and an unphased blink would make that the
 * one frame of the whole period with no eyes in it.
 */
export function eyesOpen(tick: number): boolean {
  return (tick + CREATURE_BLINK.shut) % CREATURE_BLINK.period >= CREATURE_BLINK.shut;
}

/**
 * How near the wizard is to a prop, as a share of the aura's reach: nothing at
 * `CREATURE_AURA.reach` units away and beyond, one where he stands on it.
 * Measured centre to centre, the way game/sim/creature.ts measures the
 * distances it picks a hiding place by.
 */
function closeness(state: WorldState, prop: Prop): number {
  const { player } = state;
  const away = Math.hypot(
    player.x + PLAYER_WIDTH / 2 - (prop.x + prop.w / 2),
    player.y + PLAYER_HEIGHT / 2 - (prop.y + prop.h / 2),
  );

  return Math.max(0, 1 - away / CREATURE_AURA.reach);
}

/** How hard the glitch is pulling at a prop this tick, and where it throws it. */
export interface Aura extends Vec2 {
  /** Nothing out at the aura's reach, one when the wizard is on top of it. */
  readonly strength: number;
}

/** No aura at all: every prop but the one the creature is sitting in. */
export const CALM: Aura = { x: 0, y: 0, strength: 0 };

/**
 * The aura of one prop on this tick, in world units. Only the prop the
 * creature is hiding in has one — `at` is -1 while it rides the hat and while
 * it runs between two hiding places, so neither draws a glitch anywhere.
 *
 * The throw is a fresh pair of fractions every tick rather than a wave over
 * them, because the aura is a glitch and not a shiver: two neighbouring ticks
 * have nothing to do with one another. The prop's id joins the room's seed, so
 * two hiding places in one room are never thrown the same way.
 */
export function auraAt(state: WorldState, prop: Prop): Aura {
  if (state.creature?.at !== prop.id) {
    return CALM;
  }

  const strength = closeness(state, prop);
  const seed = roomSeed(state.roomName) + spread(prop.id);
  const thrown = (salt: number): number =>
    (own(state.tick, seed, salt) * 2 - 1) * CREATURE_AURA.units * strength;

  return { x: thrown(ACROSS), y: thrown(DOWN), strength };
}

/** The two red eyes: squares at the ends of their patch, around their middle. */
function drawEyes(into: Graphics): void {
  const { patch, eye, colour } = CREATURE_EYES;

  into.rect(-patch / 2, -eye / 2, eye, eye).fill(colour);
  into.rect(patch / 2 - eye, -eye / 2, eye, eye).fill(colour);
}

/** Where on its circle the wisp stands on this tick, around its middle. */
export function wispAt(tick: number): Vec2 {
  const angle = (2 * Math.PI * tick) / CREATURE_WISP.turnTicks;

  return { x: Math.cos(angle) * CREATURE_WISP.radius, y: Math.sin(angle) * CREATURE_WISP.radius };
}

/**
 * The wisp and the trail behind it: the same circle read at the ticks just
 * gone, each frame fainter than the one in front of it. The trail is the
 * wisp's own path rather than the hat's, so it hangs off the hat in the same
 * shape however fast the wizard is running under it — and it needs no memory
 * of where he was, which a renderer that may draw one tick twice has none of.
 */
function drawWisp(into: Graphics, tick: number): void {
  const { size, colour, trail, fade } = CREATURE_WISP;

  // Faintest first, so the wisp itself is painted over its own trail. Each
  // frame lands on the render texture's whole pixels, as the eyes above
  // already do by standing on whole units: a rect on half a pixel is the one
  // soft edge in a picture drawn nearest-neighbour throughout (ADR-003).
  for (let behind = trail; behind >= 0; behind -= 1) {
    const at = wispAt(tick - behind);

    into
      .rect(wholePixels(at.x - size / 2), wholePixels(at.y - size / 2), size, size)
      .fill({ color: colour, alpha: fade ** behind });
  }
}

/** One number of the report below, at the three decimals it carries. */
function round(value: number): string {
  return value.toFixed(3);
}

/** The creature itself, drawn in code: eyes at a hiding place, a wisp on a hat. */
export interface CreatureMark {
  /**
   * The node it is drawn on, around its own middle, so the caller places it at
   * the point game/render/props.ts says the creature stands on this frame.
   */
  readonly view: Container;
  /**
   * Draw it for this tick, or draw nothing while its eyes are shut. `aura` is
   * the pull on its hiding place, which game/render/props.ts has already
   * thrown that prop's sprite by and which the report below names.
   */
  update(state: WorldState, aura: Aura): void;
  /** Which form was drawn, and the aura of the tick, for a browser test. */
  report(): string;
}

/** The creature's own layer. Nothing is loaded; both forms are drawn in code. */
export function createCreatureMark(): CreatureMark {
  const view = new Graphics();
  let drawn = '';

  return {
    view,

    update(state: WorldState, aura: Aura): void {
      let form = 'shut';

      view.clear();

      if ((state.creature?.carriedSince ?? -1) >= 0) {
        form = 'wisp';
        drawWisp(view, state.tick);
      } else if (eyesOpen(state.tick)) {
        form = 'eyes';
        drawEyes(view);
      }

      drawn = `form=${form} aura=${round(aura.strength)} throw=${round(aura.x)},${round(aura.y)}`;
    },

    report(): string {
      return drawn;
    },
  };
}
