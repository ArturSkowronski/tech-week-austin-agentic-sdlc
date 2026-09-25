// The asset kit's entry point: `pnpm assets` runs this and it writes every
// file under public/assets, plus the manifest that says what it wrote
// (docs/plan/03-assets/pipeline.md). Nothing else may put art in public/.
//
// This milestone builds the four background layers and the splash, the
// wizard's five pose sheets, and the room paintings. A background is a whole
// generated frame, so the work reads the same every time: resample the raw to
// the view's density, key the magenta sky away, cut the drawn rows off the
// bottom, reduce them to 32 colours, and stand them on their base. A pose
// sheet is many small frames instead, and strips.ts cuts it into them; a
// painting is a row of whole panels, and paintings.ts joins them.

import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';

import { TILE_ATLAS } from '../../game/content/tile-order';
import { BASE_COLOURS, BUSHES_FRONT_ROWS, MOUNTAIN_ART_ROWS, MOUNTAIN_BASE_ROWS, VIEW_H, VIEW_W } from '../../game/render/config';
import { CONSUMERS } from '../../game/render/sprites';

import { consumerOf, roomNames } from './consumers';
import {
  crop,
  extendBottom,
  flip,
  hstack,
  keyMagenta,
  loadPng,
  pixelAt,
  resampleBlocks,
  savePng,
  toPalette,
  type Raster,
  type Rgb,
} from './lib';
import { fitPanel, joinPanels, PAINTINGS, type Painting, type PaintingEntry } from './paintings';
import { sliceProps } from './props';
import { cutStrip, type Sheet, type StripEntry } from './strips';
import { sliceTiles } from './tiles';

/** Where the generated raws are read from, and where the output goes. */
const RAWS = 'assets';
const OUT = 'public/assets';

/**
 * Colours a finished output may show (asset-list.md), counting a base: a layer
 * that stands on one spends a seat on it and reduces its art to the other 31.
 */
const COLOURS = 32;

/** Every layer that has a base stands on as many rows as the mountains do. */
const BASE_ROWS = MOUNTAIN_BASE_ROWS;

/** The red, green and blue channels of a colour, in order. */
const RGB = [0, 1, 2] as const;

/** Every raw this build opened, which is what `checkRaws` holds assets/ to. */
const opened = new Set<string>();

/** One raw of `assets/`, loaded and remembered as read. */
async function loadRaw(file: string): Promise<Raster> {
  opened.add(file);

  return loadPng(join(RAWS, file));
}

/** A packed colour of the palette as the channels a raster is made of. */
function channels(colour: number): Rgb {
  return [(colour >> 16) & 0xff, (colour >> 8) & 0xff, colour & 0xff];
}

/** One file the kit writes: the drawn art, and the base it stands on if any. */
interface Output {
  /** The name in the manifest and under public/assets, without the extension. */
  name: string;
  /** The drawn rows on their own, which is what `artRows` counts. */
  art: Raster;
  /** The colour of the rows added below the art, if the layer has a base. */
  base?: Rgb;
}

/** What the manifest records about one output (pipeline.md, manifest entries). */
interface Entry {
  width: number;
  height: number;
  /** Drawn rows at the top; the rest of the height is the flat base. */
  artRows: number;
  colours: number;
}

/**
 * The wizard's pose sheets (asset-list.md, wizard table). The pitch is the
 * block size each raw was drawn at, as PROVENANCE.md records it: these sheets
 * are painted rather than dithered, so `estimatePitch` reads no block
 * structure on them, and the recorded size is the one that resamples a pose to
 * the height its cell expects. The walk, jump and fall sheets take 7 px so
 * their poses come out the height the idle sheet's do at 8.
 */
const WIZARD: readonly Sheet[] = [
  { state: 'idle', raw: 'wizard-idle.png', pitch: 8, frames: 4 },
  { state: 'run', raw: 'wizard-walk.png', pitch: 7, frames: 8 },
  { state: 'jump', raw: 'wizard-jump.png', pitch: 7, frames: 7 },
  // The fall poses flail wide enough to need a cell wider than it is tall.
  { state: 'fall', raw: 'wizard-fall.png', pitch: 7, frames: 4, cellW: 40 },
  { state: 'charge', raw: 'wizard-charge.png', pitch: 8, frames: 5 },
];

