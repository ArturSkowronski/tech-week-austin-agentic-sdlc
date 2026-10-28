// The startle (orders/startle.md).
import { describe, expect, it } from 'vitest';

import { CREATURE_STARTLE_TICKS, NO_INPUT } from '../../game/sim/index';
import { JUMP, mount, RIGHT, step, world } from '../helpers';

const ROOM = ['', '  P  B           ', '#################'];

/** A ledge, a bush hanging over the drop, the floor far below. */
const DROP = ['  P', '  ###', '       B', '', '', '', '  ##################'];

describe('the startle', () => {
  it('The buttons do nothing for CREATURE_STARTLE_TICKS after the creature climbs on', () => {
    const w = world(ROOM, { creature: true });
    const since = mount(w);

    expect(since).toBeGreaterThanOrEqual(0);

    const x = w.player.x;

    while (w.tick - since < CREATURE_STARTLE_TICKS) {
      step(w, { ...RIGHT, jump: true }, 1);
      expect(w.player.onGround).toBe(true);
    }

    expect(Math.abs(w.player.x - x)).toBeLessThan(8);
  });

  it('The buttons work again on the tick after the startle', () => {
    const w = world(ROOM, { creature: true });
    const since = mount(w);

    step(w, NO_INPUT, since + CREATURE_STARTLE_TICKS - w.tick);
    step(w, JUMP, 1);
    expect(w.player.onGround).toBe(false);
  });

  it('A startle that begins in the air still falls and lands', () => {
    const w = world(DROP, { creature: true });
    const since = mount(w);

    expect(since).toBeGreaterThanOrEqual(0);
    expect(w.player.onGround).toBe(false);

    const y = w.player.y;

    step(w, NO_INPUT, Math.floor(CREATURE_STARTLE_TICKS / 2));
    expect(w.player.y).toBeGreaterThan(y);
    step(w, NO_INPUT, 120);
    expect(w.player.onGround).toBe(true);
  });
});
