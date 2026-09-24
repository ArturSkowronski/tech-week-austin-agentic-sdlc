// The asset kit's raster helpers on synthetic images (docs/plan/03-assets/
// pipeline.md, unit tests). Every raster here is drawn by hand in the test, so
// what a helper is asked to find is what the test just put there.

import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  boundingBox,
  connectedComponents,
  createRaster,
  crop,
  estimatePitch,
  extendBottom,
  fillRect,
  flip,
  hstack,
  keyMagenta,
  keyPageColour,
  loadPng,
  pixelAt,
  placeInCell,
  resampleBlocks,
  resizeToHeight,
  runs,
  savePng,
  toPalette,
  type Raster,
  type Rgb,
  type Rgba,
} from '../../tools/asset-kit/lib';

const OPAQUE = 255;
const ART: Rgba = [40, 120, 60, OPAQUE];
const MAGENTA: Rgba = [255, 0, 255, OPAQUE];

/** Five colours far enough apart that no two read as the same block. */
const BLOCK_COLOURS: readonly Rgba[] = [
  [200, 30, 30, OPAQUE],
  [30, 200, 30, OPAQUE],
  [30, 30, 200, OPAQUE],
  [200, 200, 30, OPAQUE],
  [90, 90, 90, OPAQUE],
];

/**
 * An image drawn in blocks of `pitch` pixels. Neighbouring blocks always take
 * different colours, so every block boundary is a real change and no wider
 * pitch can explain the image.
 */
function blockImage(pitch: number, cols: number, rows: number): Raster {
  let raster = createRaster(cols * pitch, rows * pitch);
  for (let by = 0; by < rows; by += 1) {
    for (let bx = 0; bx < cols; bx += 1) {
      const colour = BLOCK_COLOURS[(bx + by * 3) % BLOCK_COLOURS.length] ?? ART;
      raster = fillRect(raster, { x: bx * pitch, y: by * pitch, width: pitch, height: pitch }, colour);
    }
  }
  return raster;
}

/**
 * The image with every colour channel nudged by up to `amount`, which is how
 * a generated raw actually looks: the blocks are there, but the generator
 * dithers inside them. The sequence is a fixed one so the test is a replay.
 */
function jitter(raster: Raster, amount: number): Raster {
  const out = { ...raster, data: new Uint8Array(raster.data) };
  let seed = 1;
  const next = (): number => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  for (let i = 0; i < out.data.length; i += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const nudged = (out.data[i + channel] ?? 0) + Math.round((next() * 2 - 1) * amount);
      out.data[i + channel] = Math.max(0, Math.min(255, nudged));
    }
  }
  return out;
}

/** How many colours an opaque raster holds. */
function colourCount(raster: Raster): number {
  const seen = new Set<number>();
  for (let y = 0; y < raster.height; y += 1) {
    for (let x = 0; x < raster.width; x += 1) {
      const [r, g, b] = pixelAt(raster, x, y);
      seen.add((r << 16) | (g << 8) | b);
    }
  }
  return seen.size;
}

/** How many pixels of the raster are opaque and match a test. */
function count(raster: Raster, matches: (pixel: Rgba) => boolean): number {
  let found = 0;
  for (let y = 0; y < raster.height; y += 1) {
    for (let x = 0; x < raster.width; x += 1) {
      const pixel = pixelAt(raster, x, y);
      if (pixel[3] > 0 && matches(pixel)) found += 1;
    }
  }
  return found;
}

describe('pitch estimation', () => {
  it('reads the block size of a four pixel image', () => {
    expect(estimatePitch(blockImage(4, 8, 6))).toBe(4);
  });

  it('reads the block size of a two pixel image', () => {
    expect(estimatePitch(blockImage(2, 12, 9))).toBe(2);
  });

  it('reads the wider block sizes the generators draw at', () => {
    expect(estimatePitch(blockImage(7, 5, 4))).toBe(7);
    expect(estimatePitch(blockImage(8, 5, 4))).toBe(8);
  });

  it('reads the block size through the dither a generator leaves', () => {
    expect(estimatePitch(jitter(blockImage(4, 16, 12), 15))).toBe(4);
    expect(estimatePitch(jitter(blockImage(2, 24, 18), 15))).toBe(2);
    expect(estimatePitch(jitter(blockImage(8, 8, 6), 15))).toBe(8);
  });

  it('falls back to the narrowest pitch when there is no block structure', () => {
    expect(estimatePitch(createRaster(32, 32, [90, 90, 90, OPAQUE]))).toBe(2);
    expect(estimatePitch(jitter(createRaster(64, 64, [128, 128, 128, OPAQUE]), 60))).toBe(2);
  });

  it('reads the block size of a mostly flat image', () => {
    const sky = fillRect(createRaster(64, 64, [90, 90, 90, OPAQUE]), { x: 0, y: 48, width: 64, height: 16 }, ART);
    expect(estimatePitch(fillRect(sky, { x: 10, y: 46, width: 2, height: 2 }, MAGENTA))).toBe(2);
  });

  it('resamples a block image to one pixel per block', () => {
    const image = blockImage(4, 8, 6);
    const small = resampleBlocks(image, estimatePitch(image));
    expect([small.width, small.height]).toEqual([8, 6]);
    expect(pixelAt(small, 0, 0)).toEqual(pixelAt(image, 2, 2));
    expect(pixelAt(small, 7, 5)).toEqual(pixelAt(image, 30, 22));
  });
});