async function main(): Promise<void> {
  // Drawn rows per layer, from asset-list.md's backgrounds table. The
  // mountains' are the one the renderer needs as well, so config.ts owns them.
  const mountains = await art('bg-mountains-big.png', MOUNTAIN_ART_ROWS);
  const trees = await art('bg-forest.png', 142);
  const undergrowth = await art('bg-undergrowth.png', 110);

  const outputs: readonly Output[] = [
    // The mountains loop seamlessly because the tile is followed by its own
    // mirror image, so both joins are one edge meeting itself.
    { name: 'bg/mountains-big', art: hstack([mountains, flip(mountains)]), base: channels(BASE_COLOURS.mountains) },
    { name: 'bg/trees', art: trees, base: channels(BASE_COLOURS.tallForest) },
    { name: 'bg/undergrowth', art: undergrowth },
    // The bushes in front are the undergrowth's own canopy, mirrored so the
    // layer in front does not read as the layer behind a second time.
    { name: 'bg/foreground', art: flip(crop(undergrowth, { x: 0, y: 0, width: undergrowth.width, height: BUSHES_FRONT_ROWS })) },
    // The forest atlas as one strip, in the order of game/content/tile-order.ts:
    // one file and one manifest entry, cut back into its eleven tiles by
    // game/render/tiles.ts, which draws the rooms that have no painting.
    { name: TILE_ATLAS, art: hstack(sliceTiles(await loadRaw('tileset.png'))) },
    { name: 'splash', art: await frame('splash-textless.png') },
  ];

  await mkdir(join(OUT, 'bg'), { recursive: true });
  await mkdir(join(OUT, 'sprites'), { recursive: true });
  await mkdir(join(OUT, 'paintings'), { recursive: true });
  await mkdir(join(OUT, 'props'), { recursive: true });
  await mkdir(join(OUT, dirname(TILE_ATLAS)), { recursive: true });
  const manifest: Record<string, Entry | StripEntry | PaintingEntry> = {};
  for (const output of outputs) {
    manifest[output.name] = await write(output);
  }
  for (const sheet of WIZARD) {
    const name = `sprites/wizard-${sheet.state}`;
    const { image, entry } = cutStrip(sheet, await loadRaw(sheet.raw));
    manifest[name] = await writeStrip(name, image, entry);
  }
  for (const strip of sliceProps(await loadRaw('props-sheet.png'))) {
    const name = `props/${strip.name}`;
    // A prop is no one's light, so its entry is the cell and the frame count
    // alone; that is what game/render/props.ts animates it from, and the cell
    // sizes are the simulation's own `PROP_SIZE` (AGENTS.md rule 9).
    manifest[name] = await writeStrip(name, strip.image, {
      width: strip.image.width,
      height: strip.image.height,
      cell: strip.cell,
      cellW: strip.cellW,
      frames: strip.frames,
    });
  }
  for (const painting of PAINTINGS) {
    const name = `paintings/${painting.room}`;
    manifest[name] = await writePainting(painting, name);
  }
  await writeFile(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  const names = Object.keys(manifest);
  await checkRaws();
  await checkConsumers(names);
  await checkFiles(names);
}

/**
 * Every raw in `assets/` went into an output, or the build stops naming the
 * one that did not (pipeline.md, invariants). A raw nobody wants leaves the
 * repository; there are no skipped raws, so a new file that no builder reads
 * is a half-finished ticket rather than something to keep. PROVENANCE.md is
 * the record of where the raws came from rather than one of them.
 */
async function checkRaws(): Promise<void> {
  const skipped = (await readdir(RAWS)).filter((file) => file !== 'PROVENANCE.md' && !opened.has(file));

  if (skipped.length > 0) {
    throw new Error(`the kit read nothing from ${skipped.join(', ')} in ${RAWS}/: build it, or take it out of the repository`);
  }
}

/**
 * Every output is consumed and every consumer has its output, or the build
 * stops naming what is loose at whichever end (pipeline.md, invariants). An
 * output nothing loads is art the site ships and never shows; a name the
 * renderer loads with nothing behind it is a room that fails to open.
 */
async function checkConsumers(names: readonly string[]): Promise<void> {
  const rooms = await roomNames();
  const orphans = names.filter((name) => consumerOf(name, rooms) === undefined);

  if (orphans.length > 0) {
    throw new Error(`nothing consumes the orphan output ${orphans.join(', ')}: name it in game/render/sprites.ts, or stop building it`);
  }

  const missing = CONSUMERS.filter((name) => !names.includes(name));

  if (missing.length > 0) {
    throw new Error(`game/render/sprites.ts loads ${missing.join(', ')}, which the kit builds no output for`);
  }
}

/**
 * Nothing is under `public/assets` that the kit did not write, or the build
 * stops naming it: `pnpm assets` is the only way art may enter `public/`
 * (AGENTS.md rule 3). The directory is written over rather than emptied first,
 * so the other way to land here is an output of an earlier build that a rename
 * orphaned — which is why the message offers deleting the directory too.
 */
async function checkFiles(names: readonly string[]): Promise<void> {
  const written = new Set([...names.map((name) => `${name}.png`), 'manifest.json']);
  const entries = await readdir(OUT, { recursive: true, withFileTypes: true });
  const strays = entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(relative(OUT, entry.parentPath), entry.name))
    .filter((file) => !written.has(file));

  if (strays.length > 0) {
    throw new Error(
      `${OUT}/ holds ${strays.join(', ')}, which the kit did not write: art enters public/ through pnpm assets alone — or left over from an earlier build; delete ${OUT} and re-run pnpm assets`,
    );
  }
}

