// The trace tool's map model (ADR-004, docs/plan/02-design/level-design.md).
// The round-trip runs on the glade's module as it stands in the repository,
// read as a file rather than imported, because what has to survive an edit is
// the module's own text: its header comment and every character of its map.
//
// Auto-trace is measured against a painting the test paints itself, one tile
// at a time, so "exactly the opaque tiles" is a set this file wrote down.

import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import forestGlade from '../../game/content/rooms/forest-glade';
import { parseRoom, Tile } from '../../game/sim';
import {
  autoTrace,
  blank,
  BRUSHES,
  EMPTY,
  fill,
  OVERWRITABLE,
  parse,
  resize,
  serialise,
  set,
  TILE_PX,
  widthOf,
  type Opacity,
} from '../../tools/trace/map';

const glade = readFileSync(new URL('../../game/content/rooms/forest-glade.ts', import.meta.url), 'utf8');

/** A painting of so many tiles, with the listed tiles painted solid. */
function painting(tilesWide: number, tilesTall: number, opaque: readonly (readonly [number, number])[]): Opacity {
  const width = tilesWide * TILE_PX;
  const height = tilesTall * TILE_PX;
  const alpha = new Uint8Array(width * height);

  for (const [x, y] of opaque) {
    for (let row = y * TILE_PX; row < (y + 1) * TILE_PX; row += 1) {
      alpha.fill(255, row * width + x * TILE_PX, row * width + (x + 1) * TILE_PX);
    }
  }

  return { width, height, alpha };
}

/** Every tile the map marks solid, as `x,y` pairs. */
function solidTiles(rows: readonly string[]): string[] {
  return rows.flatMap((row, y) => [...row].flatMap((char, x) => (char === '#' ? [`${x},${y}`] : [])));
}

describe('parse and serialise', () => {
  it('round-trips the glade, header and every character', () => {
    expect(serialise(parse(glade))).toBe(glade);
  });

  it('reads the map at the size the simulation reads the same room at', () => {
    const map = parse(glade);
    const { room } = parseRoom(forestGlade);

    expect(widthOf(map)).toBe(room.width);
    expect(map.rows).toHaveLength(room.height);
  });

  it('keeps the header when the map is edited', () => {
    const map = parse(glade);
    const edited = serialise(set(map, 0, 0, '#'));

    expect(edited.startsWith(map.header)).toBe(true);
    expect(edited).not.toBe(glade);
  });

  it('writes a room the tool started from scratch as a module the game can read', () => {
    const map = set(blank('cliff-ruins'), 3, 21, 'P');
    const { room } = parseRoom(parse(serialise(map)).rows.join('\n'));

    expect(serialise(parse(serialise(map)))).toBe(serialise(map));
    expect([room.width, room.height]).toEqual([80, 22]);
    expect(map.header).toContain('cliff-ruins');
  });
});

describe('set and fill', () => {
  const empty = resize(parse(''), 4, 3);

  it('paints one tile and leaves its neighbours alone', () => {
    expect(set(empty, 1, 1, '^').rows).toEqual(['    ', ' ^  ', '    ']);
  });

  it('ignores a tile off the map', () => {
    expect(set(empty, 4, 0, '#')).toBe(empty);
    expect(set(empty, 0, 3, '#')).toBe(empty);
  });

  it('paints a rectangle, clipped to the map', () => {
    expect(fill(empty, { x: 2, y: 1, w: 9, h: 9 }, '#').rows).toEqual(['    ', '  ##', '  ##']);
  });
});

describe('resize', () => {
  const map = fill(resize(parse(''), 3, 2), { x: 0, y: 0, w: 3, h: 1 }, '#');

  it('pads new tiles with air', () => {
    expect(resize(map, 5, 3).rows).toEqual(['###  ', '     ', '     ']);
  });

  it('drops the tiles past the new edge', () => {
    expect(resize(map, 2, 1).rows).toEqual(['##']);
  });
});

describe('autoTrace', () => {
  it('marks exactly the opaque tiles of a painting', () => {
    const opaque = [
      [0, 2],
      [1, 2],
      [3, 1],
      [3, 2],
    ] as const;
    const traced = autoTrace(resize(parse(''), 4, 3), painting(4, 3, opaque));

    expect(solidTiles(traced.rows)).toEqual(['3,1', '0,2', '1,2', '3,2']);
  });

  it('clears collision the painting no longer covers', () => {
    const drawn = fill(resize(parse(''), 2, 1), { x: 0, y: 0, w: 2, h: 1 }, '#');

    expect(autoTrace(drawn, painting(2, 1, [[1, 0]])).rows).toEqual([' #']);
  });

  it('keeps the props and the spawn, which no painting describes', () => {
    const dressed = set(set(resize(parse(''), 3, 1), 0, 0, 'P'), 2, 0, 'B');
    const covered = painting(3, 1, [
      [0, 0],
      [1, 0],
      [2, 0],
    ]);

    expect(autoTrace(dressed, covered).rows).toEqual(['P#B']);
  });

  it('keeps the header the module was parsed with', () => {
    expect(autoTrace(parse(glade), painting(80, 22, [])).header).toBe(parse(glade).header);
  });

  // The characters auto-trace overwrites are a copy of a legend game/sim/room.ts
  // owns and does not export (AGENTS.md rule 9). This holds the copy to that
  // parser over the whole character space, so a legend that grows a collision
  // character fails here rather than quietly surviving a trace.
  it('overwrites exactly what the simulation collides with, and air', () => {
    for (let code = 32; code < 127; code += 1) {
      const char = String.fromCodePoint(code);
      const { room } = parseRoom(`${char}\n#`);

      expect([char, OVERWRITABLE.includes(char)]).toEqual([char, char === ' ' || room.tiles[0] !== Tile.Empty]);
    }
  });
});

describe('brushes', () => {
  // The brush table names legend characters game/sim/room.ts owns privately in
  // PROP_CHARS, SPAWN_CHAR and collisionTile, and does not export (AGENTS.md
  // rule 9). The same probe trick auto-trace is held to runs the whole
  // printable range through the parser and asks what it made of each
  // character, so a legend that grows a prop with no brush fails here instead
  // of quietly having nothing to paint it with.
  it('offers a brush for exactly the characters the simulation gives a meaning to', () => {
    const painted = new Set(BRUSHES.map((entry) => entry.char));
    const air = parseRoom('.\n.\n#');

    for (let code = 32; code < 127; code += 1) {
      const char = String.fromCodePoint(code);
      const probe = parseRoom(`.\n${char}\n#`);
      // Air is the one brush the parser cannot speak for: erasing is painting
      // the empty tile, which is every character the legend does not name.
      const known =
        char === EMPTY ||
        probe.room.tiles[1] !== Tile.Empty ||
        probe.props.length > 0 ||
        probe.room.spawn.y !== air.room.spawn.y;

      expect([char, painted.has(char)]).toEqual([char, known]);
    }
  });

  it('flags every brush with its own colour', () => {
    expect(new Set(BRUSHES.map((entry) => entry.colour)).size).toBe(BRUSHES.length);
  });
});
