// The geometry rules of docs/plan/02-design/level-design.md, read off the tile
// grid of every room in game/content/rooms/ — the glade alone, by ADR-009.
// Every ledge is reachable, no gap sits between what a jump clears and what
// the charge clears, a checkpoint flag stands behind the spawn and behind each
// charge gap, and the hiding places are on flat ground clear of the pits.
//
// This is a lint over the grid, not a simulation: a move is a pair of ledge
// tops within the jump and charge reaches of docs/plan/02-design/movement-and-physics.md
// with no rock between them. Whether the route plays is what the scripted
// playthrough in tests/sim/forest-room.test.ts proves.

import { describe, expect, it } from 'vitest';
import {
  HIDING_PLACES,
  parseRoom,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  Tile,
  tileAt,
  TILE,
} from '../../game/sim/index';
import type { Prop, Room, Vec2 } from '../../game/sim/index';
import { rooms } from '../../game/content/rooms/index';

/** Tiles a jump clears upward, so also the tallest climb a room may ask for. */
const JUMP_HEIGHT = 3;

/** Tiles of gap a plain jump clears at take-off height. */
const JUMP_REACH = 4;

/** Tiles of gap a jump and a wand charge above the surface clear. */
const CHARGE_REACH = 8;

/** The narrowest gap the charge is asked for; five is too close to call. */
const CHARGE_GAP = 6;

/** What "near the start" and "before the hazard" are read as: tiles a flag may stand back. */
const CHECKPOINT_REACH = 12;

/** Tiles a hiding place keeps between its footprint and the nearest pit. */
const PIT_CLEARANCE = 3;

/** The tiles that hold the wizard up. */
const SUPPORTS: readonly Tile[] = [Tile.Solid, Tile.OneWay, Tile.OneWayHalf];

/** A ledge top: air he fits in, head clear of rock, over something he can stand on. */
function isLedge(room: Room, x: number, y: number): boolean {
  return (
    tileAt(room, x, y) === Tile.Empty &&
    tileAt(room, x, y - 1) !== Tile.Solid &&
    SUPPORTS.includes(tileAt(room, x, y + 1))
  );
}

/** Every ledge top of a room, column by column. */
function ledgesOf(room: Room): Vec2[] {
  const ledges: Vec2[] = [];

  for (let x = 0; x < room.width; x += 1) {
    for (let y = 0; y < room.height; y += 1) {
      if (isLedge(room, x, y)) {
        ledges.push({ x, y });
      }
    }
  }

  return ledges;
}

/** The columns of air between two ledges; neighbours and a straight drop have none. */
function gapBetween(a: Vec2, b: Vec2): number {
  return Math.max(0, Math.abs(b.x - a.x) - 1);
}

/** No rock stands between two ledges, at the height a move from one to the other crosses. */
function isClear(room: Room, a: Vec2, b: Vec2): boolean {
  const lastColumn = Math.max(a.x, b.x);
  const topRow = Math.min(a.y, b.y) - 1;
  const bottomRow = Math.max(a.y, b.y);

  for (let x = Math.min(a.x, b.x) + 1; x < lastColumn; x += 1) {
    for (let y = topRow; y <= bottomRow; y += 1) {
      if (tileAt(room, x, y) === Tile.Solid) {
        return false;
      }
    }
  }

  return true;
}

/** The ledges a jump and a charge could carry him to, gap width aside. */
function withinReach(room: Room, a: Vec2, ledges: readonly Vec2[]): Vec2[] {
  return ledges.filter(
    (b) =>
      a.y - b.y <= JUMP_HEIGHT && gapBetween(a, b) <= CHARGE_REACH && isClear(room, a, b),
  );
}

/** A gap the player can be asked to cross: a jump's, or a charge's. */
function isCalled(gap: number): boolean {
  return gap <= JUMP_REACH || gap >= CHARGE_GAP;
}