/**
 * A raw resampled to the density the game draws at. Every background and the
 * splash is one frame of the whole view, so its pitch is what its width is
 * over the view's, and `estimatePitch` is not asked: a dithered canopy reads
 * as no block structure at all. Both halves of that are checked, because a raw
 * regenerated at some other size would otherwise resample to a quietly wrong
 * frame and the manifest would agree with it.
 */
async function frame(raw: string): Promise<Raster> {
  const raster = await loadRaw(raw);
  const pitch = raster.width / VIEW_W;
  if (!Number.isInteger(pitch)) {
    throw new Error(`${raw} is ${raster.width} px wide, which is no whole number of blocks across the ${VIEW_W} px view`);
  }
  const resampled = resampleBlocks(raster, pitch);
  if (resampled.height !== VIEW_H) {
    throw new Error(`${raw} resamples to ${resampled.width}x${resampled.height}, not the whole ${VIEW_W}x${VIEW_H} view it has to be a frame of`);
  }
  return resampled;
}

/**
 * The drawn rows of a background raw: the frame with its magenta sky keyed
 * away, cut to the rows asset-list.md gives the layer. The cut is from the
 * bottom because every layer is anchored to the floor line, so the base edge
 * is the one that has to land where the renderer expects it.
 *
 * The cut can drop drawn pixels, and for one raw it does: `bg-forest.png` keys
 * to 143 rows of art against asset-list.md's 142, so its topmost row of canopy
 * tips (3 pixels) goes on every build. That is the right end to lose it at,
 * but whoever regenerates that raw should know it happens; PROVENANCE.md says
 * so as well.
 */
async function art(raw: string, rows: number): Promise<Raster> {
  const keyed = keyMagenta(await frame(raw));
  if (rows > keyed.height) throw new Error(`${raw} is ${keyed.height} rows, too short for ${rows} rows of art`);
  return crop(keyed, { x: 0, y: keyed.height - rows, width: keyed.width, height: rows });
}

/**
 * One output reduced, saved as an indexed PNG, and its manifest entry.
 *
 * A base is a colour the finished file shows, so it takes one of the 32 seats
 * instead of a 33rd outside them: the art is reduced against a palette that
 * holds the base already and has the other 31 picked around it. The base rows
 * are still written by `extendBottom` afterwards, so they keep the exact
 * colour the renderer fills below the horizon with (rendering-and-look.md,
 * layer stack), and art pixels that were that colour already land on it
 * rather than on a near miss.
 */
async function write(output: Output): Promise<Entry> {
  const chosen = output.base === undefined ? palette(output.art, COLOURS) : [output.base, ...palette(output.art, COLOURS - 1)];
  const reduced = toPalette(output.art, chosen);
  const image = output.base === undefined ? reduced : extendBottom(reduced, BASE_ROWS, output.base);
  await savePng(image, join(OUT, `${output.name}.png`));
  const entry: Entry = {
    width: image.width,
    height: image.height,
    artRows: output.art.height,
    colours: colours(image).length,
  };
  // The 32 are a requirement on the file, not on the reduction, so the file
  // is what is counted: anything that adds a colour after the palette is
  // picked stops the build here instead of shipping a 33rd.
  if (entry.colours > COLOURS) {
    throw new Error(`${output.name} came out ${entry.colours} colours, over the ${COLOURS} asset-list.md gives it`);
  }
  process.stdout.write(`${output.name} ${entry.width}x${entry.height}, ${entry.colours} colours\n`);
  return entry;
}

/**
 * One strip of cells, saved, and the manifest entry it was cut with. A strip
 * keeps every colour its cells resample to: the sprite palette pipeline.md
 * names is a file the kit does not have yet.
 */
