// Slicing the tileset and the prop sheet (docs/plan/03-assets/pipeline.md,
// unit tests). Both fixtures are written out here by hand — the tileset's
// boxes from the grid assets/PROVENANCE.md records, the prop sheet's bands
// object by object — rather than read back out of the slicers, so a box or a
// mapping entry pointed at the wrong art fails here. Every tile and every
// frame is painted its own colour and the assertions read those colours out
// of the output, so a strip that is the right size and the right shape but
// cut from the wrong place is not enough to pass. The real sheets are then
// run through both slicers, which is what proves the hand-written boxes and
// the mapping still answer the art in assets/. The provenance check at the end
// of the file is the other half of that: every raw the kit reads is a raw the
// record accounts for.

import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { TILE_ORDER } from '../../game/content/tile-order';
import { RENDER_DENSITY } from '../../game/render/config';
import { TILE } from '../../game/sim';
import { createRaster, fillRect, loadPng, pixelAt, type Box, type Raster, type Rgba } from '../../tools/asset-kit/lib';
import { sliceProps } from '../../tools/asset-kit/props';
import { RAWS, RECORD, rawNames, rawsWithoutProvenance } from '../../tools/asset-kit/provenance';
import { sliceTiles } from '../../tools/asset-kit/tiles';

/** The tile the atlas is cut to: 16 world units at two pixels each (ADR-003). */
const TILE_PX = TILE * RENDER_DENSITY;

const OPAQUE = 255;

/** How much of a real tile has to be drawn for its box to be over the art. */
const LEAST_DRAWN = 0.5;

/** One cell of the tileset's grid: 205 by 202 from (39, 39) with 39 px gaps. */
function grid(column: number, row: number): Box {
  return { x: 39 + column * 244, y: 39 + row * 241, width: 205, height: 202 };
}

/**
 * Where assets/tileset.png draws its eleven tiles (assets/PROVENANCE.md), in
 * `TILE_ORDER`: five ground tiles across the top row, four across the second,
 * then the plank and the spike trap in their own boxes below the grid. The
 * fixture is painted from here and not from the slicer's own table, so which
 * name takes which box is what the colours below prove.
 */
const TILE_PLACES: readonly Box[] = [
  grid(0, 0),
  grid(1, 0),
  grid(2, 0),
  grid(3, 0),
  grid(4, 0),
  grid(0, 1),
  grid(1, 1),
  grid(2, 1),
  grid(3, 1),
  { x: 40, y: 535, width: 300, height: 85 },
  { x: 385, y: 527, width: 107, height: 96 },
];

/** The colour the fixture paints the nth tile, distinct for every tile. */
function tileColour(tile: number): Rgba {
  return [10 * (tile + 1), 20, 30, OPAQUE];
}

/** A tileset like the real one: each tile a flat block in its own box. */
function tileset(tiles: number): Raster {
  return TILE_PLACES.slice(0, tiles).reduce(
    (sheet, box, tile) => fillRect(sheet, box, tileColour(tile)),
    createRaster(1259, 662),
  );
}

/** How much of a raster is drawn rather than transparent. */
function drawnShare(raster: Raster): number {
  let drawn = 0;
  for (let y = 0; y < raster.height; y += 1) {
    for (let x = 0; x < raster.width; x += 1) {
      if (pixelAt(raster, x, y)[3] > 0) drawn += 1;
    }
  }
  return drawn / (raster.width * raster.height);
}

describe('the tile slicer', () => {
  it('yields one 32 px tile per name, in the atlas order', () => {
    const tiles = sliceTiles(tileset(TILE_ORDER.length));

    expect(TILE_PX).toBe(32);
    expect(tiles.map((tile) => [tile.width, tile.height])).toEqual(TILE_ORDER.map(() => [TILE_PX, TILE_PX]));
    expect(tiles.map((tile) => pixelAt(tile, TILE_PX / 2, TILE_PX / 2))).toEqual(TILE_ORDER.map((_, index) => tileColour(index)));
  });

  it('refuses a sheet that draws a different number of tiles', () => {
    expect(() => sliceTiles(tileset(TILE_ORDER.length - 1))).toThrow(/10 objects, not the 11/);
  });

  it('cuts the real tileset, every tile over its art', async () => {
    const tiles = sliceTiles(await loadPng('assets/tileset.png'));

    expect(tiles).toHaveLength(TILE_ORDER.length);
    for (const tile of tiles) expect(drawnShare(tile)).toBeGreaterThan(LEAST_DRAWN);
  });
});

/** How wide the fixture draws one prop frame, and how far apart two objects. */
const FRAME = 30;
const GAP = 30;

/**
 * The prop sheet's layout, written out object by object: one row per band,
 * each band the objects drawn across it left to right, each object the frames
 * it holds. Frames inside one object touch, which is how the real sheet draws
 * the five rocks and the five beacons, and is what the mapping parts into
 * columns. The numbers are frame ids — every one is painted its own colour,
 * so `PROP_STRIPS` below can name the frames each strip has to come back with.
 */
const PROP_BANDS: readonly { top: number; height: number; objects: readonly (readonly number[])[] }[] = [
  { top: 20, height: 20, objects: [[0], [1], [2], [3, 4, 5, 6, 7]] },
  { top: 80, height: 20, objects: [[8], [9], [10]] },
  { top: 140, height: 25, objects: [[11, 12, 13, 14, 15]] },
  { top: 200, height: 30, objects: [[16]] },
  { top: 260, height: 30, objects: [[17], [18], [19], [20], [21]] },
  { top: 310, height: 16, objects: [[22], [23], [24]] },
  { top: 350, height: 16, objects: [[25], [26]] },
];

