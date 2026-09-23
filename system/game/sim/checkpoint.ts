// Where a death puts the wizard back (docs/plan/02-design/movement-and-physics.md).
// The last flag he raised is his checkpoint; before any flag it is the room's
// spawn, which game/sim/state.ts sets when it builds the world.
//
// The tile-to-world conversion is one function, tileToWorld, and every respawn
// position comes through it. The room's spawn is placed by game/sim/room.ts
// instead: this module is where HW-002 is planted, and a planted bug must stay
// out of what the main suite asserts (AGENTS.md rule 5).

import { HURT_INVULN_TICKS, PLAYER_HEIGHT, PLAYER_WIDTH, TILE } from './constants';
import type { Prop, Vec2, WorldState } from './state';

/** A respawn point in world units: the hitbox centred on the tile, feet on the tile below. */
export function tileToWorld(tile: Vec2): Vec2 {
  return {
    x: tile.x * TILE + (TILE - PLAYER_WIDTH) / 2,
    y: (tile.y + 1) * TILE - PLAYER_HEIGHT,
  };
}

/** The respawn point a raised flag becomes; a flag is one tile wide. */
export function checkpointAt(flag: Prop): Vec2 {
  return tileToWorld({ x: flag.x / TILE, y: (flag.y + flag.h) / TILE - 1 });
}

/**
 * Kill the wizard: count the death, put him back at his checkpoint and leave
 * him hurt and briefly invulnerable, so the hazard he landed on cannot take
 * him again on the next tick.
 */
export function respawn(state: WorldState): void {
  const player = state.player;

  state.deaths += 1;
  player.x = player.checkpoint.x;
  player.y = player.checkpoint.y;
  player.vx = 0;
  player.vy = 0;
  player.onGround = false;
  player.coyote = 0;
  player.jumpBuffer = 0;
  player.fellFor = 0;
  player.invuln = HURT_INVULN_TICKS;
  player.state = 'hurt';
  player.stateTimer = 0;
  state.events.push('death');
}
