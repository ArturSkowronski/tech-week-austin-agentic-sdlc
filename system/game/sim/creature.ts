// The creature that carries the planted bug: hiding, riding, fleeing, letting
// go (docs/plan/02-design/bug-quest.md, the creature). It changes nothing in
// the world but its own record in `WorldState.creature` and the two events
// that say it was heard — the symptom is the defect itself, and the module the
// manifest names is what reads the flag.
//
// Its four situations are the four fields of `Creature`: hiding in a prop
// (`at`), riding the hat (`carriedSince`), running between two hiding places
// (`travelTo`, `travelUntil`), and not placed yet, which is what
// game/sim/state.ts builds and what the room's first tick resolves.

import { bugForRoom, HIDING_PLACES } from './bugs';
import {
  CREATURE_CARRY_TICKS,
  CREATURE_TRAVEL_TICKS,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
} from './constants';
import type { Box } from './physics';
import { charging } from './player';
import type { Creature, Prop, WorldState } from './state';

/** A fifth copy of the predicate game/sim/props.ts calls the same thing; see its note. */
function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** The wizard's hitbox, which is also where the creature is while it rides. */
function playerBox(state: WorldState): Box {
  return { x: state.player.x, y: state.player.y, w: PLAYER_WIDTH, h: PLAYER_HEIGHT };
}

/** Distance between the centres of two boxes. */
function between(a: Box, b: Box): number {
  return Math.hypot(a.x + a.w / 2 - (b.x + b.w / 2), a.y + a.h / 2 - (b.y + b.h / 2));
}

/** Can the creature sit in this prop? game/sim/bugs.ts owns the list of kinds. */
function hides(prop: Prop): boolean {
  return HIDING_PLACES.some((kind) => kind === prop.kind);
}

/**
 * The hiding place nearest the wizard, skipping the prop id `except`, or
 * undefined in a room with none. Ties go to the earlier prop, which is the
 * earlier one in the map's reading order, so the choice replays.
 */
function nearestHiding(state: WorldState, except?: number): Prop | undefined {
  const from = playerBox(state);
  let nearest: Prop | undefined;

  for (const prop of state.props) {
    if (prop.id === except || !hides(prop)) {
      continue;
    }

    if (nearest === undefined || between(from, prop) < between(from, nearest)) {
      nearest = prop;
    }
  }

  return nearest;
}

/**
 * Where a fresh creature starts: the first prop of the kind its room's bug
 * hides in, falling back to the room's first hiding place when the manifest
 * names no bug for the room — which is a clean manifest in the game, and
 * `createWorld`'s `creature` option in a test.
 *
 * The fallback is deliberate and it is not only the no-entry case: an entry
 * naming a kind its room has no prop of also seats the creature in the room's
 * first hiding place, so a mistyped `hides` still gives the player a creature
 * to find rather than a room with none. It is not a guarantee of the kind —
 * game/render/ticket.ts reads `hides` straight from the manifest, so in that
 * one case the card names a prop the creature is not in. Nothing checks the
 * pairing today (tools/bugs/check.ts pairs entries with tests, not `hides`
 * with rooms); a manifest that names a real room is HWP-052's to validate.
 */
function startingPlace(state: WorldState): Prop | undefined {
  const places = state.props.filter(hides);
  const kind = bugForRoom(state.roomName)?.creature.hides;

  return places.find((prop) => prop.kind === kind) ?? places[0];
}

/** Let go and run for `place`, arriving CREATURE_TRAVEL_TICKS later. */
function runTo(creature: Creature, tick: number, place: Prop): void {
  creature.at = -1;
  creature.carriedSince = -1;
  creature.travelTo = place.id;
  creature.travelUntil = tick + CREATURE_TRAVEL_TICKS;
}

/** The tick it rides the hat: a charge shakes it off, and so does CREATURE_CARRY_TICKS. */
function stepCarried(state: WorldState, creature: Creature): void {
  const place = nearestHiding(state);

  if (place === undefined) {
    return;
  }

  // A death is no journey. game/sim/checkpoint.ts has already computed the
  // respawn with the creature still aboard — which is what lets a planted
  // checkpoint bug be felt on that respawn — so it simply lets go where the
  // wizard reappeared.
  if (state.events.includes('death')) {
    creature.at = place.id;
    creature.carriedSince = -1;

    return;
  }

  if (charging(state.player) || state.tick - creature.carriedSince >= CREATURE_CARRY_TICKS) {
    runTo(creature, state.tick, place);
  }
}

/** The tick it sits in `hiding`: a charge hit sends it away, a walk-through mounts it. */
function stepHiding(state: WorldState, creature: Creature, hiding: Prop): void {
  // Only game/sim/charge-hit.ts stamps a bush, a log or a rock, so this tick's
  // stamp is the charge the design doc calls fleeing.
  if (hiding.hitTick === state.tick) {
    const away = nearestHiding(state, hiding.id);

    if (away !== undefined) {
      state.events.push('creature:out');
      runTo(creature, state.tick, away);
    }

    return;
  }

  // A wizard who charges without moving is shaken free of it for 31 ticks and
  // no more: the nearest hiding place is then the one he is standing in, so it
  // runs back under him and this remounts it on the tick after it arrives.
  // bug-quest.md says "the nearest hiding place" without qualification and the
  // 600-tick release still caps the ride, so a charge is a reprieve, not an
  // escape; walking away during the 30 is what makes it one.
  if (!charging(state.player) && overlaps(playerBox(state), hiding)) {
    state.events.push('creature:caught');
    creature.at = -1;
    creature.carriedSince = state.tick;
    creature.firstCarried = true;
  }
}

/**
 * One tick of the creature, taken after the props have had theirs so that a
 * death this tick has already been counted and repaid.
 */
export function stepCreature(state: WorldState): void {
  const creature = state.creature;

  if (creature === null) {
    return;
  }

  if (creature.travelUntil >= 0) {
    if (state.tick < creature.travelUntil) {
      return;
    }

    creature.at = creature.travelTo;
    creature.travelTo = -1;
    creature.travelUntil = -1;

    return;
  }

  if (creature.carriedSince >= 0) {
    stepCarried(state, creature);

    return;
  }

  // Not placed yet: `createCreature` starts it nowhere, and the room's first
  // tick is where it picks the hiding place the manifest names.
  if (creature.at < 0) {
    creature.at = startingPlace(state)?.id ?? -1;

    return;
  }

  const hiding = state.props[creature.at];

  if (hiding !== undefined) {
    stepHiding(state, creature, hiding);
  }
}
