// Loading what the asset kit wrote (docs/plan/03-assets/pipeline.md). The
// manifest is the one source for the size, the density and the art rows of
// every output, so nothing here carries a second copy of them.
//
// Art coexists at two densities (ADR-003): the backgrounds and wizard sheets
// built at one pixel per world unit, and everything generated since at two.
// A loader hands back world units either way, so the layer stack, the camera
// and the tuning table never learn which of the two a file was drawn at.

import { Assets, Texture } from 'pixi.js';

/** What the kit records about one output (pipeline.md, manifest entries). */
export interface Entry {
  width: number;
  height: number;
  /** Pixels per world unit; 1x art the kit writes no density for reads as one. */
  density?: number;
  /** Drawn rows at the top; the rest of the height is the layer's flat base. */
  artRows?: number;
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

/**
 * One named output, measured and loaded. Nearest-neighbour is set on the
 * texture itself, so a file keeps its hard pixel edges wherever it is drawn
 * (rendering-and-look.md).
 */
export async function loadArt(manifest: Manifest, name: string): Promise<Art> {
  const entry = manifest[name];

  if (entry === undefined) {
    throw new Error(`the asset manifest has no ${name}; run pnpm assets`);
  }

  const texture = await Assets.load<Texture>(assetUrl(`${name}.png`));

  texture.source.scaleMode = 'nearest';

  return { texture, ...measure(entry) };
}
