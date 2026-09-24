// The raster helpers the asset kit is built from
// (docs/plan/03-assets/pipeline.md). Every generated raw goes through these on
// its way into public/assets/: it is keyed, resampled to one pixel per drawn
// block, cut up, and saved as an indexed PNG.
//
// A Raster is plain RGBA bytes so the helpers stay pure and testable on
// synthetic images; sharp is used only at the edges, to read and write PNGs
// and to resize. Every helper returns a new raster and never edits its input,
// so a build step reads as a chain of named stages.

import sharp from 'sharp';

/** A colour without alpha: a palette entry, a page colour, a base fill. */
export type Rgb = readonly [number, number, number];

/** A pixel: red, green, blue, alpha, each 0 to 255. */
export type Rgba = readonly [number, number, number, number];

/** An image in memory: RGBA bytes, four per pixel, row by row from the top. */
export interface Raster {
  width: number;
  height: number;
  data: Uint8Array;
}

/** A rectangle in pixels, from its top-left corner. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Bytes per pixel. */
const CHANNELS = 4;

/** The block sizes the generators draw at (pipeline.md, pitch estimation). */
export const PITCHES = [2, 4, 7, 8] as const;

/** How much worse than the best a pitch may score and still win the tie. */
const PITCH_TOLERANCE = 0.02;

/**
 * How close to the no-structure score of 1 the best pitch may sit and still
 * count as evidence that the image was drawn in blocks at all.
 */
const UNSTRUCTURED = 0.9;

/** The channel difference below which two pixels are the same colour. */
const NOISE = 8;

/** How much more purple than green the magenta key and its fringe are. */
const FRINGE = 64;

/** How far a pixel may sit from the page colour and still be the page. */
const PAGE_TOLERANCE = 24;

/** A new raster, every pixel the fill colour, transparent by default. */
export function createRaster(width: number, height: number, fill: Rgba = [0, 0, 0, 0]): Raster {
  const data = new Uint8Array(width * height * CHANNELS);
  if (fill.some((channel) => channel !== 0)) {
    for (let i = 0; i < data.length; i += CHANNELS) {
      data.set(fill, i);
    }
  }
  return { width, height, data };
}

/** The pixel at a point. Outside the raster reads as transparent black. */
export function pixelAt(raster: Raster, x: number, y: number): Rgba {
  if (x < 0 || y < 0 || x >= raster.width || y >= raster.height) return [0, 0, 0, 0];
  const i = (y * raster.width + x) * CHANNELS;
  const d = raster.data;
  return [d[i] ?? 0, d[i + 1] ?? 0, d[i + 2] ?? 0, d[i + 3] ?? 0];
}

/** How opaque the pixel at a point inside the raster is. */
function alphaAt(raster: Raster, x: number, y: number): number {
  return raster.data[(y * raster.width + x) * CHANNELS + 3] ?? 0;
}

/** A PNG read into memory, with an alpha channel whether or not it had one. */
export async function loadPng(file: string): Promise<Raster> {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data };
}

/**
 * The raster written as an indexed PNG of at most `colours` colours, which is
 * how backgrounds are reduced to 32. Art that must keep an exact palette goes
 * through `toPalette` first and is saved at the default, where the quantiser
 * has nothing left to merge.
 */
export async function savePng(raster: Raster, file: string, colours = 256): Promise<void> {
  await sharp(raster.data, { raw: { width: raster.width, height: raster.height, channels: CHANNELS } })
    .png({ palette: true, colours, dither: 0 })
    .toFile(file);
}

/** Every opaque pixel moved to its nearest entry in a palette. */
export function toPalette(raster: Raster, palette: readonly Rgb[]): Raster {
  const out = { ...raster, data: new Uint8Array(raster.data) };
  for (let i = 0; i < out.data.length; i += CHANNELS) {
    if ((out.data[i + 3] ?? 0) === 0) continue;
    out.data.set(nearest([out.data[i] ?? 0, out.data[i + 1] ?? 0, out.data[i + 2] ?? 0], palette), i);
  }
  return out;
}

/** The palette entry closest to a colour, by squared distance. */
function nearest(colour: Rgb, palette: readonly Rgb[]): Rgb {
  let best: Rgb = colour;
  let bestDistance = Infinity;
  for (const entry of palette) {
    const distance = squaredDistance(colour, entry);
    if (distance < bestDistance) {
      best = entry;
      bestDistance = distance;
    }
  }
  return best;
}

/** How far apart two colours are, squared, so no square root is needed. */
function squaredDistance(a: Rgb | Rgba, b: Rgb | Rgba): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

