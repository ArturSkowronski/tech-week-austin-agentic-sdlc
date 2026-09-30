// The world itself: the determinism the whole simulation rests on
// (docs/plan/02-design/simulation-architecture.md) — same map, same seed, same
// frames, same world — and what a text map turns into, which is the room
// parser of docs/plan/02-design/level-design.md and the props, hazards and
// respawn that make the parsed room playable.

import { describe, expect, it } from 'vitest';
import {
  CHARGE_TICKS,
  CHARGE_WINDUP_TICKS,
  createWorld,
  nextRandom,
  NO_INPUT,
  parseRoom,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  Tile,
  tileAt,
  TILE,
  tick,
} from '../../game/sim/index';
import type { InputFrame, Prop, PropKind, WorldState } from '../../game/sim/index';
import { rooms } from '../../game/content/rooms/index';
import { hold, run, worldFrom } from './helpers';

const ROOM = `
  #                      #
  #                      #
  #        P             #
  #      ####            #
  #                 ---  #
  #            ^^        #
  ########################
`;

/** 600 frames of a walk, a jump, a charge and a pause, always in this order. */
const SCRIPT = [
  ...hold({ right: true }, 120),
  ...hold({ right: true, jump: true }, 30),
  ...hold({ jump: true }, 30),
  ...hold({ left: true }, 120),
  ...hold({ left: true, charge: true }, 20),
  ...hold({ down: true }, 80),
  ...hold({}, 200),
];

describe('the world is deterministic', () => {
  it('steps two worlds from the same map and seed to the same state', () => {
    const a = worldFrom(ROOM, { seed: 7, roomName: 'test-room', creature: true });
    const b = worldFrom(ROOM, { seed: 7, roomName: 'test-room', creature: true });

    expect(SCRIPT).toHaveLength(600);

    run(a, SCRIPT);
    run(b, SCRIPT);

    expect(a).toEqual(b);
    expect(a.tick).toBe(600);
  });

  it('keeps the tick bookkeeping the renderer and the audio rely on', () => {
    const state = worldFrom(ROOM, { seed: 7 });
    const frame = { ...NO_INPUT, right: true };

    state.events.push('stale');
    tick(state, frame);

    expect(state.tick).toBe(1);
    expect(state.events).toEqual([]);
    expect(state.lastInput).toEqual(frame);
  });
});

describe('nextRandom', () => {
  // Recorded from the xorshift32 in game/sim/state.ts: these five numbers are
  // what seed 1 means. They change only if the generator changes, which is a
  // decision, not a tweak.
  const SEED_ONE = [
    0.00006295018829405308, 0.015747428173199296, 0.6164041024167091,
    0.07161863497458398, 0.5584883580449969,
  ];

  it('produces the recorded sequence for seed 1', () => {
    const state = createWorld('#', { seed: 1 });
    const drawn = Array.from({ length: SEED_ONE.length }, () => nextRandom(state));

    expect(drawn).toEqual(SEED_ONE);
  });

  it('draws fractions below one and moves the generator word on', () => {
    const state = createWorld('#', { seed: 1 });
    const before = state.rng;
    const value = nextRandom(state);

    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
    expect(state.rng).not.toBe(before);
  });
});

/** The text of a room module, by the name its file carries. */
function roomText(name: string): string {
  const text = rooms[name];

  if (text === undefined) {
    throw new Error(`the rooms glob has no ${name}`);
  }

  return text;
}

/** The one prop of a kind, so a missing prop fails loudly instead of as undefined. */
function propOfKind(props: readonly Prop[], kind: PropKind): Prop {
  const prop = props.find((candidate) => candidate.kind === kind);

  if (prop === undefined) {
    throw new Error(`the room has no ${kind}`);
  }

  return prop;
}

/** How many props of each kind a parse produced. */
function countByKind(props: readonly Prop[]): Partial<Record<PropKind, number>> {
  const counts: Partial<Record<PropKind, number>> = {};

  for (const prop of props) {
    counts[prop.kind] = (counts[prop.kind] ?? 0) + 1;
  }

  return counts;
}

/** Does the player box stand on a spike tile this tick? */
function onSpikes(state: WorldState): boolean {
  const lastX = Math.ceil((state.player.x + PLAYER_WIDTH) / TILE) - 1;
  const feet = Math.floor((state.player.y + PLAYER_HEIGHT - 1) / TILE);

  for (let tx = Math.floor(state.player.x / TILE); tx <= lastX; tx += 1) {
    if (tileAt(state.room, tx, feet) === Tile.Spike) {
      return true;
    }
  }

  return false;
}

/** Hold one frame until `done`, giving up at 600 ticks so a failure is not a hang. */
function runUntil(state: WorldState, input: Partial<InputFrame>, done: () => boolean): void {
  const frame = { ...NO_INPUT, ...input };

  for (let step = 0; step < 600 && !done(); step += 1) {
    tick(state, frame);
  }
}

