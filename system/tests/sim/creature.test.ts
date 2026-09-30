// The creature: where it hides, the walk-through that puts it on the hat, the
// ten-second release, the charge that shakes it off, the charge that makes it
// flee its hiding place, and the death that drops it
// (docs/plan/02-design/bug-quest.md, the creature; movement-and-physics.md).
//
// The manifest decides which prop kind a room's creature hides in. The
// repository's own manifest is an empty list, so the worlds here belong to no
// room and take the clean-manifest path — every one but "takes the kind the
// manifest names", which is built with FIXTURE.room and reads the stand-in
// entry below. Nothing here asserts planted behaviour: that entry is a fixture
// of the reader's schema, naming no module the suite exercises and no bug the
// game ships (AGENTS.md rule 5).

import {
  CREATURE_CARRY_TICKS,
  CREATURE_TRAVEL_TICKS,
  NO_INPUT,
  PLAYER_WIDTH,
  tick,
} from '../../game/sim/index';
import type { Creature, InputFrame, Prop, WorldState } from '../../game/sim/index';
import { describe, expect, it, vi } from 'vitest';
import { hold, run, worldFrom } from './helpers';

/**
 * The stand-in entry's room and hiding kind, hoisted with the mock factory
 * that uses them so the two cannot drift. It hides in a `log` while its room's
 * first hiding place is a bush, which is what tells "the kind the manifest
 * names" apart from "the first hiding place".
 */
const { FIXTURE } = vi.hoisted(() => ({
  FIXTURE: { room: 'creature-fixture', hides: 'log' },
}));

vi.mock('../../bugs/manifest.json', () => ({
  default: {
    bugs: [
      {
        id: 'HW-000',
        title: 'A stand-in for the manifest reader',
        symptom: 'None; this entry exists only for tests/sim/creature.test.ts.',
        clue: 'nothing',
        module: 'game/sim/creature.ts',
        test: 'tests/sim/creature.test.ts',
        rooms: [FIXTURE.room],
        creature: { hides: FIXTURE.hides },
        steps: [],
        expected: 'The creature starts in the first log of the room.',
        logs: [],
      },
    ],
  },
}));

/**
 * A bush to walk into, a wall that stops the run, and a log behind the wall:
 * the wizard ends his run nearer the log than the bush, so which hiding place
 * is nearest changes as he crosses the room.
 */
const ROOM = `

  P  B      #L
  ############
`;

/**
 * The same room with a spike on each side of the spawn, so the walk ends on a
 * spike whichever way it goes: the room's sides are walls now, and which way
 * a held button takes him is the input map's business, not this suite's
 * (AGENTS.md rule 5).
 */
const SPIKED = `

  ^P  B  ^   #L
  #############
`;

/**
 * A bush before two logs, for the room the stand-in entry names: the bush is
 * the first hiding place, the first log is the first prop of the named kind,
 * and the second log is there so "first of that kind" is not also "last".
 */
const TWO_LOGS = `

  P  B   L  L
  ###########
`;

/** Prop ids of TWO_LOGS, again the map's reading order. */
const FIRST_LOG = 1;

/** Prop ids are the map's reading order, so the bush comes first and the log second. */
const BUSH = 0;
const LOG = 1;

/** Ticks a stepping loop tries before calling it a failure rather than hanging. */
const GIVE_UP = 1000;

const RIGHT: InputFrame = { ...NO_INPUT, right: true };
const CHARGE: InputFrame = { ...NO_INPUT, charge: true };

/** The creature of a world built with one; the `creature` option is what puts it there. */
function creatureOf(world: WorldState): Creature {
  const creature = world.creature;

  if (creature === null) {
    throw new Error('this world was built without a creature');
  }

  return creature;
}

/** A prop by id, narrowed: every call site here names a prop the map really has. */
function propOf(world: WorldState, id: number): Prop {
  const prop = world.props[id];

  if (prop === undefined) {
    throw new Error(`this map has no prop ${id}`);
  }

  return prop;
}

/** Hold one frame until `ready`, and report the tick it first held on. */
function stepUntil(
  world: WorldState,
  frame: InputFrame,
  ready: (world: WorldState) => boolean,
): number {
  for (let step = 0; step < GIVE_UP; step += 1) {
    tick(world, frame);

    if (ready(world)) {
      return world.tick;
    }
  }

  throw new Error(`${GIVE_UP} ticks never got there`);
}

/** A world whose creature rides the hat, walked into its hiding place to get there. */
function carrying(map = ROOM): WorldState {
  const world = worldFrom(map, { creature: true });

  stepUntil(world, RIGHT, (it) => creatureOf(it).carriedSince >= 0);

  return world;
}

