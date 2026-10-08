// The text-map legend of docs/plan/02-design/level-design.md, parsed in full:
// the collision grid, the spawn, and the props. game/sim/state.ts builds a
// world out of what this returns, so the legend is described once, here.
//
// A prop is a trigger box, never collision. Its cell is the tile its letter
// sits on and it stands on the tile below, growing up and to the right of that
// tile — which is also how the waterfall reads, anchored by the surface tile
// at its left edge.
//
// Tile ids are looked up inside a function on purpose: game/sim/state.ts
// imports this module, so reading `Tile` while this module's body evaluates
// would depend on which of the two was loaded first.
//
// The spawn tile is put into world units by `tileToWorld` of
// game/sim/checkpoint.ts, the one place that conversion lives (AGENTS.md rule
// 9). It was written out a second time here while HW-002 was planted in that
// function, to keep a planted bug out of the spawn the main suite asserts
// (rule 5); the plant was healed on 2026-10-08 (ADR-009, amendment) and the
// copy went with it.

import { tileToWorld } from './checkpoint';
import { TILE } from './constants';
import { Tile, type Prop, type PropKind, type Room, type Vec2 } from './state';

/** A prop cell in world units. */
export interface PropSize {
  w: number;
  /** Null for a prop that hangs from its own tile down to the room's bottom row. */
  h: number | null;
}

/**
 * Prop cell sizes, the single source the asset kit and the renderer share
 * (level-design.md). Sizes are in world units, a tile being 16.
 */
export const PROP_SIZE: Readonly<Record<PropKind, PropSize>> = {
  bush: { w: 32, h: 24 },
  log: { w: 48, h: 16 },
  rock: { w: 32, h: 24 },
  flag: { w: 16, h: 32 },
  beacon: { w: 32, h: 64 },
  torch: { w: 16, h: 32 },
  lantern: { w: 16, h: 32 },
  mushrooms: { w: 16, h: 16 },
  // Six tiles, the charge gap it fills. Its height is the drop to the bottom
  // row, which only the room it is parsed into knows.
  waterfall: { w: 96, h: null },
};

/** The legend's prop characters. `N` and `M` are lights with no trigger. */
const PROP_CHARS: Readonly<Record<string, PropKind>> = {
  B: 'bush',
  L: 'log',
  R: 'rock',
  F: 'flag',
  E: 'beacon',
  T: 'torch',
  W: 'waterfall',
  N: 'lantern',
  M: 'mushrooms',
};

/** The legend's player-spawn character. */
const SPAWN_CHAR = 'P';

/** A parsed text map: the grid the physics reads and the props it carries. */
export interface ParsedRoom {
  room: Room;
  props: Prop[];
}

/** The collision kind of a legend character; every other character is air. */
function collisionTile(char: string): Tile {
  switch (char) {
    case '#':
      return Tile.Solid;
    case '-':
      return Tile.OneWay;
    case '=':
      return Tile.OneWayHalf;
    case '^':
      return Tile.Spike;
    default:
      return Tile.Empty;
  }
}

/**
 * Place a prop on the tile below its letter. A prop with no fixed height — the
 * waterfall — hangs from its own tile instead, which is how the legend anchors
 * it by the surface tile at the water's left edge.
 */
function placeProp(id: number, kind: PropKind, tile: Vec2, roomHeight: number): Prop {
  const { w, h } = PROP_SIZE[kind];

  return {
    id,
    kind,
    x: tile.x * TILE,
    y: h === null ? tile.y * TILE : (tile.y + 1) * TILE - h,
    w,
    h: h ?? (roomHeight - tile.y) * TILE,
    hitTick: -1,
    active: false,
  };
}

/** The rows of a map, trailing blank lines dropped. */
function rowsOf(text: string): string[] {
  const rows = text.split('\n');

  while (rows.length > 0 && rows[rows.length - 1]?.trim() === '') {
    rows.pop();
  }

  return rows;
}

/**
 * Parse a text map into the room and its props. The same text always gives the
 * same room, which is what lets a recorded run replay anywhere.
 */
export function parseRoom(text: string): ParsedRoom {
  const rows = rowsOf(text);
  const height = rows.length;
  const width = rows.reduce((widest, row) => Math.max(widest, row.length), 0);
  const tiles = new Uint8Array(width * height);
  const props: Prop[] = [];
  let spawnTile: Vec2 = { x: 0, y: 0 };

  for (let ty = 0; ty < height; ty += 1) {
    const row = rows[ty] ?? '';

    for (let tx = 0; tx < width; tx += 1) {
      const char = row[tx] ?? ' ';
      const kind = PROP_CHARS[char];

      tiles[ty * width + tx] = collisionTile(char);

      if (char === SPAWN_CHAR) {
        spawnTile = { x: tx, y: ty };
      }

      if (kind !== undefined) {
        props.push(placeProp(props.length, kind, { x: tx, y: ty }, height));
      }
    }
  }

  return { room: { width, height, tiles, spawn: tileToWorld(spawnTile) }, props };
}