async function writeStrip(name: string, image: Raster, entry: StripEntry): Promise<StripEntry> {
  await savePng(image, join(OUT, `${name}.png`));
  process.stdout.write(`${name} ${entry.width}x${entry.height}, ${entry.frames} frames\n`);
  return entry;
}

/**
 * One room's painting joined out of its panels, posterised, saved, and its
 * manifest entry. It is posterised to the same 32 colours a background gets,
 * which is a choice: asset-list.md gives paintings no count of their own, and
 * a room drawn out of the same size palette as the layers behind it is the
 * point of the reduction.
 *
 * The reduction is after the join rather than panel by panel, which is the
 * order pipeline.md lists the stages in, because that is what keeps the ground
 * band running through the join one colour: two palettes picked apart drift,
 * and the join is the one place in the image where that would show.
 */
async function writePainting(painting: Painting, name: string): Promise<PaintingEntry> {
  const panels = await Promise.all(painting.panels.map(async (panel) => fitPanel(panel, await loadRaw(panel.raw))));
  const { image, entry } = joinPanels(panels);
  const reduced = toPalette(image, palette(image, COLOURS));
  // The count is a requirement on the file the same way it is for a layer, so
  // the file is what is counted rather than the reduction that was asked for.
  const count = colours(reduced).length;
  if (count > COLOURS) {
    throw new Error(`${name} came out ${count} colours, over the ${COLOURS} it is reduced to`);
  }
  await savePng(reduced, join(OUT, `${name}.png`));
  process.stdout.write(`${name} ${entry.width}x${entry.height}, ${entry.tiles} tiles, ${count} colours\n`);
  return entry;
}

/**
 * A palette of at most `size` colours for one image, by median cut: the box of
 * every colour the image draws is split on the channel it spreads widest, at
 * that channel's median, until there are `size` boxes, and each box becomes
 * its own mean colour.
 *
 * `savePng` cannot be asked for 32. It hands `colours` to sharp, which turns
 * it into a PNG bit depth of 1, 2, 4 or 8, so the palettes it can write hold
 * 2, 4, 16 or 256 entries, and asking for 32 writes 256. The 32 are picked
 * here instead and `toPalette` moves every pixel to its nearest, which is the
 * exact-palette path `savePng` itself names.
 */
function palette(raster: Raster, size: number): Rgb[] {
  let boxes = [colours(raster)];
  while (boxes.length < size) {
    const splittable = boxes.filter((box) => box.length > 1);
    if (splittable.length === 0) break;
    const widest = splittable.reduce((best, box) => (spread(box).range > spread(best).range ? box : best));
    boxes = boxes.flatMap((box) => (box === widest ? split(box) : [box]));
  }
  return boxes.map(mean);
}

/** Every colour an image draws, once each, in the order it first draws them. */
function colours(raster: Raster): Rgb[] {
  const found = new Map<number, Rgb>();
  for (let y = 0; y < raster.height; y += 1) {
    for (let x = 0; x < raster.width; x += 1) {
      const [red, green, blue, alpha] = pixelAt(raster, x, y);
      if (alpha > 0) found.set((red * 256 + green) * 256 + blue, [red, green, blue]);
    }
  }
  return [...found.values()];
}

/** A box of colours cut in two at the median of the channel it spreads widest. */
function split(box: readonly Rgb[]): Rgb[][] {
  const { channel } = spread(box);
  const sorted = [...box].sort((a, b) => a[channel] - b[channel]);
  const half = Math.floor(sorted.length / 2);
  return [sorted.slice(0, half), sorted.slice(half)];
}

/** The channel a box of colours covers the widest range of, and that range. */
function spread(box: readonly Rgb[]): { channel: 0 | 1 | 2; range: number } {
  const low: [number, number, number] = [255, 255, 255];
  const high: [number, number, number] = [0, 0, 0];
  for (const colour of box) {
    for (const channel of RGB) {
      if (colour[channel] < low[channel]) low[channel] = colour[channel];
      if (colour[channel] > high[channel]) high[channel] = colour[channel];
    }
  }
  const channel = RGB.reduce((best, next) => (high[next] - low[next] > high[best] - low[best] ? next : best));
  return { channel, range: high[channel] - low[channel] };
}

/** The mean of a box of colours, which is the palette entry it becomes. */
function mean(box: readonly Rgb[]): Rgb {
  const total = box.reduce<Rgb>((sum, colour) => [sum[0] + colour[0], sum[1] + colour[1], sum[2] + colour[2]], [0, 0, 0]);
  return [Math.round(total[0] / box.length), Math.round(total[1] / box.length), Math.round(total[2] / box.length)];
}

await main();
