// The shape of the world and the two pure functions that read and advance the
// bits of it that are not physics: tileAt and nextRandom
// (docs/plan/02-design/simulation-architecture.md).
//
// Nothing here uses Date, Math.random, timers or the DOM: the simulation is a
// pure function of its state and the input frames it is given, so a recorded
// session replays tick for tick anywhere.

import { NO_INPUT, type InputFrame } from './input';
import { parseRoom } from './room';

/** A point in world units. */
export interface Vec2 {
  x: number;
  y: number;
}

/**
 * The collision kinds a tile can have. The text-map legend that produces them
 * is in game/sim/room.ts (docs/plan/02-design/level-design.md).
 */
export const Tile = {
  /** Air. */
  Empty: 0,
  /** `#`, blocks from every side. */
  Solid: 1,
  /** `-`, blocks only a box moving down that was above its top. */
  OneWay: 2,
  /** `=`, a one-way whose surface is half a tile lower. */
  OneWayHalf: 3,
  /** `^`, reports a hazard; the caller kills. */
  Spike: 4,
} as const;

/** One of the {@link Tile} ids. */
export type Tile = (typeof Tile)[keyof typeof Tile];

/** The tile grid of one room, row-major, plus where the wizard starts. */
export interface Room {
  width: number;
  height: number;
  /** `width * height` {@link Tile} ids, row-major, rows top to bottom. */
  tiles: Uint8Array;
  /** Top-left of the player hitbox on a fresh run. */
  spawn: Vec2;
}

/** The states of the player state machine (movement-and-physics.md). */
export type PlayerState =
  | 'idle'
  | 'run'
  | 'jump'
  | 'fall'
  | 'charge'
  | 'chargeRecoil'
  | 'land'
  | 'hurt'
  | 'victory';

/** The wizard. Position is the top-left of the hitbox, velocity is per second. */
export interface Player {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 1 facing right, -1 facing left. */
  facing: 1 | -1;
  state: PlayerState;
  /** Ticks spent in the current state; drives every animation. */
  stateTimer: number;
  onGround: boolean;
  /** Ticks of coyote time left after walking off a ledge. */
  coyote: number;
  /** Ticks a remembered jump press stays buffered. */
  jumpBuffer: number;
  /** Was jump held on the previous tick — the jump cut reads this. */
  jumpHeld: boolean;
  /** Ticks until the wand charge is available again. */
  chargeCooldown: number;
  /** Ticks of invulnerability left after being hurt. */
  invuln: number;
  /** Ticks spent falling; the long fall threshold reads this. */
  fellFor: number;
  /** The `y` of the ground he last stood on; a drop past it is a fall, not a hop. */
  leftGroundY: number;
  /** Where a death respawns the wizard: the last raised flag, or the spawn. */
  checkpoint: Vec2;
}

/** The prop kinds of the text-map legend (level-design.md). */
export type PropKind =
  | 'bush'
  | 'log'
  | 'rock'
  | 'flag'
  | 'beacon'
  | 'torch'
  | 'lantern'
  | 'mushrooms'
  | 'waterfall';

/** A prop in the room. Props are overlap triggers, never collision. */
export interface Prop {
  /** Index in `WorldState.props`; the creature's `at` points at it. */
  id: number;
  kind: PropKind;
  /** Top-left in world units. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Tick this prop was last hit or entered, -1 while untouched. */
  hitTick: number;
  /** Raised flag, opened rock, lit beacon, parted water. */
  active: boolean;
}

/** The creature that carries the planted bug (bug-quest.md). */
export interface Creature {
  /** Prop id it hides in; -1 while carried or travelling. */
  at: number;
  /** Prop id it is running to; -1 when it is not travelling. */
  travelTo: number;
  /** Tick the travel ends; -1 when it is not travelling. */
  travelUntil: number;
  /** Tick it jumped on the wizard's hat; -1 when it is not carried. */
  carriedSince: number;
  /** Has the bug been felt yet? The ticket card reads this. */
  firstCarried: boolean;
}

/**
 * The whole world. Every field is required, and `tick(state, input)` is the
 * only function that changes any of them.
 */
export interface WorldState {
  /** The room's file name. */
  roomName: string;
  /** Ticks since the run started. */
  tick: number;
  /** The seed the run was created with. */
  seed: number;
  /** The generator's current word; see {@link nextRandom}. */
  rng: number;
  room: Room;
  player: Player;
  props: Prop[];
  /** The room's creature, or null in a world built without one. */
  creature: Creature | null;
  deaths: number;
  /** Tick the beacon was reached, -1 until then; the run clock stops here. */
  victoryTick: number;
  /** Strings emitted this tick, cleared every tick; read by audio and particles. */
  events: string[];
  /** The frame applied this tick. */
  lastInput: InputFrame;
}

