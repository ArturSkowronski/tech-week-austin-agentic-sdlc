// Cutting wizard pose sheets, on synthetic sheets (docs/plan/03-assets/
// pipeline.md, unit tests). Every sheet here is drawn by the test at a known
// block size, with a known crystal and the generated label the real raws carry
// under each pose, so what the cut finds is what the test just drew.
//
// A sheet is read at the game's density, so the cells below are written as
// world units times that density: what the numbers state is that the world
// sizes did not move (ADR-003).

import { describe, expect, it } from 'vitest';

import { RENDER_DENSITY } from '../../game/render/config';
import { createRaster, fillRect, pixelAt, type Raster, type Rgba } from '../../tools/asset-kit/lib';
import { cutStrip, type Sheet } from '../../tools/asset-kit/strips';

const OPAQUE = 255;
const MAGENTA: Rgba = [255, 0, 255, OPAQUE];
const ROBE: Rgba = [40, 120, 60, OPAQUE];
const CRYSTAL: Rgba = [150, 200, 250, OPAQUE];
const NOTHING: Rgba = [0, 0, 0, 0];

/** The block size the fixture sheets are drawn at. */
const PITCH = 8;

/** The wizard's cell in world units, and what that is in the file's pixels. */
const CELL = 32;
const CELL_PX = CELL * RENDER_DENSITY;

/** A pose in blocks, and the blocks of magenta between one pose and the next. */
const POSE_COLUMNS = 4;
const POSE_ROWS = 24;
const GAP = 2;

/**
 * How a pose's pale blue is drawn: the plain tip; a tip with a hole in the
 * middle of it, which is the shape the charge sheet's frame 4 really makes; a
 * tip with a spark trail behind it, spread over a wider box than the tip's but
 * made of fewer pixels (asset-list.md, wizard); or no crystal at all.
 */
type Crystal = 'tip' | 'hollow' | 'trailed' | 'none';

/** The idle sheet, as `build.ts` describes it, with its frame count free. */
function idle(frames: number): Sheet {
  return { state: 'idle', raw: 'wizard-idle.png', pitch: PITCH, frames };
}

interface Drawn {
  rows?: number;
  crystal?: Crystal;
  label?: boolean;
}

/**
 * A pose sheet like the generator's: poses of flat robe colour on a magenta
 * page, pale blue at the wand's tip, and what a keyed label leaves behind,
 * below the pose and over in the gap beside it, where it would be a column of
 * its own if it were not dropped.
 */
function sheet(poses: number, { rows = POSE_ROWS, crystal = 'tip', label = true }: Drawn = {}): Raster {
  const step = POSE_COLUMNS + GAP;
  let raster = createRaster(poses * step * PITCH, (rows + 6) * PITCH, MAGENTA);
  const block = (x: number, y: number, width: number, height: number, colour: Rgba): void => {
    raster = fillRect(raster, { x: x * PITCH, y: y * PITCH, width: width * PITCH, height: height * PITCH }, colour);
  };
  for (let pose = 0; pose < poses; pose += 1) {
    const left = pose * step + 1;
    block(left, 2, POSE_COLUMNS, rows, ROBE);
    if (crystal === 'tip') block(left + POSE_COLUMNS - 1, 4, 1, 1, CRYSTAL);
    if (crystal === 'hollow') {
      // Five blocks around a 2 by 3 box, leaving the box's own centre empty.
      for (const [x, y] of [[0, 0], [1, 0], [0, 1], [0, 2], [1, 2]]) {
        block(left + 2 + (x ?? 0), 4 + (y ?? 0), 1, 1, CRYSTAL);
      }
    }
    if (crystal === 'trailed') {
      // Six blocks of tip, and a four-block trail over a box of sixteen.
      block(left + 1, 4, 3, 2, CRYSTAL);
      for (let step = 0; step < 4; step += 1) block(left + step, 10 + step, 1, 1, CRYSTAL);
    }
    if (label) block(left + POSE_COLUMNS, rows + 4, 1, 1, ROBE);
  }
  return raster;
}

/** The pixel a frame's recorded crystal point names, in the cut strip. */
function atCrystal(image: Raster, cellPx: number, frame: number, [x, y]: readonly [number, number]): Rgba {
  return pixelAt(image, frame * cellPx + x, y);
}

