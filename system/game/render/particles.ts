// The atmosphere pass (docs/plan/tickets/HWP-060.md;
// docs/plan/02-design/rendering-and-look.md, Dusk): four fields of specks
// drawn in code — fireflies out among the trunks, motes turning in the wand's
// light, spores coming off the bushes, and mist lying along the floor line and
// over the water.
//
// Every position is a pure function of the tick and of a seed taken from the
// room's name. Nothing here reads wall time or `Math.random`, and no field
// keeps a speck from one frame to the next: the whole of a field is worked out
// again from the tick it is asked for, so identical ticks draw identical
// particles and a replay replays. The simulation's `nextRandom` is no use for
// the reason it is none to game/render/tiles.ts — it advances a seed the run
// owns, and the renderer may draw the same tick any number of times.
//
// The walks the fields are laid out along are the waterfall's: `spread` for
// the fraction that says where a speck stands along its lane, and `fallen`
// for how far it has come by this tick. They are general, they are already
// written, and the water falls by them. Every other fraction a speck owns
// comes out of `own` below instead, for the reason written there.

import { Container, Graphics } from 'pixi.js';

import { TILE, type Prop, type Room, type Vec2, type WorldState } from '../sim';

import { floorLine, wholePixels } from './camera';
import { FIREFLIES, MIST_BANDS, MOTES, SPORES, VIEW_W } from './config';
import { fallen, spread } from './waterfall';

/** One speck of a field: a rectangle in the field's own units, and its alpha. */
export interface Speck {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly alpha: number;
}

/**
 * A fraction of one speck's own, unrelated to where the speck stands.
 *
 * A field needs several fractions for one index — how far across its band it
 * lies, how fast it goes, where in its glow it stands — and unless those are
 * unrelated the field comes out as a line rather than a scatter. {@link
 * spread} cannot give them: `spread(i, s + k)` is `spread(i, s) + k` for
 * every `i`, so a second walk of it is only the first one slid along, and a
 * field laid out from both draws a diagonal that shears but never breaks up.
 * This mixes the index, the room's seed and a salt instead — the shape
 * game/render/tiles.ts already scatters its detail with — so `own(i, s, 1)`,
 * `own(i, s, 2)` and `spread(i, s)` have nothing to do with one another.
 *
 * Exported because game/render/creature.ts scatters the glitch aura's throw
 * with it too, and one scatter deserves one source (AGENTS.md rule 9).
 */
export function own(index: number, seed: number, salt: number): number {
  // The seed is a fraction, and a field that salts it per prop hands one in
  // past 1, so the whole part goes before the rest is taken up to an integer.
  let hash = Math.imul(index + 1, 0x27d4_eb2d) ^ Math.imul(salt + 1, 0x1656_67b1);

  hash = Math.imul(hash ^ Math.round((seed % 1) * 0x1_0000_0000), 0x0100_0193);
  hash = Math.imul(hash ^ (hash >>> 15), 0x2545_f491);

  return ((hash ^ (hash >>> 16)) >>> 0) / 0x1_0000_0000;
}

/** The salts of {@link own}: one for each fraction a speck owns. */
const LANE = 1;
const RATE = 2;
const GLOW = 3;
const START = 4;

/** A rate inside the range a field is given, at this fraction of it. */
function rateOf(bounds: { min: number; max: number }, share: number): number {
  return bounds.min + share * (bounds.max - bounds.min);
}

/** `value` brought back inside `[0, cycle)`, however far outside it lies. */
function wrap(value: number, cycle: number): number {
  return ((value % cycle) + cycle) % cycle;
}

/**
 * The fraction a room's fields are laid out from. `WorldState` carries no
 * per-room seed, so the room's own name is mixed into one: every room gets an
 * arrangement of its own, and the same room always gets the same one.
 */
export function roomSeed(name: string): number {
  let hash = 0x811c_9dc5;

  // Over code points rather than UTF-16 units, the way every other length in
  // this repository is counted: indexing by unit would mix an astral
  // character in twice, once whole and once as its own trail surrogate.
  for (const character of name) {
    hash = Math.imul(hash ^ (character.codePointAt(0) ?? 0), 0x0100_0193);
  }

  return (hash >>> 0) / 0x1_0000_0000;
}

/** `count` specks, each worked out from its own index. */
function field(count: number, speck: (index: number) => Speck): Speck[] {
  return Array.from({ length: count }, (_, index) => speck(index));
}

/** A wave in [0, 1] of this many ticks, at this point of its own cycle. */
function wave(tick: number, period: number, phase: number): number {
  return (Math.sin(2 * Math.PI * (tick / period + phase)) + 1) / 2;
}

