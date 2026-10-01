// A room drawn out of the forest atlas (docs/plan/02-design/rendering-and-look.md,
// tiles). Which of the eleven tiles a cell shows is read off its neighbours in
// the collision grid, so a text map on its own makes ground that looks built:
// moss on the surface, corners where a ledge ends, two rows of earth with
// roots in them, and stone below with edges and mossy blocks. The atlas order
// is game/content/tile-order.ts, the one module the asset kit slices by and
// this one draws by (AGENTS.md rule 9).
//
// Nothing here reads wall time or Math.random. The scatter of roots and moss,
// and which way round each cell is turned, are read off the tile's own
// position and nothing else, so the same map always draws the same frame and
// a replay replays.

import { Container, Rectangle, Sprite, Texture } from 'pixi.js';

import { TILE_ATLAS, TILE_ORDER, type TileName } from '../content/tile-order';
import { Tile, TILE, tileAt, type Room } from '../sim';

import { TILE_SCATTER, TILE_TURN } from './config';
import { loadArt, type Manifest } from './sprites';

/** Rows of earth under the mossy surface before the stone begins. */
const EARTH_ROWS = 2;

/**
 * A fraction in [0, 1) that belongs to this tile and to this salt, and to no
 * other pair of the two. The simulation's `nextRandom` is no use here: it
 * advances a seed the run owns, and the renderer may draw a cell any number
 * of times without moving it.
 *
 * The salt is mixed in rather than added to the coordinates, for the reason
 * game/render/particles.ts gives for `own`: a hash walked from shifted inputs
 * is the first scatter slid along, and two of the cell's decisions taken from
 * it would agree with each other across the whole room.
 */
function spot(x: number, y: number, salt: number): number {
  // Mixed hard enough that neighbouring tiles land far apart in the range, so
  // what it scatters reads as scattered rather than as a diagonal.
  let hash =
    Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(salt, 0x9e3779b1);

  hash = Math.imul(hash ^ (hash >>> 15), 0x2545f491);

  return ((hash ^ (hash >>> 16)) >>> 0) / 0x1_0000_0000;
}

/** The salts of {@link spot}: one for each decision a cell takes from it. */
const ART = 0;
const TURN = 1;

/** Whether this cell is ground; the surface and the edges are read against it. */
function isGround(room: Room, x: number, y: number): boolean {
  return tileAt(room, x, y) === Tile.Solid;
}

/**
 * The atlas tile this cell of the map shows, or undefined where it draws
 * nothing. Solid ground takes its variant from how deep under the surface it
 * lies and which of its sides stand open: an open side at the surface is a
 * ledge end and takes a corner, an open side down in the stone takes an edge.
 */
export function tileArt(room: Room, x: number, y: number): TileName | undefined {
  switch (tileAt(room, x, y)) {
    case Tile.OneWay:
    case Tile.OneWayHalf:
      return 'plank';
    case Tile.Spike:
      return 'spike';
    case Tile.Solid:
      break;
    default:
      return undefined;
  }

  let depth = 0;

  while (depth <= EARTH_ROWS && isGround(room, x, y - depth - 1)) {
    depth += 1;
  }

  const openLeft = !isGround(room, x - 1, y);
  const openRight = !isGround(room, x + 1, y);

  if (depth === 0) {
    // A surface run one tile wide — a pillar top, or a ledge of a single cell —
    // stands open at both ends, and the eleven tiles of the atlas hold no piece
    // that rounds off both. The left corner serves: the cell then reads as a
    // ledge end rather than as ground that runs on, which is the half of the
    // look that matters. That is a choice and not a fact the map states, so
    // tests/render/tiles.test.ts holds it, and a both-ends tile in the atlas
    // is what would replace it.
    if (openLeft) return 'grass-corner-left';
    if (openRight) return 'grass-corner-right';

    return 'grass-top';
  }

  if (depth <= EARTH_ROWS) {
    return spot(x, y, ART) < TILE_SCATTER.roots ? 'earth-roots' : 'earth';
  }

  if (openLeft) return 'stone-edge-left';
  if (openRight) return 'stone-edge-right';

  return spot(x, y, ART) < TILE_SCATTER.moss ? 'mossy-stone' : 'stone';
}

