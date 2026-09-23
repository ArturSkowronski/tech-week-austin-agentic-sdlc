// Jump height, the jump cut, coyote time and the jump buffer
// (docs/plan/02-design/movement-and-physics.md). The wizard walks and jumps;
// nothing here bounces and nothing charges a jump (ADR-002).

import { describe, expect, it } from 'vitest';
import { COYOTE_TICKS, JUMP_BUFFER_TICKS, NO_INPUT, tick } from '../../game/sim/index';
import type { InputFrame, PlayerState, WorldState } from '../../game/sim/index';
import { hold, run, worldFrom } from './helpers';

/** Flat ground with room above it for the tallest jump. */
const FLAT = `






  P
  ##########
`;

/** A ledge to walk off, with the floor four tiles below its far side. */
const LEDGE = `
  P
  ###



  ##########
`;

const RIGHT: InputFrame = { ...NO_INPUT, right: true };

/** A world stepped one tick, so the wizard rests on the ground he spawned over. */
function standing(map: string): WorldState {
  return run(worldFrom(map), hold({}, 1));
}

/** How far above his starting height the wizard gets over those frames. */
function peak(world: WorldState, frames: readonly InputFrame[]): number {
  const start = world.player.y;
  let highest = start;

  for (const frame of frames) {
    tick(world, frame);
    highest = Math.min(highest, world.player.y);
  }

  return start - highest;
}

/** Run right until the ground is gone; the world is left on that very tick. */
function walkOff(map: string): WorldState {
  const world = standing(map);

  while (world.player.onGround) {
    tick(world, RIGHT);
  }

  return world;
}

/** His state after pressing jump `late` ticks after the ground ran out. */
function jumpAfterLedge(late: number): PlayerState {
  const world = run(walkOff(LEDGE), hold({ right: true }, late - 1));

  tick(world, { ...RIGHT, jump: true });

  return world.player.state;
}

/** Ticks from the one he walked off the ledge to the one he touches down. */
function ticksToLanding(): number {
  const world = walkOff(LEDGE);
  let ticks = 0;

  while (!world.player.onGround) {
    tick(world, NO_INPUT);
    ticks += 1;
  }

  return ticks;
}

/** How long the drop off LEDGE lasts; the buffer is aimed at its last tick. */
const FALL_TICKS = ticksToLanding();

/** His state on the landing tick, jump pressed `early` ticks before it. */
function jumpBeforeLanding(early: number): PlayerState {
  const world = walkOff(LEDGE);

  for (let at = 1; at <= FALL_TICKS; at += 1) {
    tick(world, at === FALL_TICKS - early ? { ...NO_INPUT, jump: true } : NO_INPUT);
  }

  return world.player.state;
}

describe('the jump', () => {
  it('peaks about three and a third tiles up when jump is held', () => {
    const height = peak(standing(FLAT), hold({ jump: true }, 60));

    expect(height).toBeGreaterThanOrEqual(52);
    expect(height).toBeLessThanOrEqual(56);
  });

  it('peaks far lower when jump is released after four ticks', () => {
    const cut = [...hold({ jump: true }, 4), ...hold({}, 56)];

    expect(peak(standing(FLAT), cut)).toBeLessThan(30);
  });
});

describe('coyote time', () => {
  it('keeps the jump for COYOTE_TICKS ticks, counting the tick the ground ran out', () => {
    expect(jumpAfterLedge(COYOTE_TICKS - 1)).toBe('jump');
    expect(jumpAfterLedge(COYOTE_TICKS)).toBe('fall');
    expect(jumpAfterLedge(COYOTE_TICKS + 1)).toBe('fall');
  });
});

describe('the jump buffer', () => {
  it('fires a press made up to JUMP_BUFFER_TICKS ticks early on the landing tick', () => {
    expect(jumpBeforeLanding(JUMP_BUFFER_TICKS - 1)).toBe('jump');
    expect(jumpBeforeLanding(JUMP_BUFFER_TICKS)).toBe('land');
  });
});
