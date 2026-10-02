// The creature: where it shows itself (bug-quest.md, the creature) and what it
// is drawn as once it is there (HWP-061) — the glitch aura that grows as the
// wizard closes on its hiding place, the blink its eyes keep, and the circle
// the wisp turns on while it rides the hat. Every one of them is a pure
// function of the world and the tick, so all of it is asserted here frame by
// frame; putting it on the screen needs a browser and is covered in
// tests/smoke/creature.spec.ts.
//
// Where it stands is game/render/props.ts's `eyesAt`, which is the layer that
// knows where the props are; what it looks like there is creature.ts's.

import { describe, expect, it } from 'vitest';

import {
  CREATURE_AURA,
  CREATURE_BLINK,
  CREATURE_EYES,
  CREATURE_SEAT,
  CREATURE_WISP,
  PROP_SHAKE,
  RENDER_DENSITY,
  SPRITE_FOOT_OFFSET,
} from '../../game/render/config';
import { auraAt, EYE_MARKS, eyesOpen, wispAt } from '../../game/render/creature';
import { eyesAt } from '../../game/render/props';
import type { WizardFrame } from '../../game/render/wizard';
import {
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  type Creature,
  type Prop,
  type WorldState,
} from '../../game/sim';
import { worldFrom } from '../sim/helpers';

/** A glade of one bush, with the wizard standing beside it. */
const GLADE = `
   B
  P
 ###
`;

/** A creature hiding in the world's first prop, which the map makes the bush. */
function hidingIn(at: Partial<Creature> = {}): WorldState {
  const state = worldFrom(GLADE, { creature: true });

  state.creature = {
    at: 0,
    travelTo: -1,
    travelUntil: -1,
    carriedSince: -1,
    firstCarried: false,
    ...at,
  };

  return state;
}

/** The bush of a world built from the map above. */
function bushOf(state: WorldState): Prop {
  const bush = state.props[0];

  if (bush?.kind !== 'bush') {
    throw new Error('the glade map must carry a bush for the creature to hide in');
  }

  return bush;
}

/** Stand the wizard's own middle this many units left of the bush's middle. */
function standOff(state: WorldState, away: number): WorldState {
  const bush = bushOf(state);

  state.player.x = bush.x + bush.w / 2 - PLAYER_WIDTH / 2 - away;
  state.player.y = bush.y + bush.h / 2 - PLAYER_HEIGHT / 2;

  return state;
}

/** How hard the aura pulls at the bush with the wizard this far off it. */
function strengthAt(away: number): number {
  const state = hidingIn();

  return auraAt(standOff(state, away), bushOf(state)).strength;
}

/** How far the aura threw the bush over `ticks` ticks, longest throw first. */
function throws(state: WorldState, ticks: number): number[] {
  const bush = bushOf(state);

  return Array.from({ length: ticks }, (_, tick) => {
    state.tick = tick;

    const aura = auraAt(state, bush);

    return Math.hypot(aura.x, aura.y);
  }).sort((a, b) => b - a);
}

