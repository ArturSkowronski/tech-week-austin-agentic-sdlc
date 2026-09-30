// Cutting the wizard's pose sheets into strips (docs/plan/03-assets/
// pipeline.md, wizard strips). Each raw draws one state's poses on a magenta
// page, at the block size PROVENANCE.md records for it, with a generated
// label under every pose. What comes out is a strip of cells, each pose
// standing on the floor of its own, and the point the crystal's light sits at
// in every frame: the crystal is the wizard's light (art-direction.md), so
// the renderer hangs its glow and its sparks there.

import { RENDER_DENSITY } from '../../game/render/config';

import {
  alphaAt,
  boundingBox,
  connectedComponents,
  createRaster,
  crop,
  hstack,
  keyMagenta,
  pixelAt,
  resampleBlocks,
  runs,
  type Box,
  type Raster,
} from './lib';

// The renderer is the other reader of what this file records, and it has to
// survive in a browser, so the shape of a strip entry is declared there and
// taken from there (AGENTS.md rule 9). Types only: no renderer code, and no
// pixi.js, reaches the asset build.
import type { Point, PoseStripEntry, StripEntry } from '../../game/render/sprites';

export type { Point, PoseStripEntry, StripEntry };

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
  /**
   * The cell's reference column, for a sheet whose art is not centred on the
   * wizard: the column the renderer puts on the player, where a centred cell's
   * own middle would go. See {@link standUp}.
   */
  anchor?: number;
  /**
   * The crystal of a frame {@link crystalOf} cannot find, as a point of the
   * output cell, keyed by the pose's number as the sheet labels it, from one.
   * The burst and the beam of the cast are pale blue and larger than the
   * crystal they spring from, so those two poses say where the tip is instead.
   */
  crystal?: Readonly<Record<number, Point>>;
}

/** Bytes per pixel, as `lib.ts` lays a raster out. */
const CHANNELS = 4;

/** The wizard's cell, 32 by 32 world units (asset-list.md, wizard). */
const CELL = 32;

/** How tall a region has to be to be a pose rather than a label's remains. */
const LEAST_POSE_ROWS = CELL / 2;

/** How much bluer than warm a pixel is before it reads as the crystal. */
const CRYSTAL_BLUE = 24;

/**
 * Rows at the bottom of a pose that hold his feet and nothing else, in world
 * units. A cell holds `RENDER_DENSITY` pixels to the unit, so the rows read
 * are these scaled by it (ADR-003).
 */
const FEET_ROWS = 3;

/**
 * One sheet cut into the strip its state is written as, and its entry. The
 * cell stays 32 world units; the sheet is read at half the pitch it was drawn
 * at, so a cell comes out `RENDER_DENSITY` pixels to the unit and the outlines
 * and shading these painted sheets drew finer than their blocks survive
 * (ADR-003).
 */
