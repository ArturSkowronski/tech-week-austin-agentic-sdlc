// The vault for HW-001. A decision only: nobody tells the agent which of these failed.
import { describe, expect, it } from 'vitest';

import { NO_INPUT } from '../../game/sim/index';
import { LEFT, mount, RIGHT, step, world } from '../helpers';

const ROOM = ['', '        P  B        ', '####################'];

describe('vault: controls', () => {
  it('vault-controls 1', () => {
    const w = world(ROOM, { creature: true });

    mount(w);
    step(w, NO_INPUT, 40);
    step(w, LEFT, 10);
    expect(w.player.facing).toBe(-1);
    step(w, RIGHT, 10);
    expect(w.player.facing).toBe(1);
  });

  it('vault-controls 2', () => {
    const ride = () => {
      const w = world(ROOM, { creature: true, seed: 5 });

      mount(w);
      step(w, NO_INPUT, 40);
      step(w, LEFT, 25);
      step(w, RIGHT, 25);

      return w.player.x;
    };

    expect(ride()).toBe(ride());
    expect(ride()).toBeGreaterThan(0);
  });
});