describe('the glitch aura at the hiding place', () => {
  it('grows as the wizard closes on the prop, and is nothing beyond its reach', () => {
    // Out at the reach and past it there is no aura at all, and it climbs to
    // its whole self as the wizard arrives on top of the prop.
    expect(strengthAt(CREATURE_AURA.reach * 2)).toBe(0);
    expect(strengthAt(CREATURE_AURA.reach)).toBe(0);
    expect(strengthAt(CREATURE_AURA.reach / 2)).toBeCloseTo(0.5);
    expect(strengthAt(0)).toBeCloseTo(1);
  });

  it('throws the sprite a few units about, never further than it is allowed', () => {
    const near = throws(standOff(hidingIn(), 8), 120);

    // It is a glitch, not a shiver: the throws over two minutes of ticks are
    // not all one length, and none of them is longer than the two axes allow.
    expect(new Set(near).size).toBeGreaterThan(50);
    expect(near[0]).toBeLessThanOrEqual(Math.hypot(CREATURE_AURA.units, CREATURE_AURA.units));
    expect(near[0]).toBeGreaterThan(CREATURE_AURA.units / 2);
  });

  it('leaves every prop the creature is not in, and every creature not hiding, calm', () => {
    const away = hidingIn({ at: -1, carriedSince: 3 });
    const travelling = hidingIn({ at: -1, travelTo: 0, travelUntil: 30 });

    for (const state of [away, travelling, worldFrom(GLADE)]) {
      expect(auraAt(standOff(state, 0), bushOf(state))).toEqual({ x: 0, y: 0, strength: 0 });
    }
  });

  it('answers the same throw for the same world and tick, twice over', () => {
    const state = standOff(hidingIn(), 8);

    expect(throws(state, 90)).toEqual(throws(state, 90));
  });
});

describe('the blink the eyes keep', () => {
  it('opens a run with its eyes open, and shuts them once a blink after that', () => {
    const open = Array.from({ length: CREATURE_BLINK.period }, (_, tick) => eyesOpen(tick));

    // HWP-024's acceptance wants a screenshot of the eyes at the bush at the
    // start, so tick 0 has to be a frame with eyes in it.
    expect(open[0]).toBe(true);
    expect(open.filter((shown) => !shown)).toHaveLength(CREATURE_BLINK.shut);
    // The blink is the last few ticks of each period, and the next one opens.
    expect(eyesOpen(CREATURE_BLINK.period - 1)).toBe(false);
    expect(eyesOpen(CREATURE_BLINK.period)).toBe(true);
  });
});

describe('the eyes and the glow beside them', () => {
  const { patch, eye, colour, glow } = CREATURE_EYES;
  const solid = EYE_MARKS.filter((mark) => mark.fill.alpha === 1);
  const faint = EYE_MARKS.filter((mark) => mark.fill.alpha !== 1);

  it('puts a solid eye at each end of the patch', () => {
    expect(solid).toEqual([
      { x: -patch / 2, y: -eye / 2, size: eye, fill: { color: colour, alpha: 1 } },
      { x: patch / 2 - eye, y: -eye / 2, size: eye, fill: { color: colour, alpha: 1 } },
    ]);
  });

  it('draws each eye one unit square, the two of them three apart', () => {
    // The mark the prototype drew and HWP-097 came back to. Every number here
    // is written out rather than read off the config, because the config is
    // what they pin: the 2-unit eyes before them read as too big and too hard,
    // and a glow of half a unit is the one texture pixel ADR-003 asks for.
    expect(eye).toBe(1);
    expect((solid[1]?.x ?? 0) - (solid[0]?.x ?? 0)).toBe(3);
    expect(glow).toEqual({ size: 0.5, alpha: 0.35 });
  });

  it('sets one faint pixel outside each eye, on whole pixels of the texture', () => {
    // The glow the prototype had in the log's hollow: a pixel of the eyes'
    // own red, beyond the far side of each of them and nowhere else.
    expect(faint).toHaveLength(2);
    expect(faint.map((mark) => mark.size)).toEqual([glow.size, glow.size]);
    expect(faint.map((mark) => mark.fill)).toEqual([
      { color: colour, alpha: glow.alpha },
      { color: colour, alpha: glow.alpha },
    ]);
    // Beyond the patch entirely, on both sides: a glow that reached back over
    // its own eye would only thicken it.
    expect((faint[0]?.x ?? 0) + glow.size).toBeLessThanOrEqual(-patch / 2);
    expect(faint[1]?.x ?? 0).toBeGreaterThanOrEqual(patch / 2);

    for (const mark of faint) {
      expect(Number.isInteger(mark.x * RENDER_DENSITY)).toBe(true);
      expect(Number.isInteger(mark.y * RENDER_DENSITY)).toBe(true);
      // An eye is an even number of texture pixels tall, so the glow cannot
      // sit on its middle; it sits on the lower of the two rows that share it.
      expect(mark.y).toBeGreaterThanOrEqual(-eye / 2);
      expect(mark.y + glow.size).toBeLessThanOrEqual(eye / 2);
    }
  });
});

