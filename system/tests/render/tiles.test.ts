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

/**
 * The share of ground a scatter may take and still read as the occasional
 * feature of it rather than as its own pattern (rendering-and-look.md,
 * tiles). The quarter and the fifth Season 1 shipped with stand above the
 * top of this band, which is the report HWP-094 answers.
 */
const OCCASIONAL = { least: 0.04, most: 0.15 };

/**
 * Digits a drawn share has to match the configured one to, which vitest reads
 * as within 0.05 of it. The scatter is a hash over a room's own positions, so
 * a stretch of a few dozen cells lands near its share rather than on it.
 */
const SHARE_DIGITS = 1;

/** The columns of the plateau, the stretch of ground the owner reported. */
const PLATEAU = { from: 20, to: 32 };

/** A room's cells, or a stretch of its columns, left to right and top to bottom. */
function* cells(
  room: Room,
  columns = { from: 0, to: room.width - 1 },
): Generator<{ x: number; y: number; tile: Tile }> {
  for (let y = 0; y < room.height; y += 1) {
    for (let x = columns.from; x <= columns.to; x += 1) {
      yield { x, y, tile: tileAt(room, x, y) };
    }
  }
}

/** How many of those cells each atlas tile is drawn on. */
function tally(room: Room, columns?: { from: number; to: number }): Map<string, number> {
  const counts = new Map<string, number>();

  for (const { x, y } of cells(room, columns)) {
    const name = tileArt(room, x, y);

    if (name !== undefined) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }

  return counts;
}

