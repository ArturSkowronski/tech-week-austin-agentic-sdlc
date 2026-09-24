// Cutting the wizard's pose sheets into strips (docs/plan/03-assets/
// pipeline.md, wizard strips). Each raw draws one state's poses side by side
// on a magenta page, at the block size PROVENANCE.md records for it, with a
// generated label under every pose. What comes out is a strip of cells, each
// pose standing on the floor of its own, and the point the crystal's light
// sits at in every frame: the crystal is the wizard's light
// (art-direction.md), so the renderer hangs its glow and its sparks there.

import {
  boundingBox,
  connectedComponents,
  createRaster,
  crop,
  hstack,
  keyMagenta,
  pixelAt,
  placeInCell,
  resampleBlocks,
  runs,
  type Raster,
} from './lib';

/** A point in a cell: how far in from its left edge, how far down from its top. */
export type Point = readonly [number, number];

/** One pose sheet: which raw it is, and what the plan says it holds. */
export interface Sheet {
  /** The state, which names the output: `sprites/wizard-<state>`. */
  state: string;
  /** The file in `assets/` the poses are drawn on. */
  raw: string;
  /** The block size it was drawn at (assets/PROVENANCE.md, wizard rows). */
  pitch: number;
  /** How many poses it holds (asset-list.md, wizard table). */
  frames: number;
  /** Its cell's width, when the poses need more room than a cell is tall. */
  cellW?: number;
}

/** What the manifest records about one strip (pipeline.md, manifest entries). */
export interface StripEntry {
  width: number;
  height: number;
  /** The cell's height in world units; every pose stands on its floor. */
  cell: number;
  /** The cell's width, which the strip is this many frames of. */
  cellW: number;
  frames: number;
  /** Where the crystal sits in each frame, in its cell's coordinates. */
  crystal: readonly Point[];
}

/** Bytes per pixel, as `lib.ts` lays a raster out. */
const CHANNELS = 4;

/** The wizard's cell, 32 by 32 world units (asset-list.md, wizard). */
const CELL = 32;

/** How tall a region has to be to be a pose rather than a label's remains. */
const LEAST_POSE_ROWS = CELL / 2;

/** How much bluer than warm a pixel is before it reads as the crystal. */
const CRYSTAL_BLUE = 24;

/** One sheet cut into the strip its state is written as, and its entry. */
export function cutStrip(sheet: Sheet, raster: Raster): { image: Raster; entry: StripEntry } {
  const cellW = sheet.cellW ?? CELL;
  const poses = dropLabels(keyMagenta(resampleBlocks(raster, sheet.pitch)));
  const columns = runs(poses);
  if (columns.length !== sheet.frames) {
    throw new Error(`${sheet.raw} splits into ${columns.length} columns, not the ${sheet.frames} poses asset-list.md gives the ${sheet.state} sheet`);
  }
  const cells = columns.map((column) => toCell(sheet, crop(poses, column), cellW));
  const image = hstack(cells);
  return {
    image,
    entry: {
      width: image.width,
      height: image.height,
      cell: CELL,
      cellW,
      frames: cells.length,
      crystal: cells.map((cell, frame) => crystalOf(sheet, cell, frame)),
    },
  };
}

/**
 * The sheet with everything too short to be a pose taken off it. Keying the
 * magenta leaves a few pixels of each generated label behind, and those would
 * otherwise read as columns of their own and stretch every cell to reach them.
 * A pose stands most of a cell tall and a label's remains are a pixel or
 * three, so a region's height tells the two apart with room to spare.
 *
 * A region is kept as its box, so a spark drawn just clear of the wand comes
 * along with the pose whose box it falls in.
 */
function dropLabels(raster: Raster): Raster {
  const out = createRaster(raster.width, raster.height);
  for (const box of connectedComponents(raster)) {
    if (box.height < LEAST_POSE_ROWS) continue;
    for (let y = box.y; y < box.y + box.height; y += 1) {
      const from = (y * raster.width + box.x) * CHANNELS;
      out.data.set(raster.data.subarray(from, from + box.width * CHANNELS), from);
    }
  }
  return out;
}

/**
 * One column of the sheet as a cell: the drawn pixels cut out of it and stood
 * bottom-centre, which is the alignment every frame of every state shares, so
 * the renderer draws a strip by its cell and never by its art.
 */
function toCell(sheet: Sheet, column: Raster, cellW: number): Raster {
  const drawn = boundingBox(column);
  // `runs` hands back only columns that hold art, so there is always a box.
  const pose = drawn === null ? column : crop(column, drawn);
  if (pose.width > cellW || pose.height > CELL) {
    throw new Error(`${sheet.raw} draws a pose ${pose.width}x${pose.height} at ${sheet.pitch} px blocks, too big for its ${cellW}x${CELL} cell`);
  }
  return placeInCell(pose, cellW, CELL);
}

