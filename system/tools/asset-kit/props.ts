// Cutting the prop sheet into one strip per prop (docs/plan/03-assets/
// pipeline.md, props). assets/props-sheet.png is not laid out in rows: the
// bushes, logs, rocks and flags stack down its left, the beacons, the torch
// and the charge sparks down its right, and the five beacons and the five
// rocks each touch their neighbours and come back as one object
// (asset-list.md, props).
//
// So the objects are found first — connected regions of drawn pixels, with
// the gaps a generator leaves inside one object bridged — and grouped into
// bands by their top edge. Which band and which place in it holds which prop
// is written by hand below, against this one sheet: a regenerated sheet
// either keeps its object counts or changes the mapping in the same PR.

import { PROP_SIZE, type PropKind } from '../../game/sim';

import {
  alphaAt,
  boundingBox,
  CHANNELS,
  connectedComponents,
  createRaster,
  crop,
  hstack,
  keyPageColour,
  placeInCell,
  resampleTo,
  type Box,
  type Raster,
} from './lib';

/**
 * Half the gap between two pieces of one object the kit bridges (pipeline.md,
 * props): each piece grows this far and the two meet, so the embers over the
 * torch and the specks trailing a spark belong to the object they came off.
 */
const REACH = 3;

/** How big an object has to be to be one at all, rather than a stray speck. */
const LEAST = 16;

/** How far two objects' top edges may sit apart and still be one band. */
const BAND = 24;

/** The charge sparks' cell (asset-list.md); they are wand VFX, not a prop. */
const SPARKS = { w: 24, h: 8 };

/** The props drawn on this sheet, and the charge sparks drawn with them. */
type StripName = Extract<PropKind, 'bush' | 'log' | 'rock' | 'flag' | 'beacon' | 'torch'> | 'sparks';

/** One prop's frames, and where the sheet draws them. */
interface Strip {
  name: StripName;
  /** One object per entry: its band from the top, then its place from the left. */
  at: readonly (readonly [number, number])[];
  /** How many frames each of those objects holds, where frames touch. */
  columns?: number;
}

/**
 * The hand-written mapping. Frame counts are the asset list's: bush 3, log 3,
 * rock 5, flag 5, beacon 5, torch 1, sparks 5. The bushes share their band
 * with the beacon tower, which stands taller than all three; the sparks are
 * the one prop drawn over two bands, three trail frames above two speed
 * lines.
 */
const SHEET: readonly Strip[] = [
  { name: 'bush', at: [[0, 0], [0, 1], [0, 2]] },
  { name: 'log', at: [[1, 0], [1, 1], [1, 2]] },
  { name: 'rock', at: [[2, 0]], columns: 5 },
  { name: 'flag', at: [[4, 0], [4, 1], [4, 2], [4, 3], [4, 4]] },
  { name: 'beacon', at: [[0, 3]], columns: 5 },
  { name: 'torch', at: [[3, 0]] },
  { name: 'sparks', at: [[5, 0], [5, 1], [5, 2], [6, 0], [6, 1]] },
];

/** One prop cut into the strip of cells the kit writes as `props/<name>`. */
export interface PropStrip {
  name: StripName;
  image: Raster;
  /** The cell's width in world units, which the strip is this many frames of. */
  cellW: number;
  /** The cell's height in world units; every frame stands on its floor. */
  cell: number;
  frames: number;
}

/** The prop sheet cut into its seven strips, in the order `SHEET` names them. */
export function sliceProps(raster: Raster): PropStrip[] {
  const sheet = keyPageColour(raster);
  const bands = counted(bandsOf(objectsOf(sheet)));
  return SHEET.map((strip) => cut(sheet, bands, strip));
}

/**
 * The bands, each checked against the number of objects the mapping asks of
 * it. A place is a position from the left, so one object too few or one speck
 * too many in a band shifts every later place in it and cuts the wrong art:
 * only the count catches that, which is why it is compared here rather than
 * left to the lookup to notice when it runs off the end.
 */
function counted(bands: Box[][]): Box[][] {
  const asked = new Map<number, number>();
  for (const strip of SHEET) {
    for (const [band] of strip.at) asked.set(band, (asked.get(band) ?? 0) + 1);
  }
  if (bands.length !== asked.size) {
    throw new Error(`props-sheet.png splits into ${bands.length} bands, and the mapping cuts ${asked.size}`);
  }
  for (const [band, places] of asked) {
    const found = bands[band]?.length ?? 0;
    if (found !== places) {
      throw new Error(`band ${band} of props-sheet.png holds ${found} objects, and the mapping cuts ${places} from it`);
    }
  }
  return bands;
}

