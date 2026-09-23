// The props' half of a tick: the overlap triggers of the level design legend
// and the hazards that kill (docs/plan/02-design/level-design.md,
// movement-and-physics.md). Props are never collision; only tiles stop the
// wizard, and these boxes only notice him.
//
// The charge's own stamping lives in game/sim/charge-hit.ts. What is left here
// is what the player box touches, and what touching it costs him.

import { checkpointAt, respawn } from './checkpoint';
import { PLAYER_HEIGHT, PLAYER_WIDTH, TILE } from './constants';
import type { Box } from './physics';
import { charging } from './player';
import { Tile, tileAt, type Prop, type Room, type WorldState } from './state';
import { inWater } from './water';

// `overlaps` and `covers` below are one of four copies of predicates
// game/sim/charge-hit.ts, game/sim/water.ts and game/sim/physics.ts
// (`coveredTiles`) also keep privately. Their one home is physics.ts, next to
// `Box`; moving them there is a change to three more modules than this ticket
// owns, so the next sim ticket that touches physics.ts should take them
// (AGENTS.md rule 9).

/** Do two boxes share any area? */
function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Does the box cover a tile of this kind? */
function covers(room: Room, box: Box, kind: Tile): boolean {
  const firstX = Math.floor(box.x / TILE);
  const lastX = Math.ceil((box.x + box.w) / TILE) - 1;
  const lastY = Math.ceil((box.y + box.h) / TILE) - 1;

  for (let ty = Math.floor(box.y / TILE); ty <= lastY; ty += 1) {
    for (let tx = firstX; tx <= lastX; tx += 1) {
      if (tileAt(room, tx, ty) === kind) {
        return true;
      }
    }
  }

  return false;
}

/** Raise a flag the wizard walked into; it is his checkpoint from now on. */
function raiseFlag(state: WorldState, flag: Prop): void {
  if (flag.active) {
    return;
  }

  flag.active = true;
  flag.hitTick = state.tick;
  state.player.checkpoint = checkpointAt(flag);
  state.events.push('flag:raised');
}

/**
 * Light the beacon and end the run. HWP-046 makes this the hand-over to the
 * next room for every room but the last; until the order table exists, every
 * beacon is the end.
 */
function lightBeacon(state: WorldState, beacon: Prop): void {
  beacon.active = true;
  beacon.hitTick = state.tick;
  state.victoryTick = state.tick;
  state.events.push('victory');
}

/**
 * Hold the wizard in victory. The run is over, so this outlasts every state
 * game/sim/player.ts puts him in, and the state table's "any except victory"
 * means nothing can kill him any more.
 *
 * The speed he arrived with goes too, so a held `right` does not keep him
 * running past the beacon. It cannot be a full stop from here: game/sim/player.ts
 * still steps him on foot every tick, so he creeps a quarter of a unit a tick
 * while the button is down. Making `victory` a state that moves him not at all
 * belongs with the hand-over to the next room, HWP-046.
 */
function holdVictory(state: WorldState): void {
  state.player.state = 'victory';
  state.player.stateTimer = state.tick - state.victoryTick;
  state.player.vx = 0;
  state.player.vy = 0;
}

/**
 * What kills him: spikes under the box, the bottom of the water, or having
 * fallen clean out of the room. A room's sides are walls, never exits, so only
 * its floor can be left. Whether he is in water is game/sim/water.ts's to say.
 */
function killing(state: WorldState, box: Box): boolean {
  return (
    covers(state.room, box, Tile.Spike) ||
    box.y >= state.room.height * TILE ||
    (inWater(state) && box.y + box.h > (state.room.height - 1) * TILE)
  );
}

/** One tick of the props and the hazards, after the wizard has moved. */
export function stepProps(state: WorldState): void {
  const player = state.player;

  if (state.victoryTick >= 0) {
    holdVictory(state);

    return;
  }

  const box: Box = { x: player.x, y: player.y, w: PLAYER_WIDTH, h: PLAYER_HEIGHT };

  for (const prop of state.props) {
    // A cracked rock opens on a charge hit, the only thing that stamps it.
    if (prop.kind === 'rock' && prop.hitTick >= 0) {
      prop.active = true;
    }

    if (!overlaps(box, prop)) {
      continue;
    }

    switch (prop.kind) {
      case 'flag':
        raiseFlag(state, prop);
        break;
      case 'beacon':
        lightBeacon(state, prop);
        holdVictory(state);

        return;
    }
  }

  player.invuln = Math.max(0, player.invuln - 1);

  // ADR-002 grants no vulnerability during the charge (wand-charge.md, and the
  // tuning table's "Vulnerability during charge | none"), so the wand's own
  // predicate answers "can he be hurt right now" rather than a second copy of
  // that rule living here. The hazard is still under him when the wand lets go:
  // the tick he dismounts on is the one that kills him.
  if (player.invuln === 0 && !charging(player) && killing(state, box)) {
    respawn(state);
  }
}
