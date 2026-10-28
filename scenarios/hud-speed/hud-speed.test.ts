// The F1 line shows the wizard's speed (orders/hud-speed.md).
import { describe, expect, it } from 'vitest';

import { hudLine } from '../../game/render/hud';
import { RIGHT, step, world } from '../helpers';

const FLOOR = ['', '  P                       ', '##########################'];

describe('the F1 line shows the speed', () => {
  it('Behind F1 the line ends with vx and vy in whole units per second', () => {
    const w = step(world(FLOOR), RIGHT, 60);

    expect(hudLine(w, true)).toMatch(/vx 110 vy 0$/);
  });

  it('Standing still the line ends with vx 0 vy 0', () => {
    expect(hudLine(world(FLOOR), true)).toMatch(/  vx 0 vy 0$/);
  });

  it('Without F1 the line stays empty', () => {
    expect(hudLine(step(world(FLOOR), RIGHT, 30), false)).toBe('');
  });
});
