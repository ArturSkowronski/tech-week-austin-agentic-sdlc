// Where a death puts the wizard back: the flag he raised last, or the room's
// spawn before he has raised one (docs/plan/02-design/movement-and-physics.md,
// death and respawn).
//
// game/sim/checkpoint.ts derives that point from the raised flag at the death
// rather than reading the position `game/sim/props.ts` recorded at the raise,
// and this is the replay test that change ships with (AGENTS.md rule 1).
//
// Every world here is built without a creature, so HW-002's carried-only shift
// cannot fire: these are the positions the game is meant to have whether or
// not the entry is in bugs/manifest.json, and nothing below asserts planted
// behaviour (AGENTS.md rule 5).

import { describe, expect, it } from 'vitest';
import { NO_INPUT, PLAYER_HEIGHT, tick, TILE } from '../../game/sim/index';
import type { InputFrame, Prop, WorldState } from '../../game/sim/index';
import { worldFrom } from './helpers';

/**
 * Two flags between the spawn and the spikes. He walks left, so the flag the
 * map places first is the one he raises last — the map's order and the raising
 * order disagree, which is what tells the two apart.
 */
const TWO_FLAGS = `
  #            #
  #            #
  # ^  F   F P #
  ##############
`;

/** The only flag is past the spikes, so he dies before he can raise it. */
const FLAG_PAST_THE_SPIKES = `
  #            #
  #            #
  # P ^   F    #
  ##############
`;

/** Ticks the walk tries before giving up, rather than hanging on a bad map. */
const GIVE_UP = 600;

/** Hold one direction until the hazard takes him. */
function walkUntilDeath(world: WorldState, input: Partial<InputFrame>): WorldState {
  const frame: InputFrame = { ...NO_INPUT, ...input };

  for (let step = 0; step < GIVE_UP && world.deaths === 0; step += 1) {
    tick(world, frame);
  }

  return world;
}

/** The room's flags, in the order the map placed them. */
function flagsOf(world: WorldState): Prop[] {
  return world.props.filter((prop) => prop.kind === 'flag');
}

/** The flag standing on a tile column of the map, which is how TWO_FLAGS names its two. */
function flagOnColumn(world: WorldState, column: number): Prop {
  const flag = flagsOf(world).find((prop) => prop.x / TILE === column);

  if (flag === undefined) {
    throw new Error(`no flag on column ${column}`);
  }

  return flag;
}

/** The columns TWO_FLAGS writes its flags in: he walks left, so SPAWN_SIDE is raised first. */
const SPAWN_SIDE = 9;
const SPIKE_SIDE = 5;

describe('the checkpoint a death puts him back on', () => {
  it('is the flag he raised last, not the first one the map placed', () => {
    const world = walkUntilDeath(worldFrom(TWO_FLAGS), { left: true });
    const nearTheSpawn = flagOnColumn(world, SPAWN_SIDE);
    const nearTheSpikes = flagOnColumn(world, SPIKE_SIDE);

    expect(world.deaths).toBe(1);
    expect(nearTheSpawn.active).toBe(true);
    expect(nearTheSpikes.active).toBe(true);
    // Walking left reaches the spawn-side flag first, so the one he comes back
    // to is the later raise and the earlier of the two in the map.
    expect(nearTheSpikes.hitTick).toBeGreaterThan(nearTheSpawn.hitTick);

    // On that flag's own tile, feet on the ground it stands on. The tile
    // rather than the unit: the position to the unit is HW-002's paired test.
    expect(Math.floor(world.player.x / TILE)).toBe(nearTheSpikes.x / TILE);
    expect(world.player.y + PLAYER_HEIGHT).toBe(nearTheSpikes.y + nearTheSpikes.h);
    expect({ x: world.player.x, y: world.player.y }).toEqual(world.player.checkpoint);
  });

  it('is the room spawn while he has raised no flag at all', () => {
    const world = walkUntilDeath(worldFrom(FLAG_PAST_THE_SPIKES), { right: true });

    expect(world.deaths).toBe(1);
    expect(flagsOf(world).every((flag) => !flag.active)).toBe(true);
    expect({ x: world.player.x, y: world.player.y }).toEqual(world.room.spawn);
  });
});
