// Loading what the asset kit wrote (docs/plan/03-assets/pipeline.md). The
// manifest is the one source for the size, the density and the art rows of
// every output, so nothing here carries a second copy of them.
//
// Art coexists at two densities (ADR-003): the backgrounds at one pixel per
// world unit, everything else at two.
// A loader hands back world units either way, so the layer stack, the camera
// and the tuning table never learn which of the two a file was drawn at.

import { Assets, Rectangle, Texture } from 'pixi.js';

import { TILE_ATLAS } from '../content/tile-order';
import { TICK_RATE, type Vec2 } from '../sim';

/**
 * Every output of the kit the renderer loads, by the name the manifest gives
 * it: the renderer's own declaration of what it draws (pipeline.md,
 * invariants). The build compares this list with what the kit wrote and fails
 * on an output nothing names and on a name the kit builds nothing for, so a
 * ticket that adds an output adds its consumer here in the same PR.
 *
 * Paintings are not on it. A room consumes its own painting, so the build
 * takes those names from the rooms instead of from here.
 *
 * `props/torch` and `props/sparks` are on it although nothing draws them yet:
 * they are built, so something has to claim them.
 */
export const CONSUMERS: readonly string[] = [
  'bg/mountains-big',
  'bg/trees',
  'bg/undergrowth',
  'bg/foreground',
  // The atlas is named in game/content/tile-order.ts, next to the order of
  // what is in it, and read from there rather than written again here.
  TILE_ATLAS,
  'splash',
  'sprites/wizard-idle',
  'sprites/wizard-run',
  'sprites/wizard-jump',
  'sprites/wizard-fall',
  'sprites/wizard-charge',
  'sprites/wizard-victory',
  'props/bush',
  'props/log',
  'props/rock',
  'props/flag',
  'props/beacon',
  'props/torch',
  'props/sparks',
  // The sounds. Twelve are what an event sounds like and the mapping in
  // game/render/audio.ts says which; the waterfall's loop runs under the rock
  // face and the music's behind the settings toggle. The names are written out
  // here because this is the renderer's declaration of what it loads, and
  // tests/render/audio.test.ts holds the mapping and the toggle to it.
  'audio/jump',
  'audio/land',
  'audio/charge',
  'audio/charge-hit',
  'audio/charge-wall',
  'audio/bush-rustle',
  'audio/log-chatter',
  'audio/rock-crack',
  'audio/creature-pop-out',
  'audio/creature-caught',
  'audio/checkpoint',
  'audio/beacon-lit',
  'audio/waterfall-loop',
  'audio/music-loop',
];

/** Frames played in so many ticks at this rate. */
export function framesIn(ticks: number, fps: number): number {
  return Math.floor((ticks * fps) / TICK_RATE);
}

/**
 * The cell a loop shows after so many ticks: the frames from `first` to the
 * end of the strip, played at `fps`. The count comes from the manifest, so no
 * strip's length is written down anywhere else (AGENTS.md rule 9), and the
 * wizard and the props share the one clock rather than each keeping its own.
 */
export function cycle(ticks: number, fps: number, count: number, first = 0): number {
  return first + (framesIn(ticks, fps) % (count - first));
}

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
  /**
   * The cell's reference column, in world units: the column the renderer puts
   * on the player. A strip whose art is not centred on the figure records one
   * — the cast's cell is a 32-unit cell with another 32 units of room added on
   * the right for its beam, so its column is that first cell's middle. A strip
   * that records none is centred, and its own middle is the column.
   */
  anchor?: number;
  frames: number;
  /**
   * Where the crystal sits in each frame, in its cell's pixels. The wizard's
   * sheets carry one; a prop is no one's light and its strip carries none.
   */
  crystal?: readonly Point[];
}

/** A wizard's strip: the one kind of strip that records a crystal per frame. */
export interface PoseStripEntry extends StripEntry {
  crystal: readonly Point[];
}

/**
 * What the kit records about one sound (pipeline.md, manifest entries). A
 * sound is copied rather than built, so it has no size and no density; what it
 * has is a length and whether the player repeats it or lets it end.
 */
