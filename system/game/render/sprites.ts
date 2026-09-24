// Loading what the asset kit wrote (docs/plan/03-assets/pipeline.md). The
// manifest is the one source for the size, the density and the art rows of
// every output, so nothing here carries a second copy of them.
//
// Art coexists at two densities (ADR-003): the backgrounds and wizard sheets
// built at one pixel per world unit, and everything generated since at two.
// A loader hands back world units either way, so the layer stack, the camera
// and the tuning table never learn which of the two a file was drawn at.

import { Assets, Rectangle, Texture } from 'pixi.js';

import type { Vec2 } from '../sim';

/** What the kit records about one output (pipeline.md, manifest entries). */
export interface Entry {
  width: number;
  height: number;
  /** Pixels per world unit; 1x art the kit writes no density for reads as one. */
  density?: number;
  /** Drawn rows at the top; the rest of the height is the layer's flat base. */
  artRows?: number;
}

/** A pixel of a cell, as the kit records it: in from its left, down from its top. */
export type Point = readonly [number, number];

/**
 * What the kit records about one strip of pose cells. The kit writes these
 * entries and the renderer reads them, so the shape is declared here, on the
 * side that has to survive in a browser, and tools/asset-kit/strips.ts takes
 * it from here rather than keeping a second copy (AGENTS.md rule 9).
 */
export interface StripEntry extends Entry {
  /** The cell's height in world units; every pose stands on its floor. */
  cell: number;
  /** The cell's width in world units, which the strip is this many frames of. */
  cellW: number;
  frames: number;
  /** Where the crystal sits in each frame, in its cell's pixels. */
  crystal: readonly Point[];
}

/** Every output the kit wrote, by name, as `public/assets/manifest.json`. */
export type Manifest = Readonly<Record<string, Entry>>;

/** An output measured in world units, whatever density it was drawn at. */
export interface Measure {
  /** Pixels of this file per world unit. */
  density: number;
  /** Height in world units. */
  height: number;
  /** The drawn rows in world units; below them the layer's base begins. */
  artHeight: number;
}

/** One output ready to draw: its texture, and its size in world units. */
export interface Art extends Measure {
  texture: Texture;
}

/** An entry in world units. Art the kit records no rows for is all art. */
export function measure(entry: Entry): Measure {
  const density = entry.density ?? 1;

  return {
    density,
    height: entry.height / density,
    artHeight: (entry.artRows ?? entry.height) / density,
  };
}

/** The URL of one of the kit's files, under the site the game is served at. */
function assetUrl(file: string): string {
  return `${import.meta.env.BASE_URL}assets/${file}`;
}

/** The kit's manifest, read from the site. */
export async function loadManifest(): Promise<Manifest> {
  const response = await fetch(assetUrl('manifest.json'));

  if (!response.ok) {
    throw new Error('public/assets/manifest.json is missing; run pnpm assets');
  }

  return (await response.json()) as Manifest;
}

/** What the kit recorded for one output, or a refusal that names the file. */
function entryOf(manifest: Manifest, name: string): Entry {
  const entry = manifest[name];

  if (entry === undefined) {
    throw new Error(`the asset manifest has no ${name}; run pnpm assets`);
  }

  return entry;
}

/**
 * One of the kit's files as a texture. Nearest-neighbour is set on the
 * texture itself, so a file keeps its hard pixel edges wherever it is drawn
 * (rendering-and-look.md), and every loader below goes through here rather
 * than remembering that rule again.
 */
async function loadTexture(name: string): Promise<Texture> {
  const texture = await Assets.load<Texture>(assetUrl(`${name}.png`));

  texture.source.scaleMode = 'nearest';

  return texture;
}

/** One named output, measured and loaded. */
export async function loadArt(manifest: Manifest, name: string): Promise<Art> {
  const measured = measure(entryOf(manifest, name));

  return { texture: await loadTexture(name), ...measured };
}

/**
 * Pixels of a strip per world unit. The kit records a cell's height in world
 * units and the file's in pixels, so the two together say what the strip was
 * drawn at, and no strip carries a density of its own (AGENTS.md rule 9).
 */
export function densityOf(entry: StripEntry): number {
  return entry.height / entry.cell;
}

/**
 * Where one frame's crystal sits in its cell, in world units. The kit records
 * the pixel the crystal is drawn on, so the point handed back is that pixel's
 * middle; facing left mirrors it about the cell's middle, which is the same
 * mirror the sprite itself is drawn through.
 *
 * The recorded point already names a drawn pixel of the crystal — the kit
 * pulls the patch's centroid onto one — so nothing here moves it again.
 */
export function crystalOf(entry: StripEntry, frame: number, facing: 1 | -1): Vec2 {
  const spot = entry.crystal[frame];

  if (spot === undefined) {
    throw new Error(`a strip of ${entry.frames} frames has no frame ${frame}`);
  }

  const density = densityOf(entry);
  const [x, y] = spot;
  const middle = (x + 0.5) / density;

  return { x: facing === 1 ? middle : entry.cellW - middle, y: (y + 0.5) / density };
}

/** One strip of pose cells, ready to draw. */
export interface Strip {
  /**
   * Pixels of this strip per world unit (ADR-003). The frames below are cut
   * at the file's own pixels, so whatever draws them has to bring them back
   * to world units by this — the same number `crystal` has already divided
   * the recorded point by.
   */
  readonly density: number;
  /** The cell's width in world units; the fall sheet's is wider than it is tall. */
  readonly cellW: number;
  /** The cell's height in world units. Every pose stands on the cell's floor. */
  readonly cellH: number;
  /** One texture per cell, in the sheet's order. */
  readonly frames: readonly Texture[];
  /** Where a frame's crystal sits, as a wizard facing this way shows it. */
  crystal(frame: number, facing: 1 | -1): Vec2;
}

/** Whether the kit wrote this entry as a strip of pose cells rather than a layer. */
function isStrip(entry: Entry): entry is StripEntry {
  return 'crystal' in entry;
}

/**
 * One named strip, cut into a texture per cell. The cells are sub-rectangles
 * of the one file, so the whole strip is a single upload and drawing a frame
 * is a texture swap.
 */
export async function loadStrip(manifest: Manifest, name: string): Promise<Strip> {
  const entry = entryOf(manifest, name);

  if (!isStrip(entry)) {
    throw new Error(`the asset manifest's ${name} is no strip of pose cells`);
  }

  const sheet = await loadTexture(name);
  const density = densityOf(entry);
  const width = entry.cellW * density;

  return {
    density,
    cellW: entry.cellW,
    cellH: entry.cell,
    frames: Array.from(
      { length: entry.frames },
      (_, frame) =>
        new Texture({
          source: sheet.source,
          frame: new Rectangle(frame * width, 0, width, entry.height),
        }),
    ),
    crystal: (frame, facing) => crystalOf(entry, frame, facing),
  };
}
