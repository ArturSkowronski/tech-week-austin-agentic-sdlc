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

/** Ticks the wand charge winds up before it moves; he is astride the wand (ADR-002). */
export const CHARGE_WINDUP_TICKS = 2;

/** Ticks the dash lasts, after the wind-up. */
export const CHARGE_TICKS = 14;

/** Speed of the dash in the facing direction, units per second. */
export const CHARGE_SPEED = 260;

/** Ticks he stands in the recoil after the crystal tip meets a wall. */
export const CHARGE_RECOIL_TICKS = 3;

/** Ticks after a charge during which attack does nothing. */
export const CHARGE_COOLDOWN_TICKS = 24;

/** Width of the charge hitbox at the crystal tip, in world units. */
export const CHARGE_HITBOX_WIDTH = 12;

/** Height of the charge hitbox at the crystal tip, in world units. */
export const CHARGE_HITBOX_HEIGHT = 8;

/** Ticks the landing state lasts; it locks no input. */
export const LAND_TICKS = 4;

/**
 * Falling this many ticks triggers the flail and the hard landing. A full
 * jump's descent is about 19 ticks, so flat ground never triggers it.
 */
export const LONG_FALL_TICKS = 20;

/** Ticks the wizard is invulnerable after being hurt. */
export const HURT_INVULN_TICKS = 30;

/** Player hitbox width, in world units. */
export const PLAYER_WIDTH = 12;

/** Player hitbox height, in world units. */
export const PLAYER_HEIGHT = 28;

/** Downward speed the water pulls him to while he is in it, units per second. */
export const WATER_PULL = 160;

/** What one tick in water leaves of his horizontal speed. */
export const WATER_DRAG = 0.85;

/**
 * How near the water he has to stand for it to part for him, in world units:
 * a tile and a half, measured across from the column. Standing beside a
 * waterfall is enough to read what falls behind it (bug-quest.md, evidence),
 * so the reveal is not only the touch that would drown him.
 */
export const WATER_NEAR = 1.5 * TILE;

/** Ticks each pose of the victory cast holds, ten of them a second. */
export const VICTORY_CAST_FRAME_TICKS = 6;

/**
 * The cast's pose the beam is drawn on, counting from the first: an idle, the
 * spin's four, the burst, then the beam (asset-list.md, the wizard's victory
 * row). It is a fact about the sheet, and it lives here because the tick
 * below is what the simulation ends the run by and is derived from it.
 */
export const VICTORY_CAST_BEAM_FRAME = 6;

/**
 * Ticks from touching the beacon to the beam reaching it, which is the tick
 * it lights on. Derived rather than tuned, so the cast the renderer plays and
 * the beacon the simulation lights cannot drift apart.
 */
export const VICTORY_CAST_HIT_TICKS = VICTORY_CAST_BEAM_FRAME * VICTORY_CAST_FRAME_TICKS;

/** Ticks the creature takes to run from one hiding place to the next. */
export const CREATURE_TRAVEL_TICKS = 30;

/** Ticks the creature rides the wizard before it lets go. */
export const CREATURE_CARRY_TICKS = 600;