export interface AudioEntry {
  kind: 'audio';
  /** How long the file plays, in seconds. */
  seconds: number;
  loop: boolean;
}

/** Every output the kit wrote, by name, as `public/assets/manifest.json`. */
export type Manifest = Readonly<Record<string, Entry | AudioEntry>>;

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

/**
 * The kit's manifest, read from the site. Every view asks for its own, and
 * they are all built at once, so the fetch is kept rather than made five
 * times over: the file is written once per build and never changes under a
 * running page.
 */
let manifest: Promise<Manifest> | undefined;

export function loadManifest(): Promise<Manifest> {
  manifest ??= fetchManifest();

  return manifest;
}

async function fetchManifest(): Promise<Manifest> {
  const response = await fetch(assetUrl('manifest.json'));

  if (!response.ok) {
    throw new Error('public/assets/manifest.json is missing; run pnpm assets');
  }

  return (await response.json()) as Manifest;
}

/** What the kit recorded for one output, or a refusal that names the file. */
function entryOf(manifest: Manifest, name: string): Entry | AudioEntry {
  const entry = manifest[name];

  if (entry === undefined) {
    throw new Error(`the asset manifest has no ${name}; run pnpm assets`);
  }

  return entry;
}

/** Whether the kit wrote this entry for a sound rather than for a picture. */
function isAudio(entry: Entry | AudioEntry): entry is AudioEntry {
  return 'kind' in entry;
}

/** What the kit recorded for one picture, or a refusal that names the file. */
function artOf(manifest: Manifest, name: string): Entry {
  const entry = entryOf(manifest, name);

  if (isAudio(entry)) {
    throw new Error(`the asset manifest's ${name} is a sound, not a picture`);
  }

  return entry;
}

/** What the kit recorded for one sound, or a refusal that names the file. */
export function soundOf(manifest: Manifest, name: string): AudioEntry {
  const entry = entryOf(manifest, name);

  if (!isAudio(entry)) {
    throw new Error(`the asset manifest's ${name} is a picture, not a sound`);
  }

  return entry;
}

/** The URL of one of the kit's sounds, under the site the game is served at. */
export function soundUrl(name: string): string {
  return assetUrl(`${name}.mp3`);
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
  const measured = measure(artOf(manifest, name));

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
export function crystalOf(entry: PoseStripEntry, frame: number, facing: 1 | -1): Vec2 {
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
  /** {@link StripEntry.anchor}, with a centred strip's own middle filled in. */
  readonly anchor: number;
  /** One texture per cell, in the sheet's order. */
  readonly frames: readonly Texture[];
  /**
   * Where a frame's crystal sits, as a wizard facing this way shows it. Only
   * the wizard's sheets record one, so a prop's strip refuses instead.
   */
  crystal(frame: number, facing: 1 | -1): Vec2;
}

/** Whether this strip is one of the wizard's sheets, which record a crystal. */
function records(entry: StripEntry): entry is PoseStripEntry {
  return entry.crystal !== undefined;
}

/** Whether the kit wrote this entry as a strip of cells rather than a layer. */
function isStrip(entry: Entry): entry is StripEntry {
  return 'frames' in entry;
}

/**
 * One named strip, cut into a texture per cell. The cells are sub-rectangles
 * of the one file, so the whole strip is a single upload and drawing a frame
 * is a texture swap.
 */
export async function loadStrip(manifest: Manifest, name: string): Promise<Strip> {
  const entry = artOf(manifest, name);

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
    anchor: entry.anchor ?? entry.cellW / 2,
    frames: Array.from(
      { length: entry.frames },
      (_, frame) =>
        new Texture({
          source: sheet.source,
          frame: new Rectangle(frame * width, 0, width, entry.height),
        }),
    ),
    crystal: (frame, facing) => {
      if (!records(entry)) {
        throw new Error(`the asset manifest's ${name} records no crystal`);
      }

      return crystalOf(entry, frame, facing);
    },
  };
}
