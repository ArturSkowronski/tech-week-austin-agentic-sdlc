// The manifest is read in world units, whatever density its art was drawn at
// (ADR-003, docs/plan/03-assets/pipeline.md). Loading the files themselves
// needs a browser and is covered in tests/smoke/parallax.spec.ts.

import { describe, expect, it } from 'vitest';

import { measure } from '../../game/render/sprites';

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