/**
 * The objects the sheet draws. A region of the mask grown by `REACH` is one
 * object; grown pixels are no part of it, so the box comes back the size the
 * drawn pixels make it. Anything too small to be a prop frame is a speck the
 * generator left in the air and is dropped, so the bands count props.
 */
function objectsOf(sheet: Raster): Box[] {
  return connectedComponents(grow(sheet, REACH))
    .map((box) => ({
      x: box.x + REACH,
      y: box.y + REACH,
      width: box.width - 2 * REACH,
      height: box.height - 2 * REACH,
    }))
    .filter((box) => box.width >= LEAST && box.height >= LEAST);
}

/** The shape of a raster's drawn pixels, with every pixel spread this far. */
function grow(raster: Raster, reach: number): Raster {
  const out = createRaster(raster.width, raster.height);
  for (let y = 0; y < raster.height; y += 1) {
    for (let x = 0; x < raster.width; x += 1) {
      if (alphaAt(raster, x, y) === 0) continue;
      for (let ny = Math.max(0, y - reach); ny <= Math.min(raster.height - 1, y + reach); ny += 1) {
        for (let nx = Math.max(0, x - reach); nx <= Math.min(raster.width - 1, x + reach); nx += 1) {
          out.data[(ny * raster.width + nx) * CHANNELS + 3] = 255;
        }
      }
    }
  }
  return out;
}

/**
 * The objects grouped into the bands they are drawn across, top band first
 * and each band left to right. A band is the objects whose tops sit within
 * `BAND` of its first: the frames of one prop are drawn level with each
 * other, and a prop that stands taller than its neighbours still starts near
 * enough their tops to be one band with them.
 */
function bandsOf(objects: readonly Box[]): Box[][] {
  const bands: Box[][] = [];
  let band: Box[] = [];
  let top = -Infinity;
  for (const box of [...objects].sort((a, b) => a.y - b.y)) {
    if (box.y - top > BAND) {
      band = [];
      top = box.y;
      bands.push(band);
    }
    band.push(box);
  }
  return bands.map((found) => found.sort((a, b) => a.x - b.x));
}

/**
 * One prop's strip. Every frame of a prop is scaled by the one factor that
 * fits the biggest of them into the cell, so a beacon whose flame grows over
 * its five frames does not shrink its own tower to make room.
 */
function cut(sheet: Raster, bands: readonly Box[][], strip: Strip): PropStrip {
  const { w, h } = cellOf(strip.name);
  const drawn = framesOf(bands, strip).map((box) => tighten(crop(sheet, box)));
  const widest = Math.max(...drawn.map((frame) => frame.width));
  const tallest = Math.max(...drawn.map((frame) => frame.height));
  const scale = Math.min(w / widest, h / tallest, 1);
  const side = (pixels: number): number => Math.max(1, Math.round(pixels * scale));
  const cells = drawn.map((frame) => placeInCell(resampleTo(frame, side(frame.width), side(frame.height)), w, h));
  return { name: strip.name, image: hstack(cells), cellW: w, cell: h, frames: cells.length };
}

/** The box of every frame of one prop, in the order the mapping names them. */
function framesOf(bands: readonly Box[][], strip: Strip): Box[] {
  return strip.at.flatMap(([band, place]) => {
    const object = bands[band]?.[place];
    // `counted` has already matched every band against the places the
    // mapping asks of it, so this refusal narrows the type rather than
    // guarding a case the sheet can reach.
    if (object === undefined) {
      throw new Error(`band ${band} of props-sheet.png holds no object at ${place}, which ${strip.name} is cut from`);
    }
    return columnsOf(object, strip.columns ?? 1);
  });
}

/** A box divided into equal columns, which is how touching frames are parted. */
function columnsOf(box: Box, columns: number): Box[] {
  return Array.from({ length: columns }, (_, column) => {
    const from = Math.round((column * box.width) / columns);
    return { x: box.x + from, y: box.y, width: Math.round(((column + 1) * box.width) / columns) - from, height: box.height };
  });
}

/** A frame cut down to its drawn pixels, so parting a column leaves no margin. */
function tighten(frame: Raster): Raster {
  const drawn = boundingBox(frame);
  return drawn === null ? frame : crop(frame, drawn);
}

/** A strip's cell in world units: the simulation's, or the sparks' own. */
function cellOf(name: StripName): { w: number; h: number } {
  if (name === 'sparks') return SPARKS;
  const { w, h } = PROP_SIZE[name];
  // Only the waterfall has no cell height, and `StripName` leaves it out; the
  // refusal is here to narrow the type rather than to guard a live case.
  if (h === null) throw new Error(`${name} hangs to the room's bottom and is no strip`);
  return { w, h };
}