/**
 * The drawn block size of a generated image. A picture drawn at a pitch
 * changes colour hard on its block boundaries and only dithers inside a block,
 * so each candidate is scored by how weak the change inside its blocks is
 * against the change on its boundaries, and the widest pitch that reads the
 * image as well as any other wins: a 4 px image is also flat across every 2 px
 * boundary, and 4 is the answer wanted. An image with no block structure to
 * read scores near 1 at every pitch, and the narrowest pitch is then the safe
 * answer: resampling at 8 would throw away seven pixels in eight.
 */
export function estimatePitch(raster: Raster): number {
  const scored = PITCHES.map((pitch) => ({ pitch, score: blockContrast(raster, pitch) }));
  const best = Math.min(...scored.map((candidate) => candidate.score));
  if (best >= UNSTRUCTURED) return PITCHES[0];
  const fit = scored.filter((candidate) => candidate.score <= best + PITCH_TOLERANCE);
  return fit[fit.length - 1]?.pitch ?? PITCHES[0];
}

/**
 * How weakly a pitch's blocks hold together: the mean colour change inside a
 * block over the mean change on its boundaries, so 0 is a picture drawn
 * exactly at this pitch and 1 is one that knows nothing about it. Comparing
 * the two means is what keeps the generator's dither out of the answer —
 * dither lifts both means alike, so it cancels. Counting changes instead,
 * which is what a share of the image's change does, reads a dithered raw as
 * change everywhere and hands every pitch its own share of the image, and the
 * narrowest pitch wins that by construction whatever the image was drawn at.
 */
function blockContrast(raster: Raster, pitch: number): number {
  const rowBytes = raster.width * CHANNELS;
  let onSum = 0;
  let onCount = 0;
  let insideSum = 0;
  let insideCount = 0;
  const add = (boundary: boolean, change: number): void => {
    if (boundary) {
      onSum += change;
      onCount += 1;
    } else {
      insideSum += change;
      insideCount += 1;
    }
  };
  for (let y = 0; y < raster.height; y += 1) {
    for (let x = 0; x < raster.width; x += 1) {
      const at = (y * raster.width + x) * CHANNELS;
      if (x > 0) add(x % pitch === 0, changeAt(raster.data, at, at - CHANNELS));
      if (y > 0) add(y % pitch === 0, changeAt(raster.data, at, at - rowBytes));
    }
  }
  const onBoundary = onCount === 0 ? 0 : onSum / onCount;
  const inside = insideCount === 0 ? 0 : insideSum / insideCount;
  return onBoundary <= 0 ? 1 : Math.min(1, inside / onBoundary);
}

/**
 * How far apart the two pixels at these byte offsets are, in the channel that
 * moved most, with the noise band taken off so two pixels of one drawn colour
 * read as no change at all.
 */
function changeAt(data: Uint8Array, a: number, b: number): number {
  let most = 0;
  for (let channel = 0; channel < CHANNELS; channel += 1) {
    const difference = Math.abs((data[a + channel] ?? 0) - (data[b + channel] ?? 0));
    if (difference > most) most = difference;
  }
  return most > NOISE ? most - NOISE : 0;
}

/**
 * The image resampled at block centres, so one drawn block of `pitch` pixels
 * becomes one pixel. Sampling the centre, not the corner, keeps the block's
 * own colour rather than the seam between two blocks.
 */
export function resampleBlocks(raster: Raster, pitch: number): Raster {
  const width = Math.max(1, Math.round(raster.width / pitch));
  const height = Math.max(1, Math.round(raster.height / pitch));
  const out = createRaster(width, height);
  const centre = Math.floor(pitch / 2);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(x * pitch + centre, raster.width - 1);
      const sy = Math.min(y * pitch + centre, raster.height - 1);
      out.data.set(pixelAt(raster, sx, sy), (y * width + x) * CHANNELS);
    }
  }
  return out;
}

/**
 * The magenta key with its purple despill. A generated sheet keys on #ff00ff,
 * and the generator leaves a purple fringe where the magenta met the art. Both
 * read as "more purple than green": strongly purple pixels are cut away, and
 * what is left has its purple cast clamped off, so no fringe survives. The
 * game's palette — greens, gold, browns, charcoal, pale blue — is never more
 * purple than green, so nothing the art wanted is touched.
 */
