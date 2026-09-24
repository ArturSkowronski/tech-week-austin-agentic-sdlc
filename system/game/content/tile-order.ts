// The order of the forest atlas, the one place it is written down (AGENTS.md
// rule 9). tools/asset-kit/tiles.ts slices tileset.png into this order and
// game/render/tiles.ts picks a tile out of it by context
// (docs/plan/02-design/rendering-and-look.md, tiles by context), so neither
// side carries a copy of the other's numbering.

/** The eleven tiles of the forest atlas, in the order the kit writes them. */
export const TILE_ORDER = [
  'grass-top',
  'grass-corner-left',
  'grass-corner-right',
  'earth',
  'earth-roots',
  'stone',
  'stone-edge-left',
  'stone-edge-right',
  'mossy-stone',
  'plank',
  'spike',
] as const;

/** One tile of the atlas, by name. */
export type TileName = (typeof TILE_ORDER)[number];

/**
 * The atlas the kit writes and the renderer draws from, as the manifest names
 * it. It is written here rather than on either side so that the file name and
 * the order of what is in it stay one fact (AGENTS.md rule 9).
 */
export const TILE_ATLAS = 'tiles/forest';