/** Which way round a cell draws the tile it shows. */
export interface TileTurn {
  /** Quarter turns clockwise. */
  readonly quarter: number;
  /** Whether it is flipped left to right as well. */
  readonly mirror: boolean;
}

/**
 * Which way round this cell draws its tile, as far round as TILE_TURN lets
 * that tile go. Like `tileArt` it is a function of the cell's own position
 * and of nothing else, so the same map always draws the same frame and a
 * replay replays.
 */
export function tileTurn(x: number, y: number, name: TileName): TileTurn {
  const allowed = TILE_TURN[name];

  if (allowed === 'fixed') return { quarter: 0, mirror: false };

  // A tile that may only be flipped has two ways round, and a hash spends two
  // the way a coin does: a quarter of the neighbouring pairs land the same,
  // and in the glade seven of the sixteen pairs of roots did, two of them in
  // the plateau the ticket is about. The parity of the cell's own coordinates
  // spends them so that no cell ever stands beside its own copy, which is
  // what the acceptance asks for; it is still a function of the position
  // alone, so a replay still replays.
  if (allowed === 'mirror') return { quarter: 0, mirror: (x + y) % 2 === 1 };

  // Eight ways round a square: the four quarter turns, each mirrored or not.
  const roll = Math.floor(spot(x, y, TURN) * 8);

  return { quarter: roll % 4, mirror: roll >= 4 };
}

/** The atlas cut into its tiles, and the pixels per world unit it was drawn at. */
export interface Tileset {
  readonly density: number;
  readonly tiles: Readonly<Record<TileName, Texture>>;
}

/** The atlas loaded and cut into one texture per name of the shared order. */
export async function loadTileset(manifest: Manifest): Promise<Tileset> {
  const art = await loadArt(manifest, TILE_ATLAS);
  const cell = TILE * art.density;

  if (art.texture.width !== cell * TILE_ORDER.length) {
    throw new Error(
      `${TILE_ATLAS} is ${art.texture.width} px wide, not the ${TILE_ORDER.length} tiles of ${cell} px tile-order.ts names`,
    );
  }

  return {
    density: art.density,
    tiles: Object.fromEntries(
      TILE_ORDER.map((name, at) => [
        name,
        new Texture({
          source: art.texture.source,
          frame: new Rectangle(at * cell, 0, cell, cell),
        }),
      ]),
    ) as Record<TileName, Texture>,
  };
}

/**
 * The room as sprites, in world units: one atlas tile per cell the map draws
 * something at. The grid does not change inside a run, so this is built once
 * and moved by the camera from then on.
 */
export function drawTiles(room: Room, tileset: Tileset): Container {
  const view = new Container();

  for (let y = 0; y < room.height; y += 1) {
    for (let x = 0; x < room.width; x += 1) {
      const name = tileArt(room, x, y);

      if (name === undefined) continue;

      const sprite = new Sprite(tileset.tiles[name]);
      const turn = tileTurn(x, y, name);
      // `=` is the same plank with its surface half a tile down, which is
      // where game/sim/physics.ts catches a fall on it.
      const half = tileAt(room, x, y) === Tile.OneWayHalf ? TILE / 2 : 0;

      // A cell turns about the middle of itself, so it is placed by its middle
      // rather than by its top left corner. Both are whole world units, and a
      // quarter turn of a square about its centre lands back on them, so the
      // tiles still meet without a seam.
      sprite.anchor.set(0.5);
      sprite.scale.set((turn.mirror ? -1 : 1) / tileset.density, 1 / tileset.density);
      sprite.rotation = (turn.quarter * Math.PI) / 2;
      sprite.position.set(x * TILE + TILE / 2, y * TILE + half + TILE / 2);
      view.addChild(sprite);
    }
  }

  return view;
}
