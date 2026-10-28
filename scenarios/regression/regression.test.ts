// Regression: behaviour that works today and has to keep working, whatever the work order.
import { describe, expect, it } from 'vitest';

import forestGlade from '../../game/content/rooms/forest-glade';
import { createWorld, NO_INPUT, TICK_RATE } from '../../game/sim/index';
import { GLADE } from '../../tests/sim/forest-scripts';
import { LEFT, RIGHT, step, world } from '../helpers';

const FLOOR = ['', '        P           ', '####################'];

describe('regression', () => {
  it('The glade can still be played to the beacon within a minute, without a death', () => {
    const glade = createWorld(forestGlade, { roomName: 'forest-glade' });

    for (const frame of GLADE) {
      step(glade, frame, 1);
    }

    expect(glade.deaths).toBe(0);
    expect(glade.victoryTick).toBeGreaterThan(0);
    expect(glade.victoryTick).toBeLessThan(60 * TICK_RATE);
  });

  it('Without the creature, right walks right and left walks left', () => {
    const a = world(FLOOR);
    const x = a.player.x;

    step(a, RIGHT, 20);
    expect(a.player.x).toBeGreaterThan(x);

    const b = world(FLOOR);

    step(b, LEFT, 20);
    expect(b.player.x).toBeLessThan(x);
  });

  it('A recorded run replays exactly: the same seed and frames give the same world', () => {
    const frames = [RIGHT, RIGHT, { ...NO_INPUT, jump: true }, LEFT];
    const runs = Array.from({ length: 5 }, () => {
      const w = world(['', '  P  B   L      ', '################'], { creature: true, seed: 11 });

      for (let n = 0; n < 240; n += 1) {
        step(w, frames[Math.floor(n / 60)] ?? NO_INPUT, 1);
      }

      return JSON.stringify({ x: w.player.x, y: w.player.y, c: w.creature, t: w.tick });
    });

    expect(new Set(runs).size).toBe(1);
  });
});