/** Options for {@link createWorld}. */
export interface CreateWorldOptions {
  /** Seed of the run's generator; the same seed replays the same world. */
  seed?: number;
  /** Build the world with a creature. The bug manifest decides in the game. */
  creature?: boolean;
  /** The room's file name, for `WorldState.roomName`. */
  roomName?: string;
}

/**
 * Zero is a fixed point of xorshift32, so a zero seed would produce zeroes
 * forever. Seed zero uses this word instead — the golden-ratio constant, an
 * arbitrary non-zero choice.
 */
const ZERO_SEED_WORD = 0x9e37_79b9;

/** Divisor that turns an unsigned 32-bit word into a fraction below one. */
const WORD_RANGE = 0x1_0000_0000;

/**
 * The room's beacon, the one prop every room ends at
 * (docs/plan/02-design/level-design.md). A room places exactly one, so which
 * prop that is has one home here rather than a copy in every reader of it
 * (AGENTS.md rule 9): the simulation lights it when the victory cast's beam
 * lands on it, and the completion banner is up for as long as it is lit.
 */
export function beaconOf(state: WorldState): Prop | undefined {
  return state.props.find((prop) => prop.kind === 'beacon');
}

/**
 * The tile at a tile coordinate, which is what the room's map draws there.
 * Coordinates outside the room draw nothing and read as empty; whether they
 * stop a box is a different question, and {@link blocksSideways} answers it.
 */
export function tileAt(room: Room, tx: number, ty: number): Tile {
  if (tx < 0 || ty < 0 || tx >= room.width || ty >= room.height) {
    return Tile.Empty;
  }

  return (room.tiles[ty * room.width + tx] ?? Tile.Empty) as Tile;
}

/**
 * Does this coordinate stop a box moving sideways? Solid tiles do, and so do
 * the columns outside the room: room edges are walls and never exits
 * (docs/plan/02-design/level-design.md), so the sides hold in every room
 * rather than in each map that remembers to draw them. This is the one
 * statement of that rule (AGENTS.md rule 9), read by the horizontal sweeps in
 * game/sim/physics.ts and game/sim/charge-hit.ts.
 *
 * Only this axis is closed. The vertical sweep reads `tileAt` instead, because
 * above the room is air and a fall out of the bottom is the water death.
 *
 * An outside column is a wall like any other, so it carries the same
 * precondition a solid tile does: a box may never *start* on one. A box that
 * already overlaps column -1 is pushed further out rather than back in, the
 * same way one that starts inside a solid is. `moveBox` in game/sim/physics.ts
 * states that contract; anything that places a box directly, rather than
 * moving it through `moveBox`, owes it a position inside the room.
 */
export function blocksSideways(room: Room, tx: number, ty: number): boolean {
  return tx < 0 || tx >= room.width || tileAt(room, tx, ty) === Tile.Solid;
}

/**
 * The next random number, a fraction in [0, 1). A 32-bit xorshift over
 * `state.rng`: the only randomness the simulation has, so the sequence belongs
 * to the run and replays with it.
 */
export function nextRandom(state: WorldState): number {
  let word = state.rng >>> 0;

  word ^= word << 13;
  word >>>= 0;
  word ^= word >>> 17;
  word ^= word << 5;
  word >>>= 0;

  state.rng = word;

  return word / WORD_RANGE;
}

/** A creature that has not been found yet: hiding, but not placed in a prop. */
function createCreature(): Creature {
  return { at: -1, travelTo: -1, travelUntil: -1, carriedSince: -1, firstCarried: false };
}

/**
 * Build a world from a text map. The same text and the same seed always give
 * the same world, so two runs of the same recorded frames stay identical.
 */
export function createWorld(roomText: string, options: CreateWorldOptions = {}): WorldState {
  const { room, props } = parseRoom(roomText);
  const spawn = room.spawn;

  const seed = (options.seed ?? 1) >>> 0;

  return {
    roomName: options.roomName ?? '',
    tick: 0,
    seed,
    rng: seed === 0 ? ZERO_SEED_WORD : seed,
    room,
    player: {
      x: spawn.x,
      y: spawn.y,
      vx: 0,
      vy: 0,
      facing: 1,
      state: 'idle',
      stateTimer: 0,
      onGround: false,
      coyote: 0,
      jumpBuffer: 0,
      jumpHeld: false,
      chargeCooldown: 0,
      invuln: 0,
      fellFor: 0,
      leftGroundY: spawn.y,
      checkpoint: { x: spawn.x, y: spawn.y },
    },
    props,
    creature: options.creature === true ? createCreature() : null,
    deaths: 0,
    victoryTick: -1,
    events: [],
    lastInput: NO_INPUT,
  };
}