/** The share of the cells of a plain tile that its scattered variant took. */
function scattered(drawn: Map<string, number>, few: string, many: string): number {
  const count = drawn.get(few) ?? 0;

  return count / (count + (drawn.get(many) ?? 0));
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
    const glade = tally(GLADE);
    const plateau = tally(GLADE, PLATEAU);

    // Both shares are asked for twice over: that they are occasional at all,
    // which is the band and is what the quarter and the fifth failed, and
    // that what the glade really draws is the share config.ts names, give or
    // take what a room this size rounds it to.
    for (const share of [TILE_SCATTER.roots, TILE_SCATTER.moss]) {
      expect(share).toBeGreaterThan(OCCASIONAL.least);
      expect(share).toBeLessThan(OCCASIONAL.most);
    }

    expect(scattered(glade, 'earth-roots', 'earth')).toBeCloseTo(TILE_SCATTER.roots, SHARE_DIGITS);
    expect(scattered(glade, 'mossy-stone', 'stone')).toBeCloseTo(TILE_SCATTER.moss, SHARE_DIGITS);

    // The plateau is taken on its own as well, because it is the stretch the
    // owner read as a pattern and a share met over the whole room could miss
    // it there. It is held to the band rather than to the configured number:
    // the stretch holds twenty-two earth cells, two of them rooted, so one
    // cell either way moves the drawn share by 0.045 and SHARE_DIGITS would
    // red on an edit to the map rather than on a share that had crept back
    // up. The band is what this stretch is really asked for, and the quarter
    // Season 1 shipped with still fails it.
    const onThePlateau = scattered(plateau, 'earth-roots', 'earth');

    expect(onThePlateau).toBeGreaterThan(OCCASIONAL.least);
    expect(onThePlateau).toBeLessThan(OCCASIONAL.most);
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

/** The cell to the right and the cell below: enough to reach every pair that touches. */
const NEIGHBOURS = [
  [1, 0],
  [0, 1],
] as const;

/** What each kind of TILE_TURN allows, in the order `turns` reports it. */
const ALLOWED = {
  fixed: ['0'],
  mirror: ['0', '0 mirrored'],
  rotate: ['0', '0 mirrored', '1', '1 mirrored', '2', '2 mirrored', '3', '3 mirrored'],
};

/** A pair of cells that touch, as the left or upper one and the step to the other. */
interface Pair {
  readonly x: number;
  readonly y: number;
  readonly dx: number;
  readonly dy: number;
}

/**
 * A slab of ground this many columns across: the moss surface, the two earth
 * rows under it and stone under those. The columns at either end stand open
 * and draw the fringe, so the earth proper is everything between them — ground
 * drawn by the same `tileArt` the shipped room is, with no other feature in it.
 */
function earthSlab(width: number): Room {
  const row = '#'.repeat(width);

  return worldFrom(['P', row, row, row, row].join('\n')).room;
}

/** Every pair of touching cells that a room draws the roots in both of. */
function rootPairs(room: Room): Pair[] {
  const pairs: Pair[] = [];

  for (const { x, y } of cells(room)) {
    if (tileArt(room, x, y) !== 'earth-roots') continue;

    for (const [dx, dy] of NEIGHBOURS) {
      if (tileArt(room, x + dx, y + dy) === 'earth-roots') pairs.push({ x, y, dx, dy });
    }
  }

  return pairs;
}

/** Widths tried for a slab with a touching pair of roots in it, narrowest first. */
const SLAB_WIDTHS = [64, 128, 256, 512];

/**
 * The narrowest of those the scatter does draw a touching pair of roots in.
 * Found by search rather than written down as the width that works today: the
 * thinner the share, the more ground it takes before two roots land beside
 * each other, so a number read off this TILE_SCATTER would re-break on the
 * next one. The widths grow until some of the slab holds a pair, and running
 * out is an error that says why rather than a test that quietly stops testing.
 */
function slabWithRootPair(): { width: number; room: Room; pairs: Pair[] } {
  for (const width of SLAB_WIDTHS) {
    const room = earthSlab(width);
    const pairs = rootPairs(room);

    if (pairs.length > 0) return { width, room, pairs };
  }

  throw new Error(
    `no slab up to ${SLAB_WIDTHS[SLAB_WIDTHS.length - 1]} columns across drew two roots touching: ` +
      'TILE_SCATTER is now too thin to read the parity rule off cells that really carry roots',
  );
}

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

  it('leaves no root cell standing beside its own copy', () => {
    // The roots are flipped by the parity of the cell's own coordinates and
    // not by the hash, so two cells that touch are never the same way round.
    // That holds of every pair of the patch, however thinly TILE_SCATTER
    // spreads the roots over a real room, which is why the rule itself is
    // read here and not off a room's drawn roots. That the cells really
    // drawn with roots obey it is the test below.
    const pairs = PATCH.flatMap(({ x, y }) =>
      NEIGHBOURS.map(([dx, dy]) => [
        turned(AIR, x, y, 'earth-roots'),
        turned(AIR, x + dx, y + dy, 'earth-roots'),
      ]),
    );

    expect(pairs.filter(([one, other]) => one === other)).toEqual([]);
    // Both ways round are drawn, so "no pair the same" is not being met by a
    // tile that has stopped being mirrored at all.
    expect(new Set(pairs.flat())).toEqual(new Set(ALLOWED.mirror));
  });

  it('draws the two cells of a touching pair of roots the opposite ways round', () => {
    // The rule above is read off coordinates, which proves the rule but not
    // that `tileArt` and `tileTurn` are talking about the same cell: a drift
    // between which cells carry roots and which cells get mirrored would pass
    // it. So the roots are read here off ground that really draws them — a
    // slab wide enough for the thin share of HWP-094 to put two of them side
    // by side, which is the fixture the ticket's Work asks for, and the glade
    // as well, whose one surviving pair is the shipped room's own case.
    const slab = slabWithRootPair();

    // The slab is the half of this that is guaranteed to assert something:
    // `slabWithRootPair` throws rather than return none, and this says so at
    // the place the pairs are read. The glade may hold none and still pass.
    expect(slab.pairs.length).toBeGreaterThan(0);

    const drawn = [
      { what: `a slab ${slab.width} columns across`, room: slab.room, pairs: slab.pairs },
      { what: 'the glade', room: GLADE, pairs: rootPairs(GLADE) },
    ];

    for (const { what, room, pairs } of drawn) {
      const same = pairs.filter(
        ({ x, y, dx, dy }) =>
          turned(room, x, y, 'earth-roots') === turned(room, x + dx, y + dy, 'earth-roots'),
      );

      expect([what, same]).toEqual([what, []]);
    }
  });

  it('breaks up the mossy stone of the glade rather than stamping one of it', () => {
    // The other half of the report: the mossy blocks turn rather than mirror,
    // because the moss runs through the crevices of the art and reads the
    // same way up whichever way the cell is turned (TILE_TURN in
    // game/render/config.ts). All eight of those ways being open to the tile
    // is pinned over the patch above; what the shipped room is asked for is
    // that the blocks it draws spread over them rather than being one way
    // stamped out. More than half the eight: the sixteen blocks of the glade
    // draw seven today, so there is room for the scatter to move without
    // this reding, while a regression that stamped them at two or three ways
    // still fails it. How they look on the beacon tower is a frame in
    // tests/smoke/room.spec.ts.
    const ways = new Set<string>();

    for (const { x, y } of cells(GLADE)) {
      if (tileArt(GLADE, x, y) === 'mossy-stone') ways.add(turned(GLADE, x, y, 'mossy-stone'));
    }

    expect(ways.size).toBeGreaterThan(ALLOWED.rotate.length / 2);
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
