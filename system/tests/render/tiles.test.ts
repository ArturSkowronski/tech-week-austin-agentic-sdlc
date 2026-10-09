// Which atlas tile a cell of a map shows (rendering-and-look.md, tiles). The
// rules are read off the shipped glade as well as off small maps, because the
// ticket's acceptance is about that room: a corner at every ledge end and no
// cell of ground left undrawn — and which way round each cell draws it.
// Drawing the sprites needs a browser and is covered in tests/smoke/room.spec.ts.

import { describe, expect, it } from 'vitest';

import forestGlade from '../../game/content/rooms/forest-glade';
import { TILE_ORDER, type TileName } from '../../game/content/tile-order';
import { TILE_SCATTER, TILE_TURN } from '../../game/render/config';
import { EARTH_ROWS, EDGE_QUARTER, scatterBed, tileArt, tileTurn, type Scatter } from '../../game/render/tiles';
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
 * The band for the stones set in the earth, which the owner asked for denser
 * than the roots and the moss: set in the ground rather than growing out of
 * it, a fifth of them still reads as earth with stones in it. The top is
 * where the no-touching rule stops the drawn share rising at all — a quarter
 * and a third of the bed draw within a cell or two of a fifth — so a share
 * past it is asking for what the rule cannot give (config.ts, TILE_SCATTER).
 */
const SET_IN = { least: 0.1, most: 0.25 };

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

/**
 * How many cells of a room a feature was offered: its bed, which is what a
 * drawn share is a share of. Counted off the renderer's own rule rather than
 * off a second copy of it here, so this measures the share and not the bed.
 */
function bedSize(room: Room, kind: Scatter): number {
  let count = 0;

  for (const { x, y } of cells(room)) {
    if (scatterBed(room, x, y, kind)) count += 1;
  }

  return count;
}

/**
 * The share of its bed that a feature was drawn on. The stones take two
 * pieces out of one bed, so they are counted together.
 */