/** The frame id an added object is painted with, drawn by no band of its own. */
const SPARE = 27;

/**
 * What each strip has to come back as: the asset list's frame counts and prop
 * cells (bush 3, log 3, rock 5, flag 5, beacon 5, torch 1, sparks 5), and the
 * fixture frames the mapping has to have cut for it, in order. The sparks are
 * the one strip drawn over two bands.
 */
const PROP_STRIPS = [
  { name: 'bush', frames: [0, 1, 2], cellW: 32, cell: 24 },
  { name: 'log', frames: [8, 9, 10], cellW: 48, cell: 16 },
  { name: 'rock', frames: [11, 12, 13, 14, 15], cellW: 32, cell: 24 },
  { name: 'flag', frames: [17, 18, 19, 20, 21], cellW: 16, cell: 32 },
  { name: 'beacon', frames: [3, 4, 5, 6, 7], cellW: 32, cell: 64 },
  { name: 'torch', frames: [16], cellW: 16, cell: 32 },
  { name: 'sparks', frames: [22, 23, 24, 25, 26], cellW: 24, cell: 8 },
];

/** The colour the fixture paints one frame, distinct for every frame. */
function frameColour(frame: number): Rgba {
  return [20 + 8 * frame, 40 + 3 * frame, 200 - 5 * frame, OPAQUE];
}

/**
 * A prop sheet of flat blocks, one colour per frame. `short` leaves a band's
 * last object off and `extra` adds one to a band: the two ways a regenerated
 * sheet shifts the places the mapping counts from the left.
 */
function propSheet(edit: { short?: number; extra?: number } = {}): Raster {
  let sheet = createRaster(420, 380);
  PROP_BANDS.forEach((band, index) => {
    const objects = index === edit.short ? band.objects.slice(0, -1) : band.objects;
    let left = 20;
    for (const frames of [...objects, ...(index === edit.extra ? [[SPARE]] : [])]) {
      for (const frame of frames) {
        sheet = fillRect(sheet, { x: left, y: band.top, width: FRAME, height: band.height }, frameColour(frame));
        left += FRAME;
      }
      left += GAP;
    }
  });
  return sheet;
}

/** The colours one cell of a strip is drawn in, each counted once. */
function coloursIn(strip: Raster, frame: number, cellW: number): Rgba[] {
  const found = new Map<string, Rgba>();
  for (let y = 0; y < strip.height; y += 1) {
    for (let x = frame * cellW; x < (frame + 1) * cellW; x += 1) {
      const pixel = pixelAt(strip, x, y);
      if (pixel[3] > 0) found.set(String(pixel), pixel);
    }
  }
  return [...found.values()];
}

describe('the prop mapping', () => {
  it("yields the seven strips with the asset list's frame counts, cut from the art the mapping names", () => {
    const strips = sliceProps(propSheet());

    expect(
      strips.map((strip) => ({
        name: strip.name,
        cellW: strip.cellW,
        cell: strip.cell,
        size: [strip.image.width, strip.image.height],
        frames: Array.from({ length: strip.frames }, (_, frame) => coloursIn(strip.image, frame, strip.cellW * RENDER_DENSITY)),
      })),
    ).toEqual(
      // The cells stay the simulation's own world units and the file holds
      // `RENDER_DENSITY` pixels of each of them (ADR-003).
      PROP_STRIPS.map(({ name, frames, cellW, cell }) => ({
        name,
        cellW,
        cell,
        size: [frames.length * cellW * RENDER_DENSITY, cell * RENDER_DENSITY],
        frames: frames.map((frame) => [frameColour(frame)]),
      })),
    );
  });

  it('refuses a band that holds fewer objects than the mapping needs', () => {
    expect(() => sliceProps(propSheet({ short: 4 }))).toThrow(/band 4 .* holds 4 objects, and the mapping cuts 5/);
  });

  it('refuses a band that holds more objects than the mapping needs', () => {
    expect(() => sliceProps(propSheet({ extra: 4 }))).toThrow(/band 4 .* holds 6 objects, and the mapping cuts 5/);
  });

  it('cuts the real prop sheet', async () => {
    const strips = sliceProps(await loadPng('assets/props-sheet.png'));

    expect(strips.map((strip) => [strip.name, strip.frames])).toEqual(
      PROP_STRIPS.map((strip) => [strip.name, strip.frames.length]),
    );
  });
});

/**
 * A provenance record shaped like the real one: prose, then a table whose
 * first column names the raw. The set-aside variants are listed in prose
 * below it, which is what a row must not be confused with, and a half-written
 * one-cell line stands for the other way a row can fail to be one.
 */
const FIXTURE = `# Asset provenance

Generated art the kit turns into public/assets.

| File | What it is | Becomes |
|---|---|---|
| tileset.png | forest tileset | tiles/forest.png |
| props-sheet.png | bush, log, rock | props/*.png |

| wizard-walk.png |

## Tried and set aside

- bg-hills.png, far hills; never built.
`;

describe('the provenance check', () => {
  it('names the raws with no row, and is not answered by prose naming the file', () => {
    expect(rawsWithoutProvenance(['tileset.png', 'wizard-idle.png', 'bg-hills.png'], FIXTURE)).toEqual([
      'wizard-idle.png',
      'bg-hills.png',
    ]);
  });

  it('does not take a line that merely begins with a bar for a row', () => {
    expect(rawsWithoutProvenance(['wizard-walk.png'], FIXTURE)).toEqual(['wizard-walk.png']);
  });

  it('accounts for every raw in assets/', async () => {
    const [raws, record] = await Promise.all([rawNames(), readFile(`${RAWS}/${RECORD}`, 'utf8')]);

    expect(rawsWithoutProvenance(raws, record)).toEqual([]);
  });
});
