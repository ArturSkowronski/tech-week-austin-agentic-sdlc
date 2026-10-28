// HW-001: with the creature on the hat the controls stay the wizard's own.
import { describe, expect, it } from 'vitest';

import { NO_INPUT } from '../../game/sim/index';
import { JUMP, LEFT, mount, RIGHT, step, world } from '../helpers';

const ROOM = ['', '        P  B        ', '####################'];

/** Mount the creature, then let any startle pass before the buttons are judged. */
function riding() {
  const w = world(ROOM, { creature: true });

  expect(mount(w), 'the creature never climbed on').toBeGreaterThanOrEqual(0);
  step(w, NO_INPUT, 40);

  return w;
}

describe('controls while the creature rides', () => {
  it('With the creature on the hat, holding right walks the wizard right', () => {
    const w = riding();
    const x = w.player.x;

    step(w, RIGHT, 30);
    expect(w.player.x).toBeGreaterThan(x);
  });

  it('With the creature on the hat, holding left walks the wizard left', () => {
    const w = riding();
    const x = w.player.x;

    step(w, LEFT, 30);
    expect(w.player.x).toBeLessThan(x);
  });

  it('With the creature on the hat, a jump lifts him off the ground', () => {
    const w = riding();

    step(w, JUMP, 1);
    expect(w.player.onGround).toBe(false);
  });
});
