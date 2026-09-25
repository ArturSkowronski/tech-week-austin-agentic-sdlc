// The trace tool's model of a room module (ADR-004,
// docs/plan/02-design/level-design.md, painting a room). A room is a text map
// of one character per tile in a module under game/content/rooms/, so editing
// one is editing a string: every function here takes a map and returns the
// next one, which is what makes the tool's undo a stack of these values.
//
// The module's header comment is what a reader meets first in a PR diff, so it
// is carried through an edit untouched rather than regenerated: the tool
// changes the map, never the prose about it.
//
// Nothing here touches the DOM or a file, so tests/tools/trace-map.test.ts
// drives the whole model, and tools/trace/main.ts is left with the drawing.

import { RENDER_DENSITY } from '../../game/render/config';
import { TILE } from '../../game/sim';

/** A room module taken apart: its header comment, and one string per tile row. */
export interface TraceMap {
  /** The module's leading block comment, verbatim and including its markers. */
  header: string;
  /** The map's rows, top to bottom, every one of them the same width. */
  rows: readonly string[];
}

/** A rectangle of tiles. */
export interface TileBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A painting's alpha channel, one byte per pixel, row by row. */
export interface Opacity {
  width: number;
  height: number;
  alpha: Uint8Array;
}

/**
 * A painting's tile in pixels: one 16-unit tile drawn at density 2 is 32.
 * tools/asset-kit/paintings.ts works the same number out for the other end of
 * the same pipeline; both derive it, and a later ticket should collapse them.
 */
export const TILE_PX = TILE * RENDER_DENSITY;

/**
 * The size the level design authors a room at: 80 columns of the beats table,
 * and the 22 rows every painting is fitted to (level-design.md, ADR-004).
 */
const NEW_ROOM = { width: 80, height: 22 };

/** The legend's empty tile, and the tile auto-trace lays down (level-design.md). */
export const EMPTY = ' ';
const SOLID = '#';

/**
 * What auto-trace may paint over: air, and the collision characters of the
 * legend. game/sim/room.ts is the legend's home and does not export the set,
 * so tests/tools/trace-map.test.ts holds this copy to what that parser calls
 * collision rather than letting the two drift (AGENTS.md rule 9).
 */
export const OVERWRITABLE = ' #-=^';

/** A pixel counts as painted when it is more opaque than not. */
const PAINTED = 128;

/** Fraction of a tile's pixels that must be painted for the tile to be solid. */
const COVERAGE = 0.5;

/** One legend character the tool paints with, and how it is flagged. */
export interface Brush {
  char: string;
  label: string;
  colour: string;
}

/**
 * The brush palette: the whole legend of level-design.md, with the colour each
 * character is flagged in. It lives beside the model rather than in the page so
 * tests/tools/trace-map.test.ts can hold it to what game/sim/room.ts actually
 * gives a meaning to — that legend is owned there and not exported, so the one
 * guard against a character growing in it and having no brush is the probe the
 * test runs (AGENTS.md rule 9). How much of the room a brush covers is still
 * not written down here; the page asks the parser for the prop's footprint.
 */
export const BRUSHES: readonly Brush[] = [
  { char: EMPTY, label: 'erase', colour: '#000000' },
  { char: SOLID, label: 'solid', colour: '#6f7d92' },
  { char: '-', label: 'one-way', colour: '#59b36b' },
  { char: '=', label: 'one-way half', colour: '#3f8f57' },
  { char: '^', label: 'spike', colour: '#d1495b' },
  { char: 'P', label: 'spawn', colour: '#4fc3f7' },
  { char: 'B', label: 'bush', colour: '#4c8c4a' },
  { char: 'L', label: 'log', colour: '#9c6b3f' },
  { char: 'R', label: 'rock', colour: '#8a8378' },
  { char: 'F', label: 'flag', colour: '#e6b422' },
  { char: 'E', label: 'beacon', colour: '#ffd479' },
  { char: 'T', label: 'torch', colour: '#ef8354' },
  { char: 'W', label: 'waterfall', colour: '#3aa6c8' },
  { char: 'N', label: 'lantern', colour: '#f3c969' },
  { char: 'M', label: 'mushrooms', colour: '#b48ead' },
];

/** The module's leading block comment. */
const HEADER = /^\/\*\*[\s\S]*?\*\//;

