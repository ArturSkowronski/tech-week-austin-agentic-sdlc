// Which atlas tile a cell of a map shows (rendering-and-look.md, tiles). The
// rules are read off the shipped glade as well as off small maps, because the
// ticket's acceptance is about that room: a corner at every ledge end and no
// cell of ground left undrawn. Drawing the sprites needs a browser and is
// covered in tests/smoke/room.spec.ts.

import { describe, expect, it } from 'vitest';

import forestGlade from '../../game/content/rooms/forest-glade';
import { TILE_ORDER } from '../../game/content/tile-order';
import { TILE_SCATTER } from '../../game/render/config';
import { tileArt } from '../../game/render/tiles';
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
