// Which atlas tile a cell of a map shows (rendering-and-look.md, tiles). The
// rules are read off the shipped glade as well as off small maps, because the
// ticket's acceptance is about that room: a corner at every ledge end and no
// cell of ground left undrawn — and which way round each cell draws it.
// Drawing the sprites needs a browser and is covered in tests/smoke/room.spec.ts.

import { describe, expect, it } from 'vitest';

import forestGlade from '../../game/content/rooms/forest-glade';
import { TILE_ORDER, type TileName } from '../../game/content/tile-order';
import { TILE_SCATTER, TILE_TURN } from '../../game/render/config';
import { EARTH_ROWS, EDGE_QUARTER, tileArt, tileTurn } from '../../game/render/tiles';
import { parseRoom, Tile, tileAt, type Room } from '../../game/sim';
import { worldFrom } from '../sim/helpers';

const GLADE = parseRoom(forestGlade).room;

/** The share of ground a scatter may cover before it is paving, or bareness. */
const SCATTERED = { least: 0.1, most: 0.4 };

/** Every cell of a room, left to right and top to bottom. */
function* cells(room: Room): Generator<{ x: number; y: number; tile: Tile }> {
  for (let y = 0; y < room.height; y += 1) {
    for (let x = 0; x < room.width; x += 1) {
      yield { x, y, tile: tileAt(room, x, y) };
    }
  }
}

/** How many cells of a room each atlas tile is drawn on. */
function tally(room: Room): Map<string, number> {
  const counts = new Map<string, number>();

  for (const { x, y } of cells(room)) {
    const name = tileArt(room, x, y);

    if (name !== undefined) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }

  return counts;
}

describe('the tile a cell of a map shows', () => {
  it('draws every cell of ground and nothing where the map is air', () => {
    for (const { x, y, tile } of cells(GLADE)) {
      const name = tileArt(GLADE, x, y);

      if (tile === Tile.Empty) {
        expect(name).toBeUndefined();
      } else {
        expect(TILE_ORDER).toContain(name);
      }
    }
  });

  it('puts a corner at every ledge end of the glade, and moss everywhere between', () => {
    for (const { x, y, tile } of cells(GLADE)) {
      const surface = tile === Tile.Solid && tileAt(GLADE, x, y - 1) !== Tile.Solid;

      if (!surface) continue;

      const end =
        tileAt(GLADE, x - 1, y) !== Tile.Solid || tileAt(GLADE, x + 1, y) !== Tile.Solid;

      if (end) {
        expect(tileArt(GLADE, x, y)).toMatch(/^grass-corner-/);
      } else {
        expect(tileArt(GLADE, x, y)).toBe('grass-top');
      }
    }
  });

  it('turns the ledge end it is at into the corner that faces the open side', () => {
    const { room } = worldFrom(`
      P
      ###
    `);

    expect(tileArt(room, 0, 1)).toBe('grass-corner-left');
    expect(tileArt(room, 1, 1)).toBe('grass-top');
    expect(tileArt(room, 2, 1)).toBe('grass-corner-right');
  });

  it('gives a ledge one tile wide the left corner, the atlas having no both-ends piece', () => {
    const { room } = worldFrom(`
      P
      #
      ###
    `);

    // Open on both sides: game/render/tiles.ts picks the left corner on
    // purpose, so the cell reads as a ledge end rather than as ground that
    // runs on. Neither shipped room has such a run; a hand-authored map may.
    expect(tileArt(room, 0, 1)).toBe('grass-corner-left');
  });

  it('lays two rows of earth under the moss and stone under those', () => {
    const { room } = worldFrom(`
      P
      ####
      ####
      ####
      ####
      ####
    `);
    const column = [1, 2, 3, 4, 5].map((y) => tileArt(room, 1, y));

    expect(column).toEqual([
      'grass-top',
      expect.stringMatching(/^earth/),
      expect.stringMatching(/^earth/),
      expect.stringMatching(/^(stone|mossy-stone)$/),
      expect.stringMatching(/^(stone|mossy-stone)$/),
    ]);
  });

  it('fringes an earth row that stands open at a side with the moss surface', () => {
    const { room } = worldFrom(`
      P
      ####
      ####
      ####
      ####
      ####
    `);

    // Rows 2 and 3 are the earth; the atlas has no earth side piece, so the
    // cells at either end of them show the surface tile instead and
    // `tileTurn` below turns it to face the open side.
    expect(tileArt(room, 0, 2)).toBe('grass-top');
    expect(tileArt(room, 0, 3)).toBe('grass-top');
    expect(tileArt(room, 3, 2)).toBe('grass-top');
    expect(tileArt(room, 3, 3)).toBe('grass-top');
    expect(tileArt(room, 1, 2)).toMatch(/^earth/);
    expect(tileArt(room, 2, 3)).toMatch(/^earth/);
  });

  it('edges the stone where the ground stands open at its side', () => {
    const { room } = worldFrom(`
      P
      ###
      ###
      ###
      ###
    `);

    expect(tileArt(room, 0, 4)).toBe('stone-edge-left');
    expect(tileArt(room, 2, 4)).toBe('stone-edge-right');
  });

  it('scatters the roots through the earth and the mossy blocks through the stone', () => {
    const drawn = tally(GLADE);
    const found = (name: string): number => drawn.get(name) ?? 0;
    const roots = found('earth-roots');
    const moss = found('mossy-stone');

    // The band this asserts is the property the name claims — neither one in
    // every cell nor none at all — and not the exact share, which is a hash
    // over one room's positions and is free to drift when the map is edited.
    // config.ts asks for a quarter and a fifth; anything from a tenth to two
    // fifths of the ground is scattered rather than paved or bare.
    expect(TILE_SCATTER.roots).toBeGreaterThan(SCATTERED.least);
    expect(TILE_SCATTER.moss).toBeGreaterThan(SCATTERED.least);
    expect(roots / (roots + found('earth'))).toBeGreaterThan(SCATTERED.least);
    expect(roots / (roots + found('earth'))).toBeLessThan(SCATTERED.most);
    expect(moss / (moss + found('stone'))).toBeGreaterThan(SCATTERED.least);
    expect(moss / (moss + found('stone'))).toBeLessThan(SCATTERED.most);
  });

  it('draws a plank for both one-ways and the trap for a spike', () => {
    const { room } = worldFrom(`
      P
      -  =  ^
      #######
    `);

    expect(tileArt(room, 0, 1)).toBe('plank');
    expect(tileArt(room, 3, 1)).toBe('plank');
    expect(tileArt(room, 6, 1)).toBe('spike');
  });
});