export function keyMagenta(raster: Raster): Raster {
  const out = { ...raster, data: new Uint8Array(raster.data) };
  for (let i = 0; i < out.data.length; i += CHANNELS) {
    const r = out.data[i] ?? 0;
    const g = out.data[i + 1] ?? 0;
    const b = out.data[i + 2] ?? 0;
    const purple = Math.min(r, b) - g;
    if (purple >= FRINGE) {
      out.data.set([0, 0, 0, 0], i);
    } else if (purple > 0) {
      out.data[i] = Math.min(r, g);
      out.data[i + 2] = Math.min(b, g);
    }
  }
  return out;
}

/**
 * The page colour, the colour of the top-left corner no sheet draws on, keyed
 * away by a flood fill from outside the art, so a page-coloured hole enclosed
 * by a prop stays part of the prop.
 *
 * A pixel is the page only when its alpha matches the corner's as well as its
 * colour. A sheet that already carries alpha has a transparent corner, and on
 * RGB alone that corner is near-black: the fill would walk the transparent
 * surround and then eat the dark outline art-direction.md asks every sprite
 * for. Matching the alpha makes this the no-op it should be on such a sheet —
 * the caller wanted the alpha path, and the art comes back untouched.
 */
export function keyPageColour(raster: Raster): Raster {
  const out = { ...raster, data: new Uint8Array(raster.data) };
  const page = pixelAt(raster, 0, 0);
  const seen = new Uint8Array(raster.width * raster.height);
  const stack: number[] = [];
  const visit = (at: number): void => {
    if (seen[at] === 0) {
      seen[at] = 1;
      stack.push(at);
    }
  };
  for (let x = 0; x < raster.width; x += 1) {
    visit(x);
    visit(x + (raster.height - 1) * raster.width);
  }
  for (let y = 0; y < raster.height; y += 1) {
    visit(y * raster.width);
    visit(y * raster.width + raster.width - 1);
  }
  while (stack.length > 0) {
    const at = stack.pop() ?? 0;
    const x = at % raster.width;
    const y = (at - x) / raster.width;
    const pixel = pixelAt(raster, x, y);
    if (pixel[3] !== page[3]) continue;
    if (squaredDistance(pixel, page) > PAGE_TOLERANCE * PAGE_TOLERANCE) continue;
    out.data.set([0, 0, 0, 0], at * CHANNELS);
    if (x > 0) visit(at - 1);
    if (x < raster.width - 1) visit(at + 1);
    if (y > 0) visit(at - raster.width);
    if (y < raster.height - 1) visit(at + raster.width);
  }
  return out;
}

/** The part of the raster inside a box, clipped to what the raster holds. */
export function crop(raster: Raster, box: Box): Raster {
  const x = Math.max(0, box.x);
  const y = Math.max(0, box.y);
  const width = Math.max(0, Math.min(box.x + box.width, raster.width) - x);
  const height = Math.max(0, Math.min(box.y + box.height, raster.height) - y);
  const out = createRaster(width, height);
  for (let row = 0; row < height; row += 1) {
    const from = ((y + row) * raster.width + x) * CHANNELS;
    out.data.set(raster.data.subarray(from, from + width * CHANNELS), row * width * CHANNELS);
  }
  return out;
}

/** A box grown to hold one more pixel, or the pixel's own box if it is first. */
function grow(box: Box | null, x: number, y: number): Box {
  if (box === null) return { x, y, width: 1, height: 1 };
  const left = Math.min(box.x, x);
  const top = Math.min(box.y, y);
  return {
    x: left,
    y: top,
    width: Math.max(box.x + box.width, x + 1) - left,
    height: Math.max(box.y + box.height, y + 1) - top,
  };
}

/** The smallest box holding every pixel that is not transparent, or null. */
export function boundingBox(raster: Raster): Box | null {
  let box: Box | null = null;
  for (let y = 0; y < raster.height; y += 1) {
    for (let x = 0; x < raster.width; x += 1) {
      if (alphaAt(raster, x, y) > 0) box = grow(box, x, y);
    }
  }
  return box;
}

/**
 * The runs of neighbouring columns that hold art, as full-height boxes ready
 * to crop. This is how a pose sheet is split into frames: the gaps between the
 * runs are the gaps the generator drew between the poses.
 */
export function runs(raster: Raster): Box[] {
  const found: Box[] = [];
  let start = -1;
  for (let x = 0; x < raster.width; x += 1) {
    let used = false;
    for (let y = 0; y < raster.height && !used; y += 1) {
      used = alphaAt(raster, x, y) > 0;
    }
    if (used && start < 0) start = x;
    if (!used && start >= 0) {
      found.push({ x: start, y: 0, width: x - start, height: raster.height });
      start = -1;
    }
  }
  if (start >= 0) found.push({ x: start, y: 0, width: raster.width - start, height: raster.height });
  return found;
}

