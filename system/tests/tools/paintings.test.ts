// Joining a room's painting out of its panels, on synthetic panels
// (docs/plan/03-assets/pipeline.md, unit tests). Every panel here is drawn by
// the test at a known size, on the magenta page the generated panels carry, so
// what comes out of the join is measured against what the test just drew. The
// sizes are the ones the plan fixes rather than anything the kit computes: a
// painting is 22 tiles tall at 32 px per tile, so 704 (ADR-004, world units
// and render density).

import { describe, expect, it } from 'vitest';

import { alphaAt, createRaster, fillRect, pixelAt, type Box, type Raster, type Rgba } from '../../tools/asset-kit/lib';
import { fitPanel, joinPanels } from '../../tools/asset-kit/paintings';

const OPAQUE = 255;
const MAGENTA: Rgba = [255, 0, 255, OPAQUE];
const ROCK: Rgba = [70, 64, 58, OPAQUE];

/** A painting is 22 tiles of 32 px tall, and joins on whole tiles. */
const HEIGHT = 704;
const TILE_PX = 32;

/** A generated panel is drawn 3:1, and the real ones are this size. */
const RAW_W = 1920;
const RAW_H = 640;

/** What `resizeToHeight` does to a coordinate of a 3:1 panel fitted to 704. */
const SCALE = HEIGHT / RAW_H;

/** A panel as the generator hands it over: rock, on a magenta page. */
function panel(): Raster {
  const page = createRaster(RAW_W, RAW_H, MAGENTA);
  return fillRect(page, { x: 0, y: 160, width: RAW_W, height: RAW_H - 160 }, ROCK);
}

/** The walkway a cut takes out, in the panel's own pixels. */
const WALKWAY: Box = { x: 600, y: 240, width: 320, height: 160 };

describe('fitPanel', () => {
  it('fits a 3:1 panel to the height a room is tall', async () => {
    const fitted = await fitPanel({ raw: 'painting-test-1.png' }, panel());
    expect(fitted.height).toBe(HEIGHT);
    expect(fitted.width).toBe(RAW_W * SCALE);
  });

  it('keys the page away and keeps the art', async () => {
    const fitted = await fitPanel({ raw: 'painting-test-1.png' }, panel());
    expect(alphaAt(fitted, 10, 10)).toBe(0);
    expect(pixelAt(fitted, 10, HEIGHT - 10)).toEqual(ROCK);
  });

  it('paints a declared cut out before the key, so the cut comes back as air', async () => {
    const cut = await fitPanel({ raw: 'painting-test-1.png', cuts: [WALKWAY] }, panel());
    const middle = { x: Math.round((WALKWAY.x + WALKWAY.width / 2) * SCALE), y: Math.round((WALKWAY.y + WALKWAY.height / 2) * SCALE) };
    expect(alphaAt(cut, middle.x, middle.y)).toBe(0);
    // Every row and column the rectangle covers is air, not just its middle,
    // and nothing of the key colour it was painted with survives anywhere.
    for (let y = Math.ceil((WALKWAY.y + 1) * SCALE); y < (WALKWAY.y + WALKWAY.height - 1) * SCALE; y += 1) {
      for (let x = Math.ceil((WALKWAY.x + 1) * SCALE); x < (WALKWAY.x + WALKWAY.width - 1) * SCALE; x += 1) {
        expect(alphaAt(cut, x, y)).toBe(0);
      }
    }
    // The rock beside the cut is untouched: a cut takes its rectangle only.
    expect(pixelAt(cut, Math.round((WALKWAY.x - 20) * SCALE), middle.y)).toEqual(ROCK);
  });

  it('leaves the rock the generator drew where no cut is declared', async () => {
    const whole = await fitPanel({ raw: 'painting-test-1.png' }, panel());
    const middle = { x: Math.round((WALKWAY.x + WALKWAY.width / 2) * SCALE), y: Math.round((WALKWAY.y + WALKWAY.height / 2) * SCALE) };
    expect(pixelAt(whole, middle.x, middle.y)).toEqual(ROCK);
  });
});

describe('joinPanels', () => {
  it('lays the panels out left to right and counts the tiles they cover', () => {
    const { image, entry } = joinPanels([createRaster(2112, HEIGHT, ROCK), createRaster(2112, HEIGHT, ROCK)]);
    expect(image.width).toBe(4224);
    expect(image.height).toBe(HEIGHT);
    expect(entry).toEqual({ width: 4224, height: HEIGHT, density: 2, tiles: 4224 / TILE_PX });
  });

  it('refuses a join that is no whole number of tiles wide', () => {
    expect(() => joinPanels([createRaster(1000, HEIGHT, ROCK), createRaster(1000, HEIGHT, ROCK)])).toThrow(
      /no whole number of 32 px tiles/,
    );
  });
});