/** A cell's turn as one value, so that two of them compare as one. */
function turned(room: Room, x: number, y: number, name: TileName): string {
  const turn = tileTurn(room, x, y, name);

  return `${turn.quarter}${turn.mirror ? ' mirrored' : ''}`;
}

/** A map with no ground in it: what a tile's own art allows, and no context. */
const AIR = worldFrom('P').room;

/** A patch of cells wide enough to show every turn a tile is allowed. */
const PATCH = Array.from({ length: 256 }, (_, at) => ({ x: at % 16, y: Math.floor(at / 16) }));

/** The turns a tile is drawn at over that patch, each of them once. */
function turns(name: TileName): string[] {
  return [...new Set(PATCH.map(({ x, y }) => turned(AIR, x, y, name)))].sort();
}

/**
 * Where the ground is and which way it is open, worked out from the map alone
 * rather than borrowed from game/render/tiles.ts: the glade test below is an
 * oracle, and sharing the renderer's own helpers would make it agree with
 * itself. Which quarter faces which side is the renderer's fact, so that one
 * is imported; the test pins the quarters themselves on a map of its own.
 */
function depthOf(room: Room, x: number, y: number): number {
  let depth = 0;

  while (tileAt(room, x, y - depth - 1) === Tile.Solid) depth += 1;

  return depth;
}

function openSide(room: Room, x: number, y: number): keyof typeof EDGE_QUARTER | undefined {
  if (tileAt(room, x - 1, y) !== Tile.Solid) return 'left';
  if (tileAt(room, x + 1, y) !== Tile.Solid) return 'right';
  if (tileAt(room, x, y + 1) !== Tile.Solid) return 'bottom';

  return undefined;
}

/** The columns of the plateau, the stretch of ground the owner reported. */
const PLATEAU = { from: 20, to: 32 };

/**
 * Every pair of root cells of the glade that touch, each counted once: the
 * cell to the right and the cell below are enough to reach all of them.
 */
function rootPairs(): Array<{ x: number; y: number; one: string; other: string }> {
  const pairs = [];

  for (const { x, y } of cells(GLADE)) {
    if (tileArt(GLADE, x, y) !== 'earth-roots') continue;

    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
    ] as const) {
      if (tileArt(GLADE, x + dx, y + dy) === 'earth-roots') {
        pairs.push({
          x,
          y,
          one: turned(GLADE, x, y, 'earth-roots'),
          other: turned(GLADE, x + dx, y + dy, 'earth-roots'),
        });
      }
    }
  }

  return pairs;
}

/** What each kind of TILE_TURN allows, in the order `turns` reports it. */
const ALLOWED = {
  fixed: ['0'],
  mirror: ['0', '0 mirrored'],
  rotate: ['0', '0 mirrored', '1', '1 mirrored', '2', '2 mirrored', '3', '3 mirrored'],
};