/**
 * Where the crystal sits in one cell. Pale blue is the wizard's magic and
 * nothing else: his palette is forest greens, aged gold, charcoal and warm
 * browns (art-direction.md). So the crystal is found as pixels that are bluer
 * than they are warm, and the patch holding the most of them is the tip rather
 * than a stray highlight on the robe. Counting a patch's pixels rather than
 * measuring its box is what tells the tip from the charge sheet's spark trail
 * (asset-list.md, wizard): the trail spreads a handful of pixels over a box
 * wider than the compact tip's.
 *
 * The point recorded is the patch's centroid pulled onto the nearest pixel of
 * the patch itself, so the light the renderer hangs here (wizard.md, render)
 * always sits on drawn crystal. A centre alone does not: frame 4 of the charge
 * sheet is four pixels around the corners of a 2x3 box, and the centre of that
 * box falls in the hole between them.
 */
function crystalOf(sheet: Sheet, cell: Raster, frame: number): Point {
  const patches = bluePatches(cell);
  if (patches.length === 0) {
    throw new Error(`${sheet.raw} frame ${frame + 1} shows no pale blue crystal, and every frame has to show one`);
  }
  const crystal = patches.reduce((best, patch) => (patch.length > best.length ? patch : best));
  return nearestIn(crystal, centroid(crystal));
}

/**
 * The cell's pale blue pixels, grouped into the patches they touch each other
 * in. `connectedComponents` groups the same way but answers boxes, and which
 * pixels a patch holds is what both the count and the centroid are taken from.
 */
function bluePatches(cell: Raster): Point[][] {
  const mask = blueOf(cell);
  const seen = new Uint8Array(mask.width * mask.height);
  const patches: Point[][] = [];
  for (let y = 0; y < mask.height; y += 1) {
    for (let x = 0; x < mask.width; x += 1) {
      if (seen[y * mask.width + x] === 0 && lit(mask, x, y)) {
        patches.push(patchFrom(mask, seen, x, y));
      }
    }
  }
  return patches;
}

/** The one patch reached from a starting pixel, marking every pixel seen. */
function patchFrom(mask: Raster, seen: Uint8Array, startX: number, startY: number): Point[] {
  const patch: Point[] = [];
  const stack: Point[] = [[startX, startY]];
  seen[startY * mask.width + startX] = 1;
  while (stack.length > 0) {
    const at = stack.pop();
    if (at === undefined) break;
    patch.push(at);
    const [x, y] = at;
    for (let ny = Math.max(0, y - 1); ny <= Math.min(mask.height - 1, y + 1); ny += 1) {
      for (let nx = Math.max(0, x - 1); nx <= Math.min(mask.width - 1, x + 1); nx += 1) {
        if (seen[ny * mask.width + nx] === 0 && lit(mask, nx, ny)) {
          seen[ny * mask.width + nx] = 1;
          stack.push([nx, ny]);
        }
      }
    }
  }
  return patch;
}

/** Whether a point of the pale blue mask is one of its pixels at all. */
function lit(mask: Raster, x: number, y: number): boolean {
  return (mask.data[(y * mask.width + x) * CHANNELS + 3] ?? 0) > 0;
}

/** The average of a patch's pixels, which is where its weight sits. */
function centroid(patch: Point[]): Point {
  let sumX = 0;
  let sumY = 0;
  for (const [x, y] of patch) {
    sumX += x;
    sumY += y;
  }
  return [Math.round(sumX / patch.length), Math.round(sumY / patch.length)];
}

/**
 * The patch's own pixel closest to a point, the first one found where two tie.
 * Patches are walked from the top-left down, so the same cell always answers
 * the same pixel and `pnpm assets` stays idempotent (pipeline.md, invariants).
 */
function nearestIn(patch: Point[], [toX, toY]: Point): Point {
  let best: Point = [toX, toY];
  let bestFar = Number.POSITIVE_INFINITY;
  for (const point of patch) {
    const far = (point[0] - toX) ** 2 + (point[1] - toY) ** 2;
    if (far < bestFar) {
      best = point;
      bestFar = far;
    }
  }
  return best;
}

/** The shape a cell's pale blue pixels make, which is all a patch needs. */
function blueOf(cell: Raster): Raster {
  const out = createRaster(cell.width, cell.height);
  for (let y = 0; y < cell.height; y += 1) {
    for (let x = 0; x < cell.width; x += 1) {
      const [red, green, blue, alpha] = pixelAt(cell, x, y);
      if (alpha > 0 && blue - Math.max(red, green) >= CRYSTAL_BLUE) {
        out.data[(y * cell.width + x) * CHANNELS + 3] = alpha;
      }
    }
  }
  return out;
}