describe('the room parser', () => {
  it('reads the forest glade as 80 by 22 tiles with the props of its map', () => {
    const { room, props } = parseRoom(roomText('forest-glade'));

    expect(room.width).toBe(80);
    expect(room.height).toBe(22);
    expect(props).toHaveLength(7);
    expect(countByKind(props)).toEqual({
      beacon: 1,
      bush: 1,
      flag: 2,
      log: 1,
      rock: 1,
      waterfall: 1,
    });
  });

  it('spawns the wizard on tile (2, 17) with his feet on row 18', () => {
    const { room } = parseRoom(roomText('forest-glade'));

    // To the unit, so a centring that drifted inside tile 2 still fails. The
    // spawn is placed by game/sim/room.ts, never by the planted checkpoint
    // module, so this asserts nothing HW-002's paired test owns (AGENTS.md rule 5).
    expect(room.spawn.x).toBe(2 * TILE + (TILE - PLAYER_WIDTH) / 2);
    expect(room.spawn.y + PLAYER_HEIGHT).toBe(18 * TILE);
  });

  it('anchors the waterfall on its surface tile and fills down to the bottom row', () => {
    const { room, props } = parseRoom(roomText('forest-glade'));
    // `W` sits on row 13 of the glade, level with the plateau it is jumped from.
    const water = propOfKind(props, 'waterfall');

    expect(water.x).toBe(33 * TILE);
    expect(water.y).toBe(13 * TILE);
    expect(water.w).toBe(96);
    expect(water.y + water.h).toBe(room.height * TILE);
  });

  it('stands a prop on the tile below its letter', () => {
    const { props } = parseRoom(roomText('forest-glade'));
    // `B` sits on row 12, so the bush stands on row 13, the plateau.
    const bush = propOfKind(props, 'bush');

    expect(bush.x).toBe(23 * TILE);
    expect(bush.y + bush.h).toBe(13 * TILE);
  });
});

/** A flag three tiles along the floor and spikes three tiles past it. */
const FLAG_ROOM = `
  #        #
  #        #
  # P  F ^ #
  ##########
`;

/** A beacon three tiles along the floor. */
const BEACON_ROOM = `
  #       #
  #       #
  # P  E  #
  #########
`;

/** A flag two tiles along the floor, then a two-tile hole in the floor itself. */
const PIT_ROOM = `
  #          #
  #          #
  # P F      #
  #####  #####
`;

/** Spikes ahead of the spawn, far enough that a charge is still running over them. */
const SPIKE_RUN = `
  #          #
  #          #
  # P ^^^    #
  ############
`;

describe('props, deaths and respawn', () => {
  it('respawns at the flag he raised rather than at the spawn', () => {
    const world = worldFrom(FLAG_ROOM);
    const spawn = world.room.spawn;

    runUntil(world, { right: true }, () => world.deaths > 0);

    expect(world.deaths).toBe(1);
    expect(propOfKind(world.props, 'flag').active).toBe(true);
    expect(world.player.state).toBe('hurt');
    expect(world.player.invuln).toBeGreaterThan(0);
    // The respawn position to the unit belongs to the paired test of HW-002;
    // this suite only asks that it is the checkpoint and not the spawn.
    expect({ x: world.player.x, y: world.player.y }).toEqual(world.player.checkpoint);
    expect(world.player.checkpoint.x).not.toBe(spawn.x);
  });

  it('stops the run clock and holds victory when the beacon is touched', () => {
    const world = worldFrom(BEACON_ROOM);

    runUntil(world, { right: true }, () => world.victoryTick >= 0);

    const reached = world.victoryTick;

    expect(reached).toBeGreaterThan(0);

    run(world, hold({ right: true }, 30));

    expect(world.victoryTick).toBe(reached);
    expect(world.player.state).toBe('victory');
    // When the beacon itself lights is the cast's, in tests/sim/victory.test.ts.
  });

  it('counts a fall out of the room as a death and puts him back on his flag', () => {
    const world = worldFrom(PIT_ROOM);
    const spawn = world.room.spawn;

    runUntil(world, { right: true }, () => world.deaths > 0);

    expect(world.deaths).toBe(1);
    expect(propOfKind(world.props, 'flag').active).toBe(true);
    expect(world.player.state).toBe('hurt');
    expect({ x: world.player.x, y: world.player.y }).toEqual(world.player.checkpoint);
    expect(world.player.checkpoint.x).not.toBe(spawn.x);
  });

  it('carries him over spikes while the wand owns the tick, then lets them take him', () => {
    const world = worldFrom(SPIKE_RUN);
    // Every tick of the charge but its last; the last is the dismount, which
    // hands the tick back to his feet before the props are stepped.
    const dash = hold({ right: true, charge: true }, CHARGE_WINDUP_TICKS + CHARGE_TICKS - 1);
    let chargedOverSpikes = 0;

    for (const frame of dash) {
      tick(world, frame);

      if (world.player.state === 'charge' && onSpikes(world)) {
        chargedOverSpikes += 1;
      }
    }

    // ADR-002 and the tuning table: no vulnerability during the charge.
    expect(chargedOverSpikes).toBeGreaterThan(0);
    expect(world.player.state).toBe('charge');
    expect(onSpikes(world)).toBe(true);
    expect(world.deaths).toBe(0);

    // The wand lets go above the same spikes, and then they do take him.
    tick(world, NO_INPUT);

    expect(world.deaths).toBe(1);
    expect(world.player.state).toBe('hurt');
  });
});
