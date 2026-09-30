// The manifest is read in world units, whatever density its art was drawn at
// (ADR-003, docs/plan/03-assets/pipeline.md). Loading the files themselves
// needs a browser and is covered in tests/smoke/parallax.spec.ts.

import { describe, expect, it } from 'vitest';

import { crystalOf, densityOf, measure, type PoseStripEntry } from '../../game/render/sprites';

describe('measuring a manifest entry', () => {
  it('reads art the kit records no density for as one pixel per unit', () => {
    expect(measure({ width: 640, height: 223, artRows: 103 })).toEqual({
      density: 1,
      height: 223,
      artHeight: 103,
    });
  });

  it('halves art drawn at density two, so a painting is its 22 tiles tall', () => {
    expect(measure({ width: 4224, height: 704, density: 2 })).toEqual({
      density: 2,
      height: 352,
      artHeight: 352,
    });
  });
});

/**
 * A hand-written 1x fall strip: four 40 by 32 cells at one pixel a unit. The
 * kit writes this sheet at density 2 since HWP-043; that reading is the case
 * below, which doubles these same numbers.
 */
const FALL: PoseStripEntry = {
  width: 160,
  height: 32,
  cell: 32,
  cellW: 40,
  frames: 4,
  crystal: [
    [33, 4],
    [32, 4],
    [32, 3],
    [32, 7],
  ],
};

describe('the crystal of one frame of a strip', () => {
  it('answers the middle of the pixel the kit recorded', () => {
    expect(crystalOf(FALL, 0, 1)).toEqual({ x: 33.5, y: 4.5 });
    expect(crystalOf(FALL, 3, 1)).toEqual({ x: 32.5, y: 7.5 });
  });

  it('mirrors it about the cell when he faces left, as the sprite is mirrored', () => {
    for (let frame = 0; frame < FALL.frames; frame += 1) {
      const right = crystalOf(FALL, frame, 1);
      const left = crystalOf(FALL, frame, -1);

      expect(left.y).toBe(right.y);
      expect(left.x + right.x).toBe(FALL.cellW);
    }
  });

  it('halves the point of a strip drawn at two pixels per unit', () => {
    expect(crystalOf({ ...FALL, height: 64, width: 320, crystal: [[67, 9]] }, 0, 1)).toEqual({
      x: 33.75,
      y: 4.75,
    });
  });

  it('refuses a frame the strip does not hold', () => {
    expect(() => crystalOf(FALL, 4, 1)).toThrow('has no frame 4');
  });
});

describe('the density of a strip', () => {
  it('reads a cell of 32 world units in a file 32 pixels tall as one', () => {
    expect(densityOf(FALL)).toBe(1);
  });

  it('reads asset-list.md\'s 64 px cells as two, the number the crystal is divided by', () => {
    const twice: PoseStripEntry = { ...FALL, height: 64, width: 320 };

    expect(densityOf(twice)).toBe(2);
    // The same number both halves of the draw have to agree on: the crystal
    // is divided by it above, so the cell has to be as well (ADR-003).
    expect(crystalOf(twice, 0, 1).x * densityOf(twice)).toBe(33.5);
  });
});