export function cutStrip(sheet: Sheet, raster: Raster): { image: Raster; entry: PoseStripEntry } {
  const cellW = sheet.cellW ?? CELL;
  const pixels = { width: cellW * RENDER_DENSITY, height: CELL * RENDER_DENSITY };
  const columns = readPoses(dropLabels(keyMagenta(resampleBlocks(raster, sheet.pitch / RENDER_DENSITY))));
  if (columns.length !== sheet.frames) {
    throw new Error(`${sheet.raw} splits into ${columns.length} poses, not the ${sheet.frames} asset-list.md gives the ${sheet.state} sheet`);
  }
  const cells = standUp(sheet, columns.map((column) => drawnPart(sheet, column, pixels)), pixels);
  const image = hstack(cells);
  return {
    image,
    entry: {
      width: image.width,
      height: image.height,
      cell: CELL,
      cellW,
      // Only a sheet that names one records one; the renderer reads a strip
      // without it as centred, which every other sheet is.
      ...(sheet.anchor === undefined ? {} : { anchor: sheet.anchor }),
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
    if (box.height < LEAST_POSE_ROWS * RENDER_DENSITY) continue;
    for (let y = box.y; y < box.y + box.height; y += 1) {
      const from = (y * raster.width + box.x) * CHANNELS;
      out.data.set(raster.data.subarray(from, from + box.width * CHANNELS), from);
    }
  }
  return out;
}

/**
 * The runs of neighbouring rows that hold art, as full-width boxes ready to
 * crop, the way `runs` answers columns.
 */
function bands(raster: Raster): Box[] {
  const found: Box[] = [];
  let start = -1;
  for (let y = 0; y < raster.height; y += 1) {
    let used = false;
    for (let x = 0; x < raster.width && !used; x += 1) {
      used = alphaAt(raster, x, y) > 0;
    }
    if (used && start < 0) start = y;
    if (!used && start >= 0) {
      found.push({ x: 0, y: start, width: raster.width, height: y - start });
      start = -1;
    }
  }
  if (start >= 0) found.push({ x: 0, y: start, width: raster.width, height: raster.height - start });
  return found;
}

/**
 * The sheet's poses in the order they are read in, each as the full-height
 * column it was drawn in. A sheet with more poses than fit across a page is
 * drawn as a grid instead — the cast is four across and two down — so the
 * rows are taken in turn and each is split into its own columns. A sheet
 * drawn in one row is the one-band case of the same reading.
 */
function readPoses(sheeted: Raster): Raster[] {
  return bands(sheeted).flatMap((band) => {
    const row = crop(sheeted, band);
    return runs(row).map((column) => crop(row, column));
  });
}

/** The drawn pixels of one column, cut out of it and measured against its cell. */
function drawnPart(sheet: Sheet, column: Raster, cell: { width: number; height: number }): Raster {
  const drawn = boundingBox(column);
  // `runs` hands back only columns that hold art, so there is always a box.
  const pose = drawn === null ? column : crop(column, drawn);
  if (pose.width > cell.width || pose.height > cell.height) {
    throw new Error(`${sheet.raw} draws a pose ${pose.width}x${pose.height} at ${sheet.pitch} px blocks, too big for its ${cell.width}x${cell.height} cell`);
  }
  return pose;
}

/**
 * The poses stood in their cells, which are measured in the cell's own pixels:
 * `RENDER_DENSITY` of them to the world unit (ADR-003).
 *
 * A pose stands bottom-centre by default, which is the alignment every frame
 * of every state shares, so the renderer draws a strip by its cell and never
 * by its art. A sheet that draws something out to one side of him cannot:
 * the cast's burst and beam stretch those poses' boxes to the right, and
 * centring each box would slide the wizard left as they grow. Such a sheet
 * gives its cell a reference column instead, in world units, the way the
 * manifest records it. Its first pose is then placed as a 32-unit cell hung on
 * that column would have placed it — so the figure lands where the other
 * sheets put him and does not shift as the cast starts — and every later pose
 * is slid until its feet sit under the first pose's.
 */
function standUp(sheet: Sheet, poses: readonly Raster[], cell: { width: number; height: number }): Raster[] {
  const first = poses[0];
  if (sheet.anchor === undefined || first === undefined) {
    return poses.map((pose) => standIn(sheet, pose, Math.floor((cell.width - pose.width) / 2), cell));
  }
  // The anchor is world units and everything else here is the cell's pixels,
  // so the reference column crosses over once, here.
  const anchor = sheet.anchor * RENDER_DENSITY;
  const centred = CELL * RENDER_DENSITY;
  const firstLeft = anchor - centred / 2 + Math.floor((centred - first.width) / 2);
  const standing = firstLeft + feetCentre(first);
  return poses.map((pose) =>
    standIn(sheet, pose, Math.round(standing - feetCentre(pose)), cell),
  );
}

/**
 * The middle of a pose's bottom rows: where he stands in it. His feet are the
 * one part of him nothing is ever drawn over — the cast is thrown out at
 * chest height — so they are what lines a sheet's poses up with each other.
 */
function feetCentre(pose: Raster): number {
  const rows = Math.min(FEET_ROWS * RENDER_DENSITY, pose.height);
  const feet = boundingBox(crop(pose, { x: 0, y: pose.height - rows, width: pose.width, height: rows }));
  // A pose is cut to its own drawn box, so its bottom row always holds art.
  return feet === null ? pose.width / 2 : feet.x + feet.width / 2;
}

/** One pose in a transparent cell, on its floor, its left edge at `left`. */
function standIn(sheet: Sheet, pose: Raster, left: number, cell: { width: number; height: number }): Raster {
  if (left < 0 || left + pose.width > cell.width) {
    throw new Error(`${sheet.raw} stands a ${pose.width}-wide pose at ${left} of its ${cell.width}-wide cell, which hangs over the edge; move the ${sheet.state} sheet's anchor`);
  }
  const out = createRaster(cell.width, cell.height);
  for (let y = 0; y < pose.height; y += 1) {
    const from = y * pose.width * CHANNELS;
    const to = ((cell.height - pose.height + y) * cell.width + left) * CHANNELS;
    out.data.set(pose.data.subarray(from, from + pose.width * CHANNELS), to);
  }
  return out;
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
 *
 * A frame may pin its own point instead, for the two the cast hides its
 * crystal in: a burst and a beam are pale blue too, and larger, so the patch
 * holding the most of them is the effect rather than the tip it springs from.
 * A pin has to land on pale blue, which is the same test a found point passes
 * — not merely on a drawn pixel, because the robe and the hat are drawn too
 * and a pin that slid onto either is as wrong as one pointing at nothing. It
 * is measured in a cell this file placed, so a change to the pitch, the cell,
 * the density or the anchor moves it off the crystal — and that would slide
 * the glow off the wand with every gate still green, so the build stops.
 */
function crystalOf(sheet: Sheet, cell: Raster, frame: number): Point {
  const pinned = sheet.crystal?.[frame + 1];
  if (pinned !== undefined) {
    const [x, y] = pinned;
    if (!paleBlue(cell, x, y)) {
      throw new Error(`${sheet.raw} pins frame ${frame + 1}'s crystal at ${x},${y}, where its cell draws no pale blue; re-read the tip off public/assets/sprites/wizard-${sheet.state}.png`);
    }
    return pinned;
  }
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

/**
 * Is a pixel of a cell the wizard's pale blue? The one home for that question
 * (AGENTS.md rule 9): both the finder that reads a crystal out of a cell and
 * the guard on a hand-pinned one ask it, so a pin is held to the same test the
 * frames beside it passed.
 */
function paleBlue(cell: Raster, x: number, y: number): boolean {
  const [red, green, blue, alpha] = pixelAt(cell, x, y);
  return alpha > 0 && blue - Math.max(red, green) >= CRYSTAL_BLUE;
}

/** The shape a cell's pale blue pixels make, which is all a patch needs. */
function blueOf(cell: Raster): Raster {
  const out = createRaster(cell.width, cell.height);
  for (let y = 0; y < cell.height; y += 1) {
    for (let x = 0; x < cell.width; x += 1) {
      if (paleBlue(cell, x, y)) {
        out.data[(y * cell.width + x) * CHANNELS + 3] = alphaAt(cell, x, y);
      }
    }
  }
  return out;
}
