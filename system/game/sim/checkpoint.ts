// Where a death puts the wizard back (docs/plan/02-design/movement-and-physics.md).
// The last flag he raised is his checkpoint; before any flag it is the room's
// spawn, which game/sim/state.ts sets when it builds the world.
//
// The flag's tile is converted at the death rather than at the raising; the
// spawn is placed by game/sim/room.ts and is taken as it stands. The creature
// only rides the hat and takes up no ground of its own, so the tile he comes
// back on is the same one whether or not it is aboard: HW-002, the planted
// shift of one tile while it rode, was healed on main when Season 1 settled on
// one planted bug (ADR-009, amended 2026-10-08), and
// tests/sim/checkpoint-carried.test.ts keeps it healed.

import { HURT_INVULN_TICKS, PLAYER_HEIGHT, PLAYER_WIDTH, TILE } from './constants';
import type { Prop, Vec2, WorldState } from './state';

/**
 * A standing point in world units: the hitbox centred on the tile, feet on the
 * tile below. The one place the conversion lives (AGENTS.md rule 9) — a death
 * sends him back through it, and game/sim/room.ts places the room's spawn with
 * it, so the spawn and a checkpoint cannot drift apart.
 */
export function tileToWorld(tile: Vec2): Vec2 {
  return {
    x: tile.x * TILE + (TILE - PLAYER_WIDTH) / 2,
    y: (tile.y + 1) * TILE - PLAYER_HEIGHT,
  };
}

/** The tile a flag stands on; a flag is one tile wide. */
function flagTile(flag: Prop): Vec2 {
  return { x: flag.x / TILE, y: (flag.y + flag.h) / TILE - 1 };
}

/** The respawn point a raised flag becomes, as game/sim/props.ts records it on the raise. */
export function checkpointAt(flag: Prop): Vec2 {
  return tileToWorld(flagTile(flag));
}

/**
 * The flag he raised last, or undefined while the spawn is still his
 * checkpoint. The flag rather than `player.checkpoint`, because the recorded
 * checkpoint is already converted and the death converts the tile again.
 *
 * Two flags raised on the same tick are broken the way game/sim/props.ts
 * breaks them — the last of them in prop order is the one `raiseFlag` leaves
 * in `player.checkpoint` — so the death and the record cannot name different
 * flags (AGENTS.md rule 9).
 */
function lastFlag(state: WorldState): Prop | undefined {
  let last: Prop | undefined;

  for (const prop of state.props) {
    if (prop.kind === 'flag' && prop.active && (last === undefined || prop.hitTick >= last.hitTick)) {
      last = prop;
    }
  }

  return last;
}

/**
 * Kill the wizard: count the death, put him back at his checkpoint and leave
 * him hurt and briefly invulnerable, so the hazard he landed on cannot take
 * him again on the next tick.
 */
export function respawn(state: WorldState): void {
  const player = state.player;
  const flag = lastFlag(state);
  const back = flag === undefined ? player.checkpoint : tileToWorld(flagTile(flag));

  state.deaths += 1;
  player.x = back.x;
  player.y = back.y;
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