describe('cutStrip', () => {
  it('gives every pose a cell of its own, standing on the cell floor', () => {
    const { image, entry } = cutStrip(idle(4), sheet(4));

    expect(entry).toMatchObject({ width: 4 * CELL_PX, height: CELL_PX, cell: CELL, cellW: CELL, frames: 4 });
    // The pose is 4 of the cell's 32 columns wide and 24 of the rows tall, so
    // it sits 14 columns in from the cell's left edge and 8 rows down its top.
    const left = 14 * RENDER_DENSITY;
    const top = 8 * RENDER_DENSITY;

    expect(pixelAt(image, left, top)).toEqual(ROBE);
    expect(pixelAt(image, left, CELL_PX - 1)).toEqual(ROBE);
    expect(pixelAt(image, left, top - 1)).toEqual(NOTHING);
    expect(pixelAt(image, left - 1, top)).toEqual(NOTHING);
  });

  // Every wizard state and the poses asset-list.md gives its sheet, so the
  // counts the acceptance names are checked on fixtures and not only on the
  // real raws. The fall poses flail into a cell wider than it is tall.
  it.each([
    ['idle', 4, 32],
    ['run', 8, 32],
    ['jump', 7, 32],
    ['fall', 4, 40],
    ['charge', 5, 32],
  ])('cuts the %s sheet into its %i poses', (state, frames, cellW) => {
    const wizard: Sheet = { state, raw: `wizard-${state}.png`, pitch: PITCH, frames, cellW };
    const { entry } = cutStrip(wizard, sheet(frames));

    expect(entry).toMatchObject({ frames, cellW, cell: CELL, width: frames * cellW * RENDER_DENSITY, height: CELL_PX });
    expect(entry.crystal).toHaveLength(frames);
  });

  it('records where the crystal sits in each frame', () => {
    const { entry } = cutStrip(idle(4), sheet(4));

    // In the cell's own pixels, so the point moves with the density: the one
    // block of crystal is four pixels here and the centroid lands on the last
    // of them.
    expect(entry.crystal).toEqual([
      [35, 21],
      [35, 21],
      [35, 21],
      [35, 21],
    ]);
  });

  it('records a pixel of the crystal and not the hole in the middle of it', () => {
    const { image, entry } = cutStrip(idle(3), sheet(3, { crystal: 'hollow' }));

    // The box around this tip is 2 by 3 with nothing at its centre, so a point
    // taken from the box rather than the pixels names a transparent pixel.
    entry.crystal.forEach((point, frame) => {
      expect(atCrystal(image, CELL_PX, frame, point)).toEqual(CRYSTAL);
    });
  });

  it('records the tip rather than a spark trail spread over a wider box', () => {
    const { image, entry } = cutStrip(idle(3), sheet(3, { crystal: 'trailed' }));

    // The tip is drawn 2 and 3 rows down the pose, which stands 8 down its
    // cell; the trail runs from 8 rows down the pose to 11. Both are read in
    // the file's pixels, two to the world unit.
    entry.crystal.forEach((point, frame) => {
      expect(atCrystal(image, CELL_PX, frame, point)).toEqual(CRYSTAL);
      expect(point[1]).toBeGreaterThanOrEqual(20);
      expect(point[1]).toBeLessThanOrEqual(23);
    });
  });

  it('cuts a labelled sheet exactly as it cuts one without labels', () => {
    expect(cutStrip(idle(2), sheet(2))).toEqual(cutStrip(idle(2), sheet(2, { label: false })));
  });

  it('cuts the fall sheet into the wider cell its poses need', () => {
    const fall: Sheet = { state: 'fall', raw: 'wizard-fall.png', pitch: PITCH, frames: 3, cellW: 40 };
    const { entry } = cutStrip(fall, sheet(3));

    expect(entry).toMatchObject({ width: 3 * 40 * RENDER_DENSITY, cellW: 40, frames: 3 });
    expect(entry.crystal).toEqual([
      [43, 21],
      [43, 21],
      [43, 21],
    ]);
  });

  it('fails naming the file when the sheet holds the wrong number of poses', () => {
    expect(() => cutStrip(idle(4), sheet(3))).toThrow(/wizard-idle\.png splits into 3 poses, not the 4/);
  });

  it('fails naming the file and the frame when a pose shows no crystal', () => {
    expect(() => cutStrip(idle(2), sheet(2, { crystal: 'none' }))).toThrow(/wizard-idle\.png frame 1 shows no pale blue crystal/);
  });

  it('fails naming the file when a pose is too big for its cell', () => {
    expect(() => cutStrip(idle(2), sheet(2, { rows: 34 }))).toThrow(/wizard-idle\.png draws a pose 8x68/);
  });
});