describe('the creature hiding', () => {
  it('is only in a world that was built with one', () => {
    expect(worldFrom(ROOM).creature).toBeNull();
    expect(worldFrom(ROOM, { creature: true }).creature).not.toBeNull();
  });

  it("takes the room's first hiding place when no manifest entry names a kind", () => {
    const world = run(worldFrom(ROOM, { creature: true }), hold({}, 1));

    expect(creatureOf(world).at).toBe(BUSH);
  });

  it('takes the first prop of the kind the manifest names for its room', () => {
    const world = run(
      worldFrom(TWO_LOGS, { creature: true, roomName: FIXTURE.room }),
      hold({}, 1),
    );

    // The named kind wins over the bush, which is the room's first hiding
    // place, and the first log wins over the second one behind it.
    expect(propOf(world, FIRST_LOG).kind).toBe(FIXTURE.hides);
    expect(creatureOf(world).at).toBe(FIRST_LOG);
  });

  it('stays there, untouched and unfelt, while the wizard keeps away', () => {
    const creature = creatureOf(run(worldFrom(ROOM, { creature: true }), hold({}, 120)));

    expect(creature.at).toBe(BUSH);
    expect(creature.carriedSince).toBe(-1);
    expect(creature.firstCarried).toBe(false);
  });
});

describe('the creature riding', () => {
  it('climbs on the tick the wizard first walks into its hiding place', () => {
    const world = worldFrom(ROOM, { creature: true });
    const creature = creatureOf(world);
    const bush = propOf(world, BUSH);
    let reachedBefore = 0;

    // Bounded like every stepping loop here: this one is stepped by hand to
    // keep the tick before the mount, and an unbounded `while` is synchronous,
    // so a creature that stopped mounting would wedge the worker rather than
    // fail the test (AGENTS.md rule 1).
    for (let step = 0; step < GIVE_UP && creature.carriedSince < 0; step += 1) {
      reachedBefore = world.player.x + PLAYER_WIDTH;
      tick(world, RIGHT);
    }

    expect(creature.carriedSince, `${GIVE_UP} ticks never mounted it`).toBeGreaterThanOrEqual(0);
    expect(creature.carriedSince).toBe(world.tick);
    expect(creature.firstCarried).toBe(true);
    expect(creature.at).toBe(-1);
    // Tick-exact: on the tick before, his box was still short of the bush.
    expect(reachedBefore).toBeLessThanOrEqual(bush.x);
    expect(world.player.x + PLAYER_WIDTH).toBeGreaterThan(bush.x);
  });

  it('lets go after six hundred ticks and reaches the nearest hiding place thirty later', () => {
    const world = carrying();
    const creature = creatureOf(world);

    // No direction is held while he carries it: game/sim/input-map.ts is where
    // HW-001 is planted, and the main suite says nothing about what a rider
    // does to the horizontal axis (AGENTS.md rule 5).
    run(world, hold({}, CREATURE_CARRY_TICKS));
    const dropped = world.tick;

    expect(creature.carriedSince).toBe(-1);
    expect(creature.at).toBe(-1);
    // He stood where it climbed on, so the bush is still the nearer of the two.
    expect(creature.travelTo).toBe(BUSH);
    expect(creature.travelUntil).toBe(dropped + CREATURE_TRAVEL_TICKS);

    // Tick-exact: it is still on its way with one tick to go, and home on the next.
    run(world, hold({}, CREATURE_TRAVEL_TICKS - 1));
    expect(creature.at).toBe(-1);

    run(world, hold({}, 1));
    expect(creature.at).toBe(BUSH);
    expect(creature.travelTo).toBe(-1);
    expect(creature.travelUntil).toBe(-1);
  });

  it('is shaken off by a charge, and takes the same thirty ticks home', () => {
    const world = carrying();
    const creature = creatureOf(world);
    const dropped = stepUntil(world, CHARGE, (it) => creatureOf(it).carriedSince === -1);

    // He has barely left the bush, so the bush is still the nearest of the two.
    expect(creature.travelTo).toBe(BUSH);
    expect(creature.travelUntil).toBe(dropped + CREATURE_TRAVEL_TICKS);

    run(world, hold({}, CREATURE_TRAVEL_TICKS));
    expect(creature.at).toBe(BUSH);
  });
});

describe('the creature fleeing', () => {
  it('leaves a hiding place the charge hits, for another one', () => {
    const world = worldFrom(ROOM, { creature: true });
    const creature = creatureOf(world);
    const fled = stepUntil(world, CHARGE, (it) => creatureOf(it).travelUntil >= 0);

    expect(propOf(world, BUSH).hitTick).toBe(fled);
    expect(creature.at).toBe(-1);
    expect(creature.travelTo).toBe(LOG);
    expect(creature.travelUntil).toBe(fled + CREATURE_TRAVEL_TICKS);
    // A charge is not a walk-through: it flees rather than climbing on.
    expect(creature.firstCarried).toBe(false);

    run(world, hold({}, CREATURE_TRAVEL_TICKS));
    expect(creature.at).toBe(LOG);
  });
});

describe('the creature and a death', () => {
  it('is dropped at the nearest hiding place once the respawn has been computed', () => {
    const world = carrying(SPIKED);
    const creature = creatureOf(world);

    stepUntil(world, RIGHT, (it) => it.events.includes('death'));

    // The respawn ran first, on this same tick, with the creature still aboard.
    expect(world.player.x).toBe(world.player.checkpoint.x);
    expect(world.player.y).toBe(world.player.checkpoint.y);
    expect(creature.carriedSince).toBe(-1);
    // A death is no journey: it lets go where he reappeared, on the tick itself.
    expect(creature.travelUntil).toBe(-1);
    expect(creature.at).toBe(BUSH);
  });
});