function ofBed(room: Room, drawn: Map<string, number>, kind: Scatter, ...pieces: string[]): number {
  const count = pieces.reduce((total, piece) => total + (drawn.get(piece) ?? 0), 0);

  return count / bedSize(room, kind);
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
      'stone-earth',
      expect.stringMatching(/^(stone|mossy-stone)$/),
    ]);
  });

  it('meets the stone with the transition piece the whole way along, flipped at random', () => {
    // The first row of stone under the earth is the piece the earth shows
    // through, on every cell that is not an edge. Which way round each cell
    // is flipped comes off the hash and not off the cell's parity: the owner
    // found a strict alternation read as a zigzag, and two of the piece side
    // by side the same way round are fine (rendering-and-look.md, tiles).
    // The map's first line is the air the wizard stands in, so the surface is
    // row 1 and the first stone row is one past the earth rows under it.
    const slab = stoneSlab(64);
    const row = 1 + EARTH_ROWS + 1;
    const ways = new Set<string>();
    let alike = 0;

    for (let x = 1; x < 63; x += 1) {
      expect(tileArt(slab, x, row)).toBe('stone-earth');
      expect(tileArt(slab, x, row + 1)).toMatch(/^(stone|mossy-stone)$/);
      ways.add(turned(slab, x, row, 'stone-earth'));
      if (turned(slab, x, row, 'stone-earth') === turned(slab, x + 1, row, 'stone-earth')) alike += 1;
    }

    // Both ways round are drawn, and some neighbours share one: a flip that
    // alternated would give none, a flip that never happened would give all.
    expect(ways).toEqual(new Set(ALLOWED.mirror));
    expect(alike).toBeGreaterThan(0);
    expect(alike).toBeLessThan(61);

    expect(tileArt(slab, 0, row)).toBe('stone-edge-left');
    expect(tileArt(slab, 63, row)).toBe('stone-edge-right');

    // The glade as well: every stone cell with earth over it is the piece.
    for (const { x, y, tile } of cells(GLADE)) {
      if (tile !== Tile.Solid || tileArt(GLADE, x, y)?.startsWith('stone-edge')) continue;

      const underEarth = /^earth/.test(tileArt(GLADE, x, y - 1) ?? '');

      if (underEarth && /^(stone|mossy-stone|stone-earth)$/.test(tileArt(GLADE, x, y) ?? '')) {
        expect(tileArt(GLADE, x, y)).toBe('stone-earth');
      }
    }
  });

  it('sets the stones in either earth row and nowhere else', () => {
    // The stones first went into the lower earth row alone, over the
    // transition; the owner then asked for them across the big masses of
    // earth, so both rows carry them now. Never the surface, never the stone,
    // and never a cell drawing the fringe at an open side.
    const slab = earthSlab(512);
    const rows = new Set<number>();

    for (const { x, y } of cells(slab)) {
      if (!/^earth-(stones|boulder)$/.test(tileArt(slab, x, y) ?? '')) continue;

      rows.add(y);
      expect(tileArt(slab, x, y - 1)).toMatch(/^(grass-top|earth|earth-roots|earth-stones|earth-boulder)$/);
      expect(tileArt(slab, x, y + 1)).toMatch(/^(earth|earth-roots|earth-stones|earth-boulder|stone-earth)$/);
    }

    // The surface is row 1 of the slab, so the earth rows are the two under it.
    expect([...rows].sort()).toEqual([2, 3]);
    // Both pieces are drawn, and in the glade too: a second roll once gave
    // the shipped room five boulders and no cluster, which the owner read as
    // the cluster missing from the atlas. The pieces take turns along a row
    // instead, so any row with two stones in it shows both.
    expect(tally(slab).get('earth-stones') ?? 0).toBeGreaterThan(0);
    expect(tally(slab).get('earth-boulder') ?? 0).toBeGreaterThan(0);
    expect(tally(GLADE).get('earth-stones') ?? 0).toBeGreaterThan(0);
    expect(tally(GLADE).get('earth-boulder') ?? 0).toBeGreaterThan(0);
  });

  it('gives the cluster and the boulder turns along a row of stones', () => {
    // Read along each row of the slab: the pieces alternate in the order the
    // stones stand, so no row of them is all one piece.
    const slab = earthSlab(512);

    for (let y = 0; y < slab.height; y += 1) {
      const pieces: string[] = [];

      for (let x = 0; x < slab.width; x += 1) {
        const name = tileArt(slab, x, y);

        if (name === 'earth-stones' || name === 'earth-boulder') pieces.push(name);
      }

      for (let at = 1; at < pieces.length; at += 1) {
        expect(pieces[at]).not.toBe(pieces[at - 1]);
      }
    }
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

  it('scatters the roots, the stones and the mossy blocks, each near its configured share', () => {
    const glade = tally(GLADE);
    const plateau = tally(GLADE, PLATEAU);

    // Each share is asked for twice over: that it sits in its feature's band,
    // which for the roots and the moss is "occasional" and is what the
    // quarter and the fifth failed, and that what the glade really draws is
    // the share config.ts names, give or take what a room this size rounds it
    // to.
    for (const [share, band] of [
      [TILE_SCATTER.roots, OCCASIONAL],
      [TILE_SCATTER.stones, SET_IN],
      [TILE_SCATTER.moss, OCCASIONAL],
    ] as const) {
      expect(share).toBeGreaterThan(band.least);
      expect(share).toBeLessThan(band.most);
    }

    // What the glade really draws is held near the configured share, and
    // inside the band, rather than to the number itself. Each of the three is
    // measured against its own bed — the cells the feature was offered — so
    // the stones, whose bed leaves out the fringe cells the roots' also does
    // but which the roots then also leave to the stones, are compared with
    // their own share and not with a denominator that counts cells they were
    // never offered.
    //
    // It is not held from below. Dropping one of two touching winners lowers
    // the share in expectation, not in every room: when the stones' bed was
    // the lower earth row alone they drew 5 of its 61 cells, over the
    // configured twelfth, while the roots and the moss came out under theirs
    // (config.ts, TILE_SCATTER). A `drawn <= share` here would have reddened
    // on that glade.
    for (const [drawn, share, band] of [
      [ofBed(GLADE, glade, 'roots', 'earth-roots'), TILE_SCATTER.roots, OCCASIONAL],
      [ofBed(GLADE, glade, 'stones', 'earth-stones', 'earth-boulder'), TILE_SCATTER.stones, SET_IN],
      [ofBed(GLADE, glade, 'moss', 'mossy-stone'), TILE_SCATTER.moss, OCCASIONAL],
    ] as const) {
      expect(drawn).toBeCloseTo(share, SHARE_DIGITS);
      expect(drawn).toBeGreaterThan(band.least);
      expect(drawn).toBeLessThan(band.most);
    }

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

/** A slab of ground this many columns across and eight deep: earth rows, the transition row and four of stone, the moss's bed. */
function stoneSlab(width: number): Room {
  const row = '#'.repeat(width);

  return worldFrom(['P', row, row, row, row, row, row, row, row].join('\n')).room;
}

/** Every pair of touching cells that a room draws the same feature in both of. */
function touchingPairs(room: Room, feature: RegExp): Pair[] {
  const pairs: Pair[] = [];

  for (const { x, y } of cells(room)) {
    if (!feature.test(tileArt(room, x, y) ?? '')) continue;

    for (const [dx, dy] of NEIGHBOURS) {
      if (feature.test(tileArt(room, x + dx, y + dy) ?? '')) pairs.push({ x, y, dx, dy });
    }
  }

  return pairs;
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
    // the rotating tiles roll; the last two are the hash the mirrored ones
    // roll with their own salt.
    expect(turned(AIR, 0, 0, 'earth')).toBe('3');
    expect(turned(AIR, 2, 0, 'earth')).toBe('1 mirrored');
    expect(turned(AIR, 0, 0, 'earth-roots')).toBe('0');
    expect(turned(AIR, 0, 1, 'earth-roots')).toBe('0');
  });

  it('flips a mirrored tile both ways over a patch, and not in stripes', () => {
    // The mirrored tiles — the roots, the stones set in earth and the
    // transition piece — take their flip from the hash, like the turned ones
    // take their quarter. They used to take it from the parity of the cell so
    // that no two touching cells matched; the roots and the stones never
    // touch at all now (the scatter rule below), and on the transition row,
    // which does run on, the owner found the alternation read as a zigzag.
    // So what is asked here is that both ways round are drawn and that the
    // flip is not a stripe: neither every pair alike nor every pair unlike.
    for (const name of ['earth-roots', 'earth-stones', 'stone-earth'] as const) {
      const pairs = PATCH.flatMap(({ x, y }) =>
        NEIGHBOURS.map(([dx, dy]) => [turned(AIR, x, y, name), turned(AIR, x + dx, y + dy, name)]),
      );
      const alike = pairs.filter(([one, other]) => one === other).length;

      expect(new Set(pairs.flat())).toEqual(new Set(ALLOWED.mirror));
      expect(alike).toBeGreaterThan(pairs.length / 4);
      expect(alike).toBeLessThan((pairs.length * 3) / 4);
    }
  });

  it('never draws two roots, two stones or two mossy blocks in cells that touch', () => {
    // The rule the owner set for the fourteen-tile atlas: of two touching
    // cells both rolling under a share, the lower roll takes the feature and
    // the other stays plain ground. Read off ground that really draws them, a
    // slab wide enough that the thin share would put pairs side by side many
    // times over, and off the glade, the shipped room's own case.
    const slabs = [earthSlab(512), stoneSlab(256), GLADE];

    for (const room of slabs) {
      expect(touchingPairs(room, /^earth-roots$/)).toEqual([]);
      expect(touchingPairs(room, /^earth-(stones|boulder)$/)).toEqual([]);
      expect(touchingPairs(room, /^mossy-stone$/)).toEqual([]);
    }

    // And the rule is biting rather than vacuous: each feature is drawn.
    expect(tally(earthSlab(512)).get('earth-roots') ?? 0).toBeGreaterThan(0);
    expect(tally(stoneSlab(256)).get('mossy-stone') ?? 0).toBeGreaterThan(0);
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