/**
 * How much of its alpha a speck keeps this far along the stretch it wraps
 * around: out at the two ends and full in the middle, so a speck that reaches
 * the end of its walk and begins again does it while it cannot be seen.
 */
function fade(share: number): number {
  return Math.sin(Math.PI * share);
}

/**
 * The fireflies, in view units. They drift across the band the trunks stand
 * in, bobbing as they go and glowing in and out each on its own phase, so no
 * two blink together. The band is the view's own rather than the world's: they
 * are drawn among the backdrops, which are laid out in view units and placed
 * by parallax, and a speck of one unit out at that depth has no position in
 * the room to keep.
 *
 * `travelled` is how far the trunks they stand among have gone sideways under
 * the camera (game/render/scene.ts). It is folded into the band's own wrap
 * rather than added to the layer's position, because the field is one view
 * wide and does not tile: moving the layer would drag the whole band off one
 * edge and leave the other empty, where wrapping simply carries the specks
 * that leave one edge back in at the other.
 */
export function fireflies(tick: number, seed: number, travelled = 0): Speck[] {
  return field(FIREFLIES.count, (index) => {
    const lane = own(index, seed, LANE);
    const glow = own(index, seed, GLOW);
    const drift = rateOf(FIREFLIES.drift, own(index, seed, RATE));
    const x = wrap(fallen(tick, drift, spread(index, seed), VIEW_W) - travelled, VIEW_W);

    return {
      x,
      y:
        FIREFLIES.top +
        lane * FIREFLIES.band +
        wave(tick, FIREFLIES.bobTicks, own(index, seed, START)) * FIREFLIES.bob,
      w: FIREFLIES.size,
      h: FIREFLIES.size,
      alpha: FIREFLIES.alpha * fade(x / VIEW_W) * wave(tick, FIREFLIES.glowTicks, glow),
    };
  });
}

/**
 * The motes, in units around the light itself. Each turns on its own slow
 * circle at its own distance inside the glow's reach, flattened so the ring
 * lies in the air rather than standing up in it.
 */
export function motes(tick: number, seed: number): Speck[] {
  return field(MOTES.count, (index) => {
    // Its own turn, not the field's: one period for all of them would hold
    // whatever shape they start in and merely rotate it.
    const turn = rateOf(MOTES.turnTicks, own(index, seed, RATE));
    const angle = 2 * Math.PI * (spread(index, seed) + tick / turn);
    const radius = MOTES.radius * (MOTES.inner + (1 - MOTES.inner) * own(index, seed, LANE));

    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius * MOTES.flatten,
      w: MOTES.size,
      h: MOTES.size,
      alpha: MOTES.alpha * wave(tick, MOTES.glowTicks, own(index, seed, GLOW)),
    };
  });
}

/**
 * The spores, in world units. Each climbs out of the bush it came off,
 * swaying and fading as it rises, and starts again at the leaves when it
 * reaches the top of its climb.
 */
export function spores(tick: number, seed: number, bushes: readonly Prop[]): Speck[] {
  return bushes.flatMap((bush) => {
    // Every bush has its own arrangement, so its id joins the room's seed; as
    // a fraction, because `spread` drops a whole number before it walks.
    const of = seed + spread(bush.id);

    return field(SPORES.count, (index) => {
      const climb = fallen(tick, SPORES.speed, own(index, of, START), SPORES.rise);

      return {
        x:
          bush.x +
          spread(index, of) * bush.w +
          (wave(tick, SPORES.swayTicks, own(index, of, GLOW)) - 0.5) * SPORES.sway,
        y: bush.y - climb,
        w: SPORES.size,
        h: SPORES.size,
        // Faded at both ends of the climb, as the fireflies and the mist are
        // at both ends of theirs: a spore that reached the top and began
        // again at the leaves would otherwise pop in at its brightest.
        alpha: SPORES.alpha * fade(climb / SPORES.rise),
      };
    });
  });
}

/**
 * One run of mist along a stretch this wide, in world units: bands lying at
 * different heights above the line, each drifting along it at its own rate.
 */
function bands(tick: number, seed: number, left: number, width: number, line: number): Speck[] {
  return field(Math.max(2, Math.round(width / MIST_BANDS.spacing)), (index) => {
    const drift = rateOf(MIST_BANDS.drift, own(index, seed, RATE));
    const along = fallen(tick, drift, spread(index, seed), width);

    return {
      x: left + along - MIST_BANDS.width / 2,
      y: line - own(index, seed, LANE) * MIST_BANDS.lift - MIST_BANDS.height,
      w: MIST_BANDS.width,
      h: MIST_BANDS.height,
      alpha: MIST_BANDS.alpha * fade(along / width),
    };
  });
}

