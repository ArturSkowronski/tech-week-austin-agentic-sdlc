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

/** One room of a level: the name it is known by and the text map it is built from. */
export interface LevelRoom {
  name: string;
  text: string;
}

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
  /**
   * The rooms this run plays, in the order they are chained, as
   * game/content/order.ts lists them (docs/plan/02-design/level-design.md).
   * A run of one room ends at that room's beacon.
   */
  level: readonly LevelRoom[];
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
  /** The rooms to chain this run through; see {@link WorldState.level}. */
  level?: readonly LevelRoom[];
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
 * The tile at a tile coordinate. Coordinates outside the room read as empty:
 * a room's walls are tiles it draws itself, and leaving the room is a death the
 * caller handles, not a collision.
 */
export function tileAt(room: Room, tx: number, ty: number): Tile {
  if (tx < 0 || ty < 0 || tx >= room.width || ty >= room.height) {
    return Tile.Empty;
  }

  return (room.tiles[ty * room.width + tx] ?? Tile.Empty) as Tile;
}

/**
 * The room the run walks into when it lights this room's beacon, or undefined
 * when the beacon ends the run: the last room of a level, and a world built
 * with no level at all, which is what a test that only wants one room builds.
 */
export function nextLevelRoom(state: WorldState): LevelRoom | undefined {
  const at = state.level.findIndex((room) => room.name === state.roomName);

  return at < 0 ? undefined : state.level[at + 1];
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
    level: options.level ?? [],
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
