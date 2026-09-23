// Every number of the tuning table in docs/plan/02-design/movement-and-physics.md,
// the single source for it. World units and seconds at 60 Hz (ADR-003): a tile is
// 16 units. The table is frozen — changing a value here is a design decision, and
// the replay tests under tests/sim/ assert against these names, never literals.

/** Simulation rate in ticks per second. */
export const TICK_RATE = 60;

/** Seconds one tick advances the world. */
export const DT = 1 / 60;

/** Side of one tile, in world units. */
export const TILE = 16;

/** Top speed of a run, units per second. */
export const RUN_SPEED = 110;

/** Ground acceleration towards the wanted speed, units per second squared. */
export const GROUND_ACCEL = 900;

/** Ground deceleration with no input, units per second squared. */
export const GROUND_DECEL = 1300;

/** Acceleration while airborne, units per second squared. */
export const AIR_ACCEL = 600;

/** Downward acceleration, units per second squared. */
export const GRAVITY = 1200;

/** Fastest fall, units per second. */
export const TERMINAL_VELOCITY = 380;

/** Upward speed a jump starts with — about three and a third tiles when held. */
export const JUMP_VELOCITY = -370;

/** Releasing jump while rising clamps upward speed to this. */
export const JUMP_CUT_VELOCITY = -120;

/** Ticks after leaving a ledge during which a jump still works. */
export const COYOTE_TICKS = 6;

/** Ticks before landing during which a jump press is remembered. */
export const JUMP_BUFFER_TICKS = 6;

/** Ticks the landing state lasts; it locks no input. */
export const LAND_TICKS = 4;

/**
 * Falling this many ticks triggers the flail and the hard landing. A full
 * jump's descent is about 19 ticks, so flat ground never triggers it.
 */
export const LONG_FALL_TICKS = 20;

/** Player hitbox width, in world units. */
export const PLAYER_WIDTH = 12;

/** Player hitbox height, in world units. */
export const PLAYER_HEIGHT = 28;