describe('which way round a cell draws the tile it shows', () => {
  it('turns each tile as far round as its own art allows and no further', () => {
    // The roots hang down and the moss lies on top, so those two are only ever
    // flipped left to right; the surface, the corners, the stone edges, the
    // plank and the spike say which way is up and are left standing; only the
    // earth and the stone have no up at all.
    for (const name of TILE_ORDER) {
      expect([name, turns(name)]).toEqual([name, ALLOWED[TILE_TURN[name]]]);
    }
  });

  it('puts a given cell the same way round every time it is drawn', () => {
    // A room drawn twice, and a replay run again, have to come out the same,
    // so what is pinned here is what the ground actually looks like rather
    // than the fact that a pure function is one. The first two are the hash
    // the rotating tiles roll; the last two are the parity the mirrored ones
    // read off the cell, which is why they alternate down the column.
    expect(turned(AIR, 0, 0, 'earth')).toBe('3');
    expect(turned(AIR, 2, 0, 'earth')).toBe('1 mirrored');
    expect(turned(AIR, 0, 0, 'earth-roots')).toBe('0');
    expect(turned(AIR, 0, 1, 'earth-roots')).toBe('0 mirrored');
  });

  it('leaves no root cell of the glade standing beside its own copy', () => {
    // The acceptance of this ticket, read off the shipped room: a pair is two
    // root cells that touch, and no pair may be drawn the same way round. The
    // plateau is called out on its own because it is the stretch of ground
    // the owner reported as wallpaper, and a count taken over the whole room
    // could be met everywhere but there.
    const pairs = rootPairs();
    const plateau = pairs.filter(({ x }) => x >= PLATEAU.from && x <= PLATEAU.to);

    expect(pairs.filter(({ one, other }) => one === other)).toEqual([]);
    expect(plateau.length).toBeGreaterThan(0);
    expect(plateau.filter(({ one, other }) => one === other)).toEqual([]);
    // Both ways round are drawn, so "no pair the same" is not being met by a
    // tile that has stopped being mirrored at all.
    expect(new Set(pairs.flatMap(({ one, other }) => [one, other]))).toEqual(
      new Set(ALLOWED.mirror),
    );
  });

  it('breaks up the mossy stone of the beacon tower rather than stamping one of it', () => {
    // The other half of the report: the tower is stone, and its mossy blocks
    // turn rather than mirror, because the moss runs through the crevices of
    // the art and reads the same way up whichever way the cell is turned
    // (TILE_TURN in game/render/config.ts). Four quarter turns and a flip is
    // eight ways round, so most of the neighbouring pairs differ.
    const ways = new Set<string>();

    for (const { x, y } of cells(GLADE)) {
      if (tileArt(GLADE, x, y) === 'mossy-stone') ways.add(turned(GLADE, x, y, 'mossy-stone'));
    }

    expect(ways).toEqual(new Set(ALLOWED.rotate));
  });

  it('turns the fringe of an earth row towards the side it stands open at', () => {
    const { room } = worldFrom(`
      P
      ####
      ####
      ####
    `);

    // Quarters count clockwise, so the quarter turn counter-clockwise the
    // open left asks for is three of them, and the open right's is one: the
    // fringe the atlas drew along the top comes round to face the gap.
    expect(turned(room, 0, 2, 'grass-top')).toBe('3');
    expect(turned(room, 3, 2, 'grass-top')).toBe('1');
    // The bottom row of the map has nothing under it, so its earth is open
    // below and takes the half turn. No shipped room ends in earth; a
    // hand-authored map may.
    expect(turned(room, 1, 3, 'grass-top')).toBe('2');
    // The surface above and the earth away from either end are untouched.
    expect(turned(room, 1, 1, 'grass-top')).toBe('0');
  });

  it('gives an earth row open at both sides the left fringe, as the ledge does', () => {
    const { room } = worldFrom(`
      P
      #
      #
      #
    `);

    expect(tileArt(room, 0, 2)).toBe('grass-top');
    expect(turned(room, 0, 2, 'grass-top')).toBe('3');
  });

  it('fringes every earth cell of the glade that stands open, and no other', () => {
    // The owner's report, read off the shipped room: the left face of the
    // plateau and both faces of the beacon tower. Each open earth cell shows
    // the surface tile turned to face its gap; each enclosed one is still
    // earth, so the fringe has not spread over the ground.
    const fringed = [];

    for (const { x, y, tile } of cells(GLADE)) {
      if (tile !== Tile.Solid) continue;

      const depth = depthOf(GLADE, x, y);

      if (depth < 1 || depth > EARTH_ROWS) continue;

      const side = openSide(GLADE, x, y);

      if (side === undefined) {
        expect(tileArt(GLADE, x, y)).toMatch(/^earth/);
        continue;
      }

      fringed.push({ x, y, side, art: tileArt(GLADE, x, y), turn: turned(GLADE, x, y, 'grass-top') });
    }

    expect(fringed.filter(({ x }) => x >= PLATEAU.from && x <= PLATEAU.to).length).toBeGreaterThan(0);
    expect(fringed.filter(({ art }) => art !== 'grass-top')).toEqual([]);
    expect(fringed.filter(({ side, turn }) => turn !== String(EDGE_QUARTER[side]))).toEqual([]);
  });
});
