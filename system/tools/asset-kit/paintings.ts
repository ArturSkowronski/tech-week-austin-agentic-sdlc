// Joining a room's painting (docs/plan/03-assets/pipeline.md, paintings). A
// painting is the source of truth for how a room looks; the room's text map is
// the source of truth for what it collides with (ADR-004). It is generated as
// up to three 3:1 panels, so the kit fits each panel to the room's height and
// lays them out left to right into one continuous image at 32 px per tile.
//
// Hand edits to a raw are code: a generator draws a bridge where the level
// wants open air, and the cut is declared beside the panel as a rectangle of
// key colour painted on before the key, never made in an image editor (ADR-004,
// rules for generated panels). PAINTINGS is the only description of any cut.

import { RENDER_DENSITY } from '../../game/render/config';
// The renderer reads these entries back out of the manifest, so their shape is
// declared on the side that has to survive in a browser and taken from there
// (AGENTS.md rule 9), the same way strips.ts takes its own.
import type { Entry } from '../../game/render/sprites';
import { TILE } from '../../game/sim';

import { fillRect, hstack, keyMagenta, resizeToHeight, type Box, type Raster, type Rgba } from './lib';

/** A painting's tile in pixels: one 16-unit tile at the drawn density is 32. */
const TILE_PX = TILE * RENDER_DENSITY;

/**
 * Every painting is fitted to the 22 tiles a room is tall (ADR-004), which is
 * the one height the rooms are authored at. A room of some other height would
 * be fitted to this one all the same and read as stretched art over a map it
 * no longer lines up with; deriving the height from the room's own map is
 * HWP-041's, with the trace work.
 */
const HEIGHT = 22 * TILE_PX;

/** The key colour the panels are drawn on, and the colour a cut paints with. */
const MAGENTA: Rgba = [255, 0, 255, 255];

/** One generated panel of a painting, and the hand edits declared on it. */
export interface Panel {
  /** The file in `assets/`. */
  raw: string;
  /** Rectangles painted out in the key colour, in the raw's own pixels. */
  cuts?: readonly Box[];
}

/** One room's painting: the panels that make it, in the order they are joined. */
export interface Painting {
  /** The room the painting belongs to, which names the output. */
  room: string;
  panels: readonly Panel[];
}

/** What the manifest records about one painting (pipeline.md, manifest entries). */
export interface PaintingEntry extends Entry {
  density: number;
  /** How many tiles of the room's map the painting covers. */
  tiles: number;
}

/**
 * Every painting the kit builds (asset-list.md, paintings), with every hand
 * edit it makes on the way. A cut is described here and nowhere else: the raws
 * keep what the generator drew, and reading this table is how anyone learns
 * that the painting differs from them.
 */
export const PAINTINGS: readonly Painting[] = [
  {
    room: 'ruin-gate',
    panels: [
      // The generator drew a walkway across the waterfall pit that the room's
      // text map leaves open (columns 41 to 46). The rectangle takes the
      // walkway and the stalactite fringe hanging under it, down to where the
      // pit's two rock faces already stand clear of each other.
      { raw: 'painting-ruin-gate-1.png', cuts: [{ x: 2401, y: 952, width: 335, height: 232 }] },
      // The same hand again at the well: the map leaves columns 95 to 100 open
      // as the dry six-tile drop of level-design.md's beats table, and the
      // generator drew the courtyard floor straight across it, grass line and
      // all. A player read the drawn ground and fell through it. The rectangle
      // is the six columns from the grass line down to the raw's bottom edge.
      { raw: 'painting-ruin-gate-2.png', cuts: [{ x: 1687, y: 1040, width: 349, height: 240 }] },
    ],
  },
];

/**
 * One panel with its declared cuts painted on, keyed, and fitted to the room's
 * height. A panel is fitted before it meets its neighbours so that a panel
 * generated at some other size still lands on the same floor line as they do
 * rather than stretching the join.
 */
export async function fitPanel(panel: Panel, raw: Raster): Promise<Raster> {
  const cut = (panel.cuts ?? []).reduce((image, box) => fillRect(image, box, MAGENTA), raw);
  return resizeToHeight(keyMagenta(cut), HEIGHT);
}

/** The fitted panels laid out left to right, and the painting's manifest entry. */
export function joinPanels(panels: readonly Raster[]): { image: Raster; entry: PaintingEntry } {
  const image = hstack(panels);
  if (image.width % TILE_PX !== 0) {
    throw new Error(`the panels join to ${image.width} px, which is no whole number of ${TILE_PX} px tiles`);
  }
  return { image, entry: { width: image.width, height: image.height, density: RENDER_DENSITY, tiles: image.width / TILE_PX } };
}