/** Each ledge with another in reach further right, and the narrowest gap to one. */
function rightGapsOf(room: Room, ledges: readonly Vec2[]): { ledge: Vec2; gap: number }[] {
  const found: { ledge: Vec2; gap: number }[] = [];

  for (const ledge of ledges) {
    const gaps = withinReach(room, ledge, ledges)
      .filter((other) => other.x > ledge.x)
      .map((other) => gapBetween(ledge, other));

    if (gaps.length > 0) {
      found.push({ ledge, gap: Math.min(...gaps) });
    }
  }

  return found;
}

/** The ledges reachable from the spawn, walking, jumping and charging. */
function reachedFrom(room: Room, spawn: Vec2, ledges: readonly Vec2[]): Set<Vec2> {
  const reached = new Set<Vec2>([spawn]);
  // Pushing onto the list being iterated is what walks the frontier outward.
  const pending: Vec2[] = [spawn];

  for (const from of pending) {
    for (const to of withinReach(room, from, ledges)) {
      if (isCalled(gapBetween(from, to)) && !reached.has(to)) {
        reached.add(to);
        pending.push(to);
      }
    }
  }

  return reached;
}

/** The ledge the wizard spawns on; `tileToWorld` put his feet below it. */
function spawnTile(room: Room): Vec2 {
  return {
    x: Math.floor((room.spawn.x + PLAYER_WIDTH / 2) / TILE),
    y: Math.floor((room.spawn.y + PLAYER_HEIGHT - 1) / TILE),
  };
}

/** The columns a fall ends out of the room or in the water at the bottom of. */
function pitColumns(room: Room): number[] {
  const columns: number[] = [];

  for (let x = 0; x < room.width; x += 1) {
    if (tileAt(room, x, room.height - 1) !== Tile.Solid) {
      columns.push(x);
    }
  }

  return columns;
}

/** Where a prop stands, read off its own box: the row it sits on and the columns it covers. */
function footing(prop: Prop): { row: number; left: number; right: number } {
  const left = prop.x / TILE;

  return { row: (prop.y + prop.h) / TILE - 1, left, right: left + prop.w / TILE - 1 };
}

for (const [name, text] of Object.entries(rooms)) {
  describe(`${name}, against the geometry rules`, () => {
    const { room, props } = parseRoom(text);
    const ledges = ledgesOf(room);
    const rightGaps = rightGapsOf(room, ledges);
    const spawn = spawnTile(room);
    const pits = pitColumns(room);
    const flags = props.filter((prop) => prop.kind === 'flag').map((prop) => footing(prop).left);

    it('leaves no ledge the jump and the charge cannot reach from the spawn', () => {
      const reached = reachedFrom(room, spawn, ledges);

      expect(ledges.filter((ledge) => !reached.has(ledge))).toEqual([]);
    });

    it('asks for no gap wider than a jump and narrower than a charge', () => {
      expect(rightGaps.filter(({ gap }) => !isCalled(gap))).toEqual([]);
    });

    it('raises a checkpoint flag within reach of the spawn', () => {
      expect(flags.some((column) => Math.abs(column - spawn.x) <= CHECKPOINT_REACH)).toBe(true);
    });

    it('raises a checkpoint flag behind every gap that needs the charge', () => {
      const chargeGaps = rightGaps.filter(({ gap }) => gap > JUMP_REACH);

      expect(
        chargeGaps.filter(
          ({ ledge }) =>
            !flags.some((column) => column <= ledge.x && ledge.x - column <= CHECKPOINT_REACH),
        ),
      ).toEqual([]);
    });

    it('stands every hiding place on flat ground clear of the pits', () => {
      const hiding = props.filter((prop) => HIDING_PLACES.some((kind) => kind === prop.kind));
      const offences: string[] = [];

      for (const prop of hiding) {
        const { row, left, right } = footing(prop);

        for (let x = left - 1; x <= right + 1; x += 1) {
          if (!isLedge(room, x, row)) {
            offences.push(`the ${prop.kind} has no flat ground at column ${x}`);
          }
        }

        for (const pit of pits) {
          if (Math.max(left - pit, pit - right) < PIT_CLEARANCE) {
            offences.push(`the ${prop.kind} is too close to the pit at column ${pit}`);
          }
        }
      }

      expect(offences).toEqual([]);
    });
  });
}