describe('keying', () => {
  /** Art on a magenta page, with the purple fringe the generators leave. */
  function sheet(): Raster {
    let raster = createRaster(16, 16, MAGENTA);
    raster = fillRect(raster, { x: 4, y: 4, width: 8, height: 8 }, [148, 60, 158, OPAQUE]);
    raster = fillRect(raster, { x: 5, y: 5, width: 6, height: 6 }, [94, 90, 109, OPAQUE]);
    raster = fillRect(raster, { x: 6, y: 6, width: 4, height: 4 }, ART);
    return raster;
  }

  it('leaves no magenta and no purple fringe', () => {
    const keyed = keyMagenta(sheet());
    expect(count(keyed, (p) => p[0] === MAGENTA[0] && p[1] === MAGENTA[1] && p[2] === MAGENTA[2])).toBe(0);
    expect(count(keyed, (p) => Math.min(p[0], p[2]) > p[1])).toBe(0);
  });

  it('cuts at the fringe threshold and despills what sits under it', () => {
    // 64 more purple than green is the fringe; 63 is art with a purple cast.
    let raster = createRaster(3, 1);
    raster = fillRect(raster, { x: 0, y: 0, width: 1, height: 1 }, [100, 36, 100, OPAQUE]);
    raster = fillRect(raster, { x: 1, y: 0, width: 1, height: 1 }, [100, 37, 100, OPAQUE]);
    raster = fillRect(raster, { x: 2, y: 0, width: 1, height: 1 }, [100, 101, 100, OPAQUE]);

    const keyed = keyMagenta(raster);
    expect(pixelAt(keyed, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(keyed, 1, 0)).toEqual([37, 37, 37, OPAQUE]);
    expect(pixelAt(keyed, 2, 0)).toEqual([100, 101, 100, OPAQUE]);
  });

  it('cuts the page away and keeps the art', () => {
    const keyed = keyMagenta(sheet());
    expect(pixelAt(keyed, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(keyed, 4, 4)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(keyed, 8, 8)).toEqual(ART);
  });

  it('keys a page colour from outside and keeps an enclosed hole', () => {
    const page: Rgba = [200, 200, 200, OPAQUE];
    let raster = createRaster(12, 12, page);
    raster = fillRect(raster, { x: 3, y: 3, width: 6, height: 6 }, ART);
    raster = fillRect(raster, { x: 5, y: 5, width: 2, height: 2 }, page);

    const keyed = keyPageColour(raster);
    expect(pixelAt(keyed, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(keyed, 3, 3)).toEqual(ART);
    expect(pixelAt(keyed, 5, 5)).toEqual(page);
  });

  it('leaves a sheet that already carries alpha alone, outline and all', () => {
    // The corner is transparent, so on colour alone it reads as near-black and
    // the fill would walk the surround and eat the outline.
    const outline: Rgba = [12, 10, 14, OPAQUE];
    let raster = createRaster(12, 12);
    raster = fillRect(raster, { x: 3, y: 3, width: 6, height: 6 }, outline);
    raster = fillRect(raster, { x: 4, y: 4, width: 4, height: 4 }, ART);

    const keyed = keyPageColour(raster);
    expect(pixelAt(keyed, 0, 0)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(keyed, 3, 3)).toEqual(outline);
    expect(pixelAt(keyed, 8, 8)).toEqual(outline);
    expect(pixelAt(keyed, 5, 5)).toEqual(ART);
  });
});

describe('connected components', () => {
  it('finds three blobs with their boxes', () => {
    let raster = createRaster(24, 24);
    raster = fillRect(raster, { x: 1, y: 1, width: 4, height: 3 }, ART);
    raster = fillRect(raster, { x: 12, y: 5, width: 6, height: 2 }, ART);
    raster = fillRect(raster, { x: 2, y: 14, width: 3, height: 7 }, ART);

    expect(connectedComponents(raster)).toEqual([
      { x: 1, y: 1, width: 4, height: 3 },
      { x: 12, y: 5, width: 6, height: 2 },
      { x: 2, y: 14, width: 3, height: 7 },
    ]);
  });

  it('reads a diagonal pixel stair as one blob', () => {
    let raster = createRaster(8, 8);
    for (let i = 0; i < 4; i += 1) {
      raster = fillRect(raster, { x: i + 1, y: i + 1, width: 1, height: 1 }, ART);
    }
    expect(connectedComponents(raster)).toEqual([{ x: 1, y: 1, width: 4, height: 4 }]);
  });
});

describe('cutting and placing', () => {
  /** A five by three patch of art in the middle of a transparent raster. */
  function patch(): Raster {
    return fillRect(createRaster(16, 12), { x: 4, y: 2, width: 5, height: 3 }, ART);
  }

  it('crops to a box and clips at either edge', () => {
    const cropped = crop(patch(), { x: 4, y: 2, width: 5, height: 3 });
    expect([cropped.width, cropped.height]).toEqual([5, 3]);
    expect(pixelAt(cropped, 0, 0)).toEqual(ART);
    expect(pixelAt(cropped, 4, 2)).toEqual(ART);
    expect(crop(patch(), { x: 14, y: 0, width: 8, height: 4 }).width).toBe(2);
    expect(crop(patch(), { x: -2, y: 0, width: 5, height: 4 }).width).toBe(3);
  });

  it('finds the bounding box of the art, and none when there is none', () => {
    expect(boundingBox(patch())).toEqual({ x: 4, y: 2, width: 5, height: 3 });
    expect(boundingBox(createRaster(4, 4))).toBeNull();
  });

  it('finds the runs of columns that hold art, ready to crop', () => {
    let raster = createRaster(12, 6);
    raster = fillRect(raster, { x: 1, y: 1, width: 2, height: 4 }, ART);
    raster = fillRect(raster, { x: 7, y: 2, width: 3, height: 2 }, ART);
    expect(runs(raster)).toEqual([
      { x: 1, y: 0, width: 2, height: 6 },
      { x: 7, y: 0, width: 3, height: 6 },
    ]);
  });

  it('places a frame bottom-centre in its cell', () => {
    const cell = placeInCell(createRaster(4, 3, ART), 10, 8);
    expect([cell.width, cell.height]).toEqual([10, 8]);
    expect(boundingBox(cell)).toEqual({ x: 3, y: 5, width: 4, height: 3 });
  });

  it('stacks frames side by side on the floor of the strip', () => {
    const strip = hstack([createRaster(2, 4, ART), createRaster(3, 2, ART)]);
    expect([strip.width, strip.height]).toEqual([5, 4]);
    expect(boundingBox(strip)).toEqual({ x: 0, y: 0, width: 5, height: 4 });
    expect(pixelAt(strip, 2, 0)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(strip, 2, 2)).toEqual(ART);
  });

  it('mirrors a raster left to right', () => {
    expect(boundingBox(flip(patch()))).toEqual({ x: 7, y: 2, width: 5, height: 3 });
  });

  it('extends the bottom with a base colour', () => {
    const extended = extendBottom(patch(), 6, [123, 150, 130]);
    expect([extended.width, extended.height]).toEqual([16, 18]);
    expect(pixelAt(extended, 0, 11)).toEqual([0, 0, 0, 0]);
    expect(pixelAt(extended, 0, 12)).toEqual([123, 150, 130, OPAQUE]);
    expect(pixelAt(extended, 4, 2)).toEqual(ART);
  });

  it('paints a box over the raster, the form a declared edit takes', () => {
    const edited = fillRect(patch(), { x: 0, y: 0, width: 16, height: 4 }, MAGENTA);
    expect(pixelAt(edited, 4, 2)).toEqual(MAGENTA);
    expect(pixelAt(edited, 4, 4)).toEqual(ART);
  });
});

describe('reading and writing files', () => {
  it('holds an image to a palette and reads the saved PNG back', async () => {
    const palette: Rgb[] = [
      [40, 120, 60],
      [200, 40, 40],
    ];
    let raster = createRaster(8, 8, [44, 118, 64, OPAQUE]);
    raster = fillRect(raster, { x: 2, y: 2, width: 4, height: 4 }, [196, 36, 44, OPAQUE]);

    const file = join(await mkdtemp(join(tmpdir(), 'asset-kit-')), 'out.png');
    await savePng(toPalette(raster, palette), file);
    const read = await loadPng(file);

    expect([read.width, read.height]).toEqual([8, 8]);
    expect(pixelAt(read, 0, 0)).toEqual(ART);
    expect(pixelAt(read, 4, 4)).toEqual([200, 40, 40, OPAQUE]);

    // Byte 25 is the IHDR colour type: 3 is indexed, which pipeline.md asks
    // for and the pixel assertions above would not notice the loss of.
    expect((await readFile(file))[25]).toBe(3);
  });

  it('reduces to the colour count it is given, the way a background is', async () => {
    let raster = createRaster(8, 8);
    for (let i = 0; i < 8; i += 1) {
      raster = fillRect(raster, { x: 0, y: i, width: 8, height: 1 }, [20 + i * 30, 200 - i * 20, 40 + i * 25, OPAQUE]);
    }
    const directory = await mkdtemp(join(tmpdir(), 'asset-kit-'));

    const all = join(directory, 'all.png');
    await savePng(raster, all);
    expect(colourCount(await loadPng(all))).toBe(8);

    const few = join(directory, 'few.png');
    await savePng(raster, few, 4);
    expect((await readFile(few))[25]).toBe(3);
    expect(colourCount(await loadPng(few))).toBeLessThanOrEqual(4);
  });

  it('resizes to a height, keeping the shape', async () => {
    const resized = await resizeToHeight(createRaster(8, 4, ART), 8);
    expect([resized.width, resized.height]).toEqual([16, 8]);
    expect(pixelAt(resized, 0, 0)).toEqual(ART);
  });
});
