// Slicing the forest tileset into the atlas (docs/plan/03-assets/pipeline.md,
// tile atlas). assets/tileset.png draws nine ground tiles on a known grid,
// five across its top row and four across its second, with the plank and the
// spike trap below the grid at their own sizes; PROVENANCE.md records the
// grid. Each is cut out and resampled to one 32 px tile, in the order of the
// shared tile-order module the renderer reads as well (AGENTS.md rule 9). The
// raw draws 205 px cells, so two pixels to the world unit keep twice the
// detail one does at the same world size (ADR-003).

import { TILE_ORDER, type TileName } from '../../game/content/tile-order';
import { RENDER_DENSITY } from '../../game/render/config';
import { TILE } from '../../game/sim';

import { connectedComponents, crop, resampleTo, type Box, type Raster } from './lib';

/** One tile of the atlas in pixels: a 16-unit tile at the drawn density. */
const TILE_PX = TILE * RENDER_DENSITY;

/** The grid the nine ground tiles are drawn on (assets/PROVENANCE.md). */
const ORIGIN = 39;
const CELL_W = 205;
const CELL_H = 202;
const GAP = 39;

/** One cell of that grid, by its column and its row. */
function cell(column: number, row: number): Box {
  return {
    x: ORIGIN + column * (CELL_W + GAP),
    y: ORIGIN + row * (CELL_H + GAP),
    width: CELL_W,
    height: CELL_H,
  };
}

/**
 * Where each tile is drawn on the sheet. This is written by hand against the
 * one cleaned sheet, so a regenerated tileset either keeps the layout or
 * changes these boxes in the same PR — the same bargain the prop sheet's
 * mapping strikes (prompts/props.md, tileset). The unit test writes the same
 * grid out again from assets/PROVENANCE.md and paints its fixture from that,
 * so which name takes which box is pinned by something other than this table,
 * and the real sheet proves a box still holds art.
 */
const PLACES: Readonly<Record<TileName, Box>> = {
  'grass-top': cell(0, 0),
  'grass-corner-left': cell(1, 0),
  'grass-corner-right': cell(2, 0),
  earth: cell(3, 0),
  'earth-roots': cell(4, 0),
  stone: cell(0, 1),
  'stone-edge-left': cell(1, 1),
  'stone-edge-right': cell(2, 1),
  'mossy-stone': cell(3, 1),
  plank: { x: 40, y: 535, width: 300, height: 85 },
  spike: { x: 385, y: 527, width: 107, height: 96 },
};

/**
 * The tileset cut into the atlas: one 32 px tile per name in `TILE_ORDER`.
 * What the sheet draws is counted first, so a sheet with a different tile
 * count stops the build here rather than slicing empty boxes out of it
 * (prompts/props.md, tileset).
 */
export function sliceTiles(raster: Raster): Raster[] {
  const drawn = connectedComponents(raster).length;
  if (drawn !== TILE_ORDER.length) {
    throw new Error(`the tileset draws ${drawn} objects, not the ${TILE_ORDER.length} tiles tile-order.ts names`);
  }
  return TILE_ORDER.map((name) => resampleTo(crop(raster, PLACES[name]), TILE_PX, TILE_PX));
}