/**
 * The raster placed in a transparent cell, centred left to right and sitting
 * on the cell's floor, which is how every frame is aligned: the wizard and the
 * props stand on the bottom of their cell, whatever their drawn height.
 */
export function placeInCell(raster: Raster, cellWidth: number, cellHeight: number): Raster {
  const out = createRaster(cellWidth, cellHeight);
  pasteInto(out, raster, Math.floor((cellWidth - raster.width) / 2), cellHeight - raster.height);
  return out;
}

/** The rasters laid side by side, each sitting on the floor of the strip. */
export function hstack(rasters: readonly Raster[]): Raster {
  const width = rasters.reduce((sum, raster) => sum + raster.width, 0);
  const height = Math.max(0, ...rasters.map((raster) => raster.height));
  const out = createRaster(width, height);
  let left = 0;
  for (const raster of rasters) {
    pasteInto(out, raster, left, height - raster.height);
    left += raster.width;
  }
  return out;
}

/** One raster written over another at a point, row by row, clipped to it. */
function pasteInto(target: Raster, source: Raster, left: number, top: number): void {
  const from = Math.max(0, -left);
  const span = Math.min(source.width, target.width - left) - from;
  if (span <= 0) return;
  for (let y = 0; y < source.height; y += 1) {
    if (top + y < 0 || top + y >= target.height) continue;
    const start = (y * source.width + from) * CHANNELS;
    const to = ((top + y) * target.width + left + from) * CHANNELS;
    target.data.set(source.data.subarray(start, start + span * CHANNELS), to);
  }
}

/** The raster mirrored left to right; the foreground layer is one of these. */
export function flip(raster: Raster): Raster {
  const out = createRaster(raster.width, raster.height);
  for (let y = 0; y < raster.height; y += 1) {
    for (let x = 0; x < raster.width; x += 1) {
      out.data.set(pixelAt(raster, raster.width - 1 - x, y), (y * raster.width + x) * CHANNELS);
    }
  }
  return out;
}

/**
 * The raster with rows of one colour added below it, the base each background
 * layer stands on so a room can be taller than the drawn art.
 */
export function extendBottom(raster: Raster, rows: number, colour: Rgb): Raster {
  const out = createRaster(raster.width, raster.height + rows, [colour[0], colour[1], colour[2], 255]);
  out.data.set(raster.data, 0);
  return out;
}

/**
 * The boxes of the connected regions of pixels that are not transparent,
 * eight-connected so a diagonal pixel stair stays one object, in the reading
 * order of the first pixel of each region.
 */
export function connectedComponents(raster: Raster): Box[] {
  const seen = new Uint8Array(raster.width * raster.height);
  const boxes: Box[] = [];
  for (let y = 0; y < raster.height; y += 1) {
    for (let x = 0; x < raster.width; x += 1) {
      if (seen[y * raster.width + x] === 0 && alphaAt(raster, x, y) > 0) {
        boxes.push(region(raster, seen, x, y));
      }
    }
  }
  return boxes;
}

/** The box of the one region reached from a starting pixel, marking it seen. */
function region(raster: Raster, seen: Uint8Array, startX: number, startY: number): Box {
  let box: Box = { x: startX, y: startY, width: 1, height: 1 };
  const start = startY * raster.width + startX;
  seen[start] = 1;
  const stack = [start];
  while (stack.length > 0) {
    const at = stack.pop() ?? 0;
    const x = at % raster.width;
    const y = (at - x) / raster.width;
    box = grow(box, x, y);
    for (let ny = Math.max(0, y - 1); ny <= Math.min(raster.height - 1, y + 1); ny += 1) {
      for (let nx = Math.max(0, x - 1); nx <= Math.min(raster.width - 1, x + 1); nx += 1) {
        const next = ny * raster.width + nx;
        if (seen[next] === 0 && alphaAt(raster, nx, ny) > 0) {
          seen[next] = 1;
          stack.push(next);
        }
      }
    }
  }
  return box;
}

/** The raster scaled to a height, keeping its shape and its square pixels. */
export async function resizeToHeight(raster: Raster, height: number): Promise<Raster> {
  const { data, info } = await sharp(raster.data, {
    raw: { width: raster.width, height: raster.height, channels: CHANNELS },
  })
    .resize({ height, kernel: 'nearest' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data };
}

/** The raster with a box painted over it, the form a declared edit takes. */
export function fillRect(raster: Raster, box: Box, colour: Rgba): Raster {
  const out = { ...raster, data: new Uint8Array(raster.data) };
  pasteInto(out, createRaster(box.width, box.height, colour), box.x, box.y);
  return out;
}