/**
 * The mist, in world units: a run along the room's own floor line, and one
 * more over the lip of every water column, which is where the air is wettest.
 * The waterfall draws the mist at its base itself (rendering-and-look.md).
 */
export function mist(tick: number, seed: number, room: Room, water: readonly Prop[]): Speck[] {
  return [
    ...bands(tick, seed, 0, room.width * TILE, floorLine(room)),
    ...water.flatMap((column) =>
      bands(tick, seed + spread(column.id), column.x, column.w, column.y),
    ),
  ];
}

/** The fields of the pass, each in the units of the layer it is drawn on. */
export interface Pass {
  readonly fireflies: readonly Speck[];
  readonly motes: readonly Speck[];
  readonly spores: readonly Speck[];
  readonly mist: readonly Speck[];
}

/** The pass with every field emptied, for the run that draws none of it. */
const NOTHING: Pass = { fireflies: [], motes: [], spores: [], mist: [] };

/**
 * The whole atmosphere pass for the world as it stands on this tick. It is a
 * function of the state and nothing else, so a test can count it and compare
 * two runs of it without a renderer to draw it with.
 */
export function pass(state: WorldState, travelled = 0): Pass {
  const seed = roomSeed(state.roomName);

  return {
    fireflies: fireflies(state.tick, seed, travelled),
    motes: motes(state.tick, seed),
    spores: spores(state.tick, seed, state.props.filter((prop) => prop.kind === 'bush')),
    mist: mist(
      state.tick,
      seed,
      state.room,
      state.props.filter((prop) => prop.kind === 'waterfall'),
    ),
  };
}

/** The four fields, each on the layer of the stack it belongs to. */
export interface Particles {
  /** The fireflies, in view units, for in among the tall forest's trunks. */
  readonly forest: Container;
  /** The motes, for the additive light layer; moved to the crystal each frame. */
  readonly light: Container;
  /** The spores and the mist, in world units, for the camera-moved stack. */
  readonly air: Container;
  /**
   * Draw every field for this world: the motes at the wand's `crystal`, and
   * the fireflies carried by however far `trunks` says the tall forest has
   * travelled under the camera.
   */
  update(state: WorldState, crystal: Vec2, trunks: Vec2): void;
  /** How many specks each field drew, for a browser test to read. */
  report(): string;
}

/** Draw a field on its own layer, on the whole pixels of the texture. */
function draw(layer: Graphics, specks: readonly Speck[], colour: number): void {
  layer.clear();

  for (const speck of specks) {
    layer
      .rect(wholePixels(speck.x), wholePixels(speck.y), speck.w, speck.h)
      .fill({ color: colour, alpha: speck.alpha });
  }
}

/**
 * The layers the fields draw on. Nothing is loaded; every field is code.
 *
 * `on` is false for the run `?atmosphere=off` boots (game/main.ts), which
 * draws the whole game but not this pass. It exists for the one measurement
 * the acceptance's frame rate can be held to on a machine with no graphics
 * card: the same run, on the same browser, with the pass and without it —
 * see tests/smoke/particles.spec.ts. Nothing else reads it, and no gameplay
 * turns on it.
 */
export function createParticles(on = true): Particles {
  const forest = new Graphics();
  const glow = new Graphics();
  const spore = new Graphics();
  const band = new Graphics();
  const air = new Container();

  // The one field that is not simply laid over what is under it: the motes are
  // dust in the wand's light, and the light layer is additive (wizard.ts).
  glow.blendMode = 'add';
  air.addChild(band, spore);

  let drawn = '';

  return {
    forest,
    light: glow,
    air,

    update(state: WorldState, crystal: Vec2, trunks: Vec2): void {
      const fields = on ? pass(state, trunks.x) : NOTHING;

      draw(forest, fields.fireflies, FIREFLIES.colour);
      draw(glow, fields.motes, MOTES.colour);
      draw(spore, fields.spores, SPORES.colour);
      draw(band, fields.mist, MIST_BANDS.colour);
      // Where the wand's crystal stands is game/render/wizard.ts's to say: it
      // reads the point out of the sprite manifest for the very cell being
      // drawn, and the glow the motes are dust in hangs on the same point.
      glow.position.set(crystal.x, crystal.y);
      // The fireflies' sideways share of the trunks' travel is already in
      // their own wrap; the upright share has nothing to wrap around, so it
      // moves the layer, exactly as it moves the trunks themselves.
      forest.position.y = wholePixels(-trunks.y);

      drawn = Object.entries(fields)
        .map(([name, specks]) => `${name}=${specks.length}`)
        .join(' ');
    },

    report(): string {
      return drawn;
    },
  };
}