describe('the wisp on the hat', () => {
  it('turns on a circle of its own radius around the point it is placed at', () => {
    for (const tick of [0, 7, 19, 24, 601]) {
      const at = wispAt(tick);

      expect(Math.hypot(at.x, at.y)).toBeCloseTo(CREATURE_WISP.radius);
    }
  });

  it('comes back to where it started one turn later, and is somewhere else between', () => {
    const round = wispAt(CREATURE_WISP.turnTicks);

    expect(round.x).toBeCloseTo(wispAt(0).x);
    expect(round.y).toBeCloseTo(wispAt(0).y);
    expect(wispAt(CREATURE_WISP.turnTicks / 2).x).toBeCloseTo(-CREATURE_WISP.radius);
  });

  it('leaves the trail behind it a visible way back along that circle', () => {
    const head = wispAt(0);

    // Each trailing frame is further back than the last, and the whole trail
    // is at least a pixel of the render texture long (ADR-003, two a unit).
    const back = Array.from({ length: CREATURE_WISP.trail }, (_, behind) => {
      const at = wispAt(-(behind + 1));

      return Math.hypot(at.x - head.x, at.y - head.y);
    });

    expect(back[0] ?? 0).toBeGreaterThan(0.5);
    expect(back[0] ?? 0).toBeLessThan(back[1] ?? 0);
  });
});

/** The wizard's cell, as game/render/wizard.ts measures it, at a known spot. */
const WIZARD: WizardFrame = {
  sheet: 'idle',
  frame: 0,
  cell: { x: 100, y: 50, w: 32, h: 32 },
  light: { x: 0, y: 0 },
};

describe('where the creature shows itself', () => {
  it('sits on the seat its hiding place gives it, measured off the sprite', () => {
    const state = hidingIn();
    const bush = bushOf(state);

    // Up from the bottom of the drawn bush, which stands a foot offset below
    // the trigger box the room gave it — not in the middle of that box.
    expect(eyesAt(state, WIZARD)).toEqual({
      x: bush.x + CREATURE_SEAT.bush.x,
      y: bush.y + bush.h + SPRITE_FOOT_OFFSET - CREATURE_SEAT.bush.up,
    });
    expect(eyesAt(state, WIZARD)?.y).not.toBe(bush.y + bush.h / 2);
  });

  it('rides on the hat while it is carried', () => {
    expect(eyesAt(hidingIn({ at: -1, carriedSince: 3 }), WIZARD)).toEqual({
      x: WIZARD.cell.x + WIZARD.cell.w / 2,
      y: WIZARD.cell.y + CREATURE_EYES.hat,
    });
  });

  it('shows nothing while it travels, and nothing in a world without one', () => {
    expect(eyesAt(hidingIn({ at: -1, travelTo: 0, travelUntil: 30 }), WIZARD)).toBeNull();
    expect(eyesAt(worldFrom(GLADE), WIZARD)).toBeNull();
  });

  it('shakes with the prop it hides in, so it keeps looking out of it', () => {
    const state = hidingIn();
    const bush = bushOf(state);
    const seated = bush.x + CREATURE_SEAT.bush.x;

    bush.hitTick = 0;
    state.tick = 0;
    expect(eyesAt(state, WIZARD)?.x).toBe(seated + PROP_SHAKE.units);
    state.tick = 1;
    expect(eyesAt(state, WIZARD)?.x).toBe(seated - PROP_SHAKE.units);
    // And back on the untouched seat once the four ticks are over.
    state.tick = PROP_SHAKE.ticks;
    expect(eyesAt(state, WIZARD)?.x).toBe(seated);
  });
});