/** One row of the map, as the module writes it: an indented quoted string. */
const ROW = /^ *'(.*)',?$/gm;

/** How wide the map is; every row is padded to this. */
export function widthOf(map: TraceMap): number {
  return map.rows[0]?.length ?? 0;
}

/** Rows padded to the widest of them, so every tile has a character. */
function padded(rows: readonly string[]): string[] {
  const width = rows.reduce((widest, row) => Math.max(widest, row.length), 0);
  return rows.map((row) => row.padEnd(width));
}

/**
 * A room module read back into a map. Anything the module says outside its
 * header and its rows — the `export default` around them — is the same in
 * every room and is written again by `serialise`.
 */
export function parse(source: string): TraceMap {
  return {
    header: HEADER.exec(source)?.[0] ?? '',
    rows: padded([...source.matchAll(ROW)].map((row) => row[1] ?? '')),
  };
}

/** The map back as a room module, ready for game/content/rooms/. */
export function serialise(map: TraceMap): string {
  const rows = map.rows.map((row) => `  '${row}',`).join('\n');

  return `${map.header}\n\nexport default [\n${rows}\n].join('\\n');\n`;
}

/** The map at a new size: new tiles are empty, tiles past the edge are dropped. */
export function resize(map: TraceMap, width: number, height: number): TraceMap {
  const rows = Array.from({ length: height }, (_, y) => (map.rows[y] ?? '').slice(0, width).padEnd(width, EMPTY));

  return { ...map, rows };
}

/**
 * A room the glob has no module for yet: empty, at the size rooms are authored
 * at, under a header for whoever traces it. Every other room's header says
 * what the beats of the room are, and this one asks for the same.
 */
export function blank(room: string): TraceMap {
  const header = [
    '/**',
    ` * ${room}. Text map, see game/sim/room.ts for the legend.`,
    ' * Traced over the room painting with tools/trace (ADR-004): the painting is',
    ' * the source of truth for the look, this map for what the wizard collides',
    ' * with. Say here what the beats of the room are before it is played.',
    ' */',
  ].join('\n');

  return resize({ header, rows: [] }, NEW_ROOM.width, NEW_ROOM.height);
}

/** One tile painted with a legend character. A tile off the map is no tile. */
export function set(map: TraceMap, x: number, y: number, char: string): TraceMap {
  const row = map.rows[y];

  if (row === undefined || x < 0 || x >= row.length) {
    return map;
  }

  return { ...map, rows: map.rows.map((old, at) => (at === y ? `${row.slice(0, x)}${char}${row.slice(x + 1)}` : old)) };
}

/** A rectangle of tiles painted with one character, clipped to the map. */
export function fill(map: TraceMap, box: TileBox, char: string): TraceMap {
  let filled = map;

  for (let y = box.y; y < box.y + box.h; y += 1) {
    for (let x = box.x; x < box.x + box.w; x += 1) {
      filled = set(filled, x, y, char);
    }
  }

  return filled;
}

/** How much of the tile at these coordinates the painting covers, from 0 to 1. */
function coverage(painting: Opacity, x: number, y: number): number {
  let painted = 0;

  for (let row = y * TILE_PX; row < (y + 1) * TILE_PX; row += 1) {
    for (let column = x * TILE_PX; column < (x + 1) * TILE_PX; column += 1) {
      if ((painting.alpha[row * painting.width + column] ?? 0) >= PAINTED) {
        painted += 1;
      }
    }
  }

  return painted / (TILE_PX * TILE_PX);
}

/**
 * The first pass over a painting: every tile the art covers becomes solid and
 * every tile it does not becomes air. Props and the spawn stay where they were
 * put — the painting says nothing about them — so a trace can be run again
 * after the map has been dressed, and the edges are then fixed by hand with
 * the legend brushes (level-design.md, painting a room).
 */
export function autoTrace(map: TraceMap, painting: Opacity): TraceMap {
  const rows = map.rows.map((row, y) =>
    [...row]
      .map((char, x) => {
        if (!OVERWRITABLE.includes(char)) {
          return char;
        }

        return coverage(painting, x, y) >= COVERAGE ? SOLID : EMPTY;
      })
      .join(''),
  );

  return { ...map, rows };
}
