// The vault for the startle. A decision only.
import { describe, expect, it } from 'vitest';

import { CREATURE_STARTLE_TICKS, NO_INPUT } from '../../game/sim/index';
import { JUMP, mount, RIGHT, step, world } from '../helpers';

const ROOM = ['', '  P  B           ', '#################'];

describe('vault: the startle', () => {
  it('vault-startle 1', () => {
    const trace = () => {
      const w = world(ROOM, { creature: true, seed: 9 });
      const ys: number[] = [];

      mount(w);
      for (let n = 0; n < CREATURE_STARTLE_TICKS + 10; n += 1) {
        step(w, JUMP, 1);
        ys.push(w.player.y);
      }

      return ys.join(',');
    };
    const runs = new Set(Array.from({ length: 6 }, trace));

    expect(runs.size).toBe(1);
  });

  it('vault-startle 2', () => {
    const w = world(ROOM, { creature: true });
    const since = mount(w);

    step(w, NO_INPUT, since + CREATURE_STARTLE_TICKS - w.tick);
    step(w, RIGHT, 1);
    expect(w.player.vx).not.toBe(0);
  });
});
