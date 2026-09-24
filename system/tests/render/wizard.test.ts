// Frame selection is a pure function of the player's state, the ticks he has
// spent in it and the ticks he has been falling (rendering-and-look.md,
// Sprites). Everything below is asserted twice over, because "the same state
// draws the same frame" is the ticket's own acceptance; drawing the frames
// needs a browser and is covered in tests/smoke/wizard.spec.ts.

import { describe, expect, it } from 'vitest';

import { WIZARD_FPS } from '../../game/render/config';
import { poseFor, scaleFor, type Cells, type Pose } from '../../game/render/wizard';
import {
  CHARGE_WINDUP_TICKS,
  LAND_TICKS,
  LONG_FALL_TICKS,
  TICK_RATE,
  createWorld,
  type Player,
  type PlayerState,
} from '../../game/sim';

/** The strips the kit writes today (asset-list.md, wizard table). */
const CELLS: Cells = { idle: 4, run: 8, jump: 7, fall: 4, charge: 5 };

/** A player standing in one state, with everything else at its fresh value. */
function standing(state: PlayerState, at: Partial<Player> = {}): Player {
  return { ...createWorld('#').player, state, ...at };
}

/** The frame shown, as `sheet:frame`, so a whole run reads at a glance. */
function shown(player: Player): string {
  const pose = poseFor(player, CELLS);

  return `${pose.sheet}:${pose.frame}`;
}

/** The frames a state shows over its first `ticks` ticks in it. */
function over(ticks: number, state: PlayerState, at: Partial<Player> = {}): string[] {
  return Array.from({ length: ticks }, (_, stateTimer) =>
    shown(standing(state, { ...at, stateTimer })),
  );
}

describe('the frame a state shows', () => {
  it('breathes through the idle strip and walks through the run one', () => {
    // Ten frames a second over a sixty-tick second: six ticks a frame, and
    // the eight poses of the walk cycle come round in eight of those.
    const hold = TICK_RATE / WIZARD_FPS.run;

    expect(over(hold + 1, 'run')).toEqual([...Array<string>(hold).fill('run:0'), 'run:1']);
    expect(over(hold * CELLS.run + 1, 'run').at(-1)).toBe('run:0');
    expect(new Set(over(TICK_RATE, 'idle'))).toEqual(
      new Set(['idle:0', 'idle:1', 'idle:2', 'idle:3']),
    );
  });

  it('holds the take-off for four ticks and then goes to air up', () => {
    expect(over(6, 'jump')).toEqual([
      'jump:2',
      'jump:2',
      'jump:2',
      'jump:2',
      'jump:3',
      'jump:3',
    ]);
  });

  it('falls on one pose until twenty ticks, then flails through the other three', () => {
    const short = standing('fall', { fellFor: LONG_FALL_TICKS - 1, stateTimer: 99 });
    const long = (fellFor: number): string => shown(standing('fall', { fellFor }));

    expect(shown(short)).toBe('fall:0');
    expect(long(LONG_FALL_TICKS)).toBe('fall:1');

    // The flail loops over the three poses and never falls back to air down.
    const flail = Array.from({ length: 60 }, (_, tick) => long(LONG_FALL_TICKS + tick));

    expect(new Set(flail)).toEqual(new Set(['fall:1', 'fall:2', 'fall:3']));
  });

  it('lands out of the jump sheet, and out of the dust after a long fall', () => {
    expect(over(LAND_TICKS, 'land', { fellFor: 1 })).toEqual([
      'jump:5',
      'jump:5',
      'jump:6',
      'jump:6',
    ]);
    expect(new Set(over(LAND_TICKS, 'land', { fellFor: LONG_FALL_TICKS }))).toEqual(
      new Set(['fall:3']),
    );
  });

  it('holds the charge wind-up for its two ticks, then loops the other four', () => {
    const charge = over(CHARGE_WINDUP_TICKS + 20, 'charge');

    expect(charge.slice(0, CHARGE_WINDUP_TICKS)).toEqual(['charge:0', 'charge:0']);
    expect(new Set(charge.slice(CHARGE_WINDUP_TICKS))).toEqual(
      new Set(['charge:1', 'charge:2', 'charge:3', 'charge:4']),
    );
  });

  it('keeps the states with no sheet of their own on a still pose', () => {
    // asset-list.md marks these "to draw"; until then they stand in, and the
    // recoil at least keeps him astride the wand (ADR-002).
    expect(new Set(over(30, 'chargeRecoil'))).toEqual(new Set(['charge:0']));
    expect(new Set(over(30, 'hurt'))).toEqual(new Set(['idle:0']));
  });
});

describe('reading the same state twice', () => {
  it('answers the same frame, for every state and every tick of it', () => {
    const states: readonly PlayerState[] = [
      'idle',
      'run',
      'jump',
      'fall',
      'charge',
      'chargeRecoil',
      'land',
      'hurt',
      'victory',
    ];
    const poses: Pose[] = [];
    const again: Pose[] = [];

    for (const state of states) {
      for (let tick = 0; tick < 90; tick += 1) {
        const player = standing(state, { stateTimer: tick, fellFor: tick });

        poses.push(poseFor(player, CELLS));
        again.push(poseFor(player, CELLS));
      }
    }

    expect(again).toEqual(poses);
    // And the run is not one frame repeated, so the comparison means something.
    expect(new Set(poses.map((pose) => `${pose.sheet}:${pose.frame}`)).size).toBeGreaterThan(10);
  });

  it('reads nothing but the four fields the animation is a function of', () => {
    const one = standing('run', { stateTimer: 7, fellFor: 3, facing: 1, x: 0, vx: 0 });
    const other = standing('run', { stateTimer: 7, fellFor: 3, facing: -1, x: 400, vx: 110 });

    expect(poseFor(other, CELLS)).toEqual(poseFor(one, CELLS));
  });
});

describe('the scale a strip is drawn at', () => {
  it('shows the 1x sheets the kit writes today at their own pixels', () => {
    expect(scaleFor(1, 1)).toEqual({ x: 1, y: 1 });
  });

  it('mirrors the horizontal axis by facing and nothing else', () => {
    expect(scaleFor(1, -1)).toEqual({ x: -1, y: 1 });
    expect(scaleFor(2, -1)).toEqual({ x: -0.5, y: 0.5 });
  });

  it('halves both axes of a strip drawn at two pixels per unit', () => {
    // asset-list.md's 64 px cells: the cell the frame is measured into stays
    // 32 world units, so the texture has to come back to it (ADR-003). The
    // crystal is already divided by the same density in sprites.ts, and the
    // glow would leave the wand if only one of the two did it.
    expect(scaleFor(2, 1)).toEqual({ x: 0.5, y: 0.5 });
  });
});
