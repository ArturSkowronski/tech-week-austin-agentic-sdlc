// Every number the look is made of, and the only module that owns any of them
// (docs/plan/02-design/rendering-and-look.md, ADR-003). The rest of
// game/render/ imports from here; no layer, panel or effect declares its own.

import type { TileName } from '../content/tile-order';
import { TICK_RATE, type HidingPlace } from '../sim';

/** Width of the view, in world units. */
export const VIEW_W = 320;

/** Height of the view, in world units. */
export const VIEW_H = 180;

/** Pixels drawn per world unit (ADR-003). */
export const RENDER_DENSITY = 2;

/** Width of the render texture the world is drawn into, in pixels. */
export const TEXTURE_W = VIEW_W * RENDER_DENSITY;

/** Height of the render texture the world is drawn into, in pixels. */
export const TEXTURE_H = VIEW_H * RENDER_DENSITY;

/** The view is shown at a whole multiple of this, and never smaller (ADR-003). */
export const SCALE_STEP = 2;

/** The bars around the letterboxed view. */
export const LETTERBOX_COLOUR = 0x000000;

/**
 * Where a picture of the whole view stands in a window, in window pixels: as
 * many of them to the world unit as fit at a whole multiple of `SCALE_STEP`,
 * never below one step so the render texture's pixels stay whole (ADR-003),
 * and the picture centred on whole pixels with the letterbox bars filling the
 * rest. game/render/scene.ts fits the world's render texture by this and
 * game/render/title.ts fits the splash by it, so the title art stands exactly
 * where the world does (AGENTS.md rule 9).
 */
export function viewBox(
  windowW: number,
  windowH: number,
): { readonly scale: number; readonly x: number; readonly y: number } {
  const steps = Math.floor(Math.min(windowW / VIEW_W, windowH / VIEW_H) / SCALE_STEP);
  const scale = Math.max(steps, 1) * SCALE_STEP;

  return {
    scale,
    x: Math.floor((windowW - VIEW_W * scale) / 2),
    y: Math.floor((windowH - VIEW_H * scale) / 2),
  };
}

/**
 * The box at the middle of the view the wizard moves inside without the camera
 * following him. A whole jump rises about 53 units, so only a climb lifts it.
 */
export const CAMERA_DEAD_ZONE = { width: 48, height: 64 } as const;

/** One background layer of the stack, back to front. */
export interface Layer {
  /** The asset kit output the layer is drawn from, as the manifest names it. */
  readonly asset: string;
  /** Share of the camera's horizontal movement the layer takes. */
  readonly parallaxX: number;
  /** Share of the camera's vertical movement the layer takes. */
  readonly parallaxY: number;
  /** Units the layer's bottom sits below the main floor line. */
  readonly bottomOffset: number;
  readonly alpha: number;
  /** How much of the layer's own colour survives; below one fades it back. */
  readonly tint: number;
}

/** The layer stack of the look doc's table. Backgrounds loop horizontally. */
export const LAYERS = {
  mountains: { asset: 'bg/mountains-big', parallaxX: 0.05, parallaxY: 0.05, bottomOffset: 100, alpha: 0.85, tint: 1 },
  tallForest: { asset: 'bg/trees', parallaxX: 0.3, parallaxY: 0.6, bottomOffset: 124, alpha: 1, tint: 0.7 },
  bushesBehind: { asset: 'bg/undergrowth', parallaxX: 0.6, parallaxY: 1, bottomOffset: 62, alpha: 1, tint: 0.7 },
  bushesFront: { asset: 'bg/foreground', parallaxX: 1.3, parallaxY: 1, bottomOffset: 64, alpha: 1, tint: 1 },
} as const satisfies Record<string, Layer>;

/**
 * The colour of the base rows a layer stands on: the asset kit fills them with
 * it, and the renderer paints below the horizon in the mountains' one so no
 * pale gap shows between the layers (art-direction.md, palette).
 */
export const BASE_COLOURS = { mountains: 0x7b9682, tallForest: 0x213a2d } as const;

/** Art rows of the mountains, above their base. */
export const MOUNTAIN_ART_ROWS = 103;

/** Rows of the mountains' base, whose colour also fills below the horizon. */
export const MOUNTAIN_BASE_ROWS = 120;

/** Rows taken from the top of the undergrowth for the bushes in front. */
export const BUSHES_FRONT_ROWS = 76;

/** Height of one band of the sky's stepped gradient, in world units. */
export const SKY_BAND_H = 6;

/** The dusk sky's three stops: amber at the horizon, mauve, indigo at the top. */
export const SKY_STOPS = [0xe3a259, 0x8c6a8e, 0x2a2a5c] as const;

/** Alpha of the translucent dark laid over the world at dusk. */
export const DUSK_ALPHA = 0.08;

/**
 * The dark the dusk pass lays over the world and banks the corners with: the
 * indigo the sky already ends on at the top rather than black, so the overlay
 * reads as the light going blue and not as the lamp going out.
 */
export const DUSK_COLOUR = SKY_STOPS[2];

/**
 * The soft vignette over that overlay: frames of this alpha, each reaching one
 * `band` further in from the edge than the last, so the alphas stack into the
 * corners and the fall-off comes out in steps. Stepped for the reason
 * WAND_LIGHT is: nearest-neighbour art has no room for a smooth gradient.
 *
 * The band is the tuned number rather than the depth, so that it stays a whole
 * count of world units however deep an art pass makes the vignette: a band of
 * part of a unit puts its edges inside a texture pixel, which with
 * `antialias: false` gives a ragged step instead of a soft one.
 */
export const VIGNETTE = { band: 7, rings: 4, alpha: 0.05 } as const;

/** How far the whole vignette reaches in from the edge, in world units. */
export const VIGNETTE_DEPTH = VIGNETTE.band * VIGNETTE.rings;

/**
 * How much dark the dusk pass leaves over a unit this far in from the nearest
 * edge of the view: the flat dark, and one more of the vignette's rings for
 * every band it stands nearer the edge. The renderer draws the overlay from
 * this, and a browser test takes the overlay back off a frame with it, so the
 * fall-off is written once (AGENTS.md rule 9).
 */
export function duskAlpha(inset: number): number {
  const rings = Math.max(VIGNETTE.rings - Math.floor(inset / VIGNETTE.band), 0);

  return 1 - (1 - DUSK_ALPHA) * (1 - VIGNETTE.alpha) ** rings;
}

/** Two colours mixed channel by channel. */
export function mix(from: number, to: number, share: number): number {
  const channel = (shift: number): number =>
    Math.round(((from >> shift) & 0xff) * (1 - share) + ((to >> shift) & 0xff) * share) << shift;

  return channel(16) | channel(8) | channel(0);
}

/**
 * The tint a room's painting is drawn with: the ruins stand in the same dusk
 * as everything else and the kit paints them warmer than it
 * (rendering-and-look.md, Dusk), so the art is carried this share of the way
 * from Pixi's own no-tint white towards cool stone. The mix is done here and
 * not where the sprite is made, so the look keeps no colour of its own outside
 * this module.
 */
export const PAINTING_TINT = mix(0xffffff, 0x9fb0c8, 0.35);

/**
 * Alpha the tiles are drawn at over a room's painting when F1 is on: the
 * debug view of ADR-004, which shows what the wizard collides with without
 * hiding what the room looks like.
 */
export const DEBUG_TILE_ALPHA = 0.5;

/**
 * Share of the earth tiles drawn with roots in them, and of the stone tiles
 * drawn mossy (rendering-and-look.md, tiles). game/render/tiles.ts picks which
 * ones by a hash of the tile's position, so the shares are how much of the
 * ground carries them, not a chance rolled per frame.
 */
export const TILE_SCATTER = { roots: 0.25, moss: 0.2 } as const;

/**
 * How far round a cell of each tile may be turned from the way the atlas drew
 * it (rendering-and-look.md, tiles), so that a run of ground reads as ground
 * and not as wallpaper. `fixed` is a tile whose orientation is its meaning:
 * the moss surface, the corners, the stone edges, a plank and a spike all say
 * which way is up. `mirror` is a tile that reads one way up only — the roots
 * hang down — so those cells are flipped left to right and no further.
 * `rotate` is a tile with no up at all, and takes any of the four quarter
 * turns, mirrored or not. game/render/tiles.ts reads this off the cell's own
 * position, the way it reads TILE_SCATTER.
 */
export const TILE_TURN = {
  'grass-top': 'fixed',
  'grass-corner-left': 'fixed',
  'grass-corner-right': 'fixed',
  earth: 'rotate',
  'earth-roots': 'mirror',
  stone: 'rotate',
  'stone-edge-left': 'fixed',
  'stone-edge-right': 'fixed',
  // The moss runs along the crevices between the cobbles and across the whole
  // tile rather than lying on top of it, so there is no up to lose: cut out of
  // public/assets/tiles/forest.png and turned, all four quarters read the
  // same. This is the ticket's open question answered off the shipped art.
  'mossy-stone': 'rotate',
  plank: 'fixed',
  spike: 'fixed',
} as const satisfies Record<TileName, 'fixed' | 'mirror' | 'rotate'>;

// The width of a waterfall's water column is not here: PROP_SIZE in
// game/sim/room.ts already owns every prop size (AGENTS.md rule 9).

/** Slowest and fastest water streak, in world units per tick. */
export const WATER_STREAK_SPEED = { min: 3, max: 5 } as const;

/**
 * Units a tick the roll of log lines creeps down behind the water. Slow
 * enough that a line takes four seconds to cross the band below, which is
 * about what it takes to read one.
 */
export const LOG_FALL_SPEED = 0.6;

/** Ticks a hit keeps the water parted. */
export const WATER_PARTED_TICKS = 150;

/**
 * The waterfall's palette (rendering-and-look.md, the waterfall). It is drawn
 * in code rather than generated, so these nine colours are the whole of its
 * art: the rock behind it, the base blue and the second blue that scrolls over
 * it, the white of the foam and the paler white of the mist, the green of the
 * flicker that says the water is holding something back, and the two inks the
 * log lines behind it are written in — the manifest's own evidence, and the
 * fictional chatter it hides among (bug-quest.md, evidence).
 */
export const WATERFALL_COLOURS = {
  rock: 0x1b2230,
  water: 0x2f6f9e,
  strand: 0x59a7cf,
  streak: 0x9fd8ff,
  foam: 0xdff1ff,
  mist: 0xbcd9ec,
  flicker: 0x5ff2a6,
  evidence: 0x9ff2b5,
  flavour: 0x47707d,
} as const;

/**
 * The shape and the weather of a water column, in world units and in ticks.
 * How wide the column is is not here: PROP_SIZE in game/sim/room.ts owns every
 * prop size, and how tall it is is the drop to the room's bottom row.
 */
export const WATERFALL = {
  /** The radius the rock's right edge is rounded by. */
  radius: 6,
  /** Foam along the lip, and down the right edge the rock rounds. */
  lip: 3,
  edge: 2,
  /** Mist at the base: this deep, laid on in this many bands of this alpha. */
  mist: 12,
  mistBands: 3,
  mistAlpha: 0.18,
  /** Thin strands of the second blue, and how wide and long one is. */
  strands: 9,
  strandWidth: 1,
  strandLength: 24,
  /** Streaks in fixed columns, and how wide, long and bright one is. */
  streaks: 7,
  streakWidth: 2,
  streakLength: 10,
  streakAlpha: 0.8,
  /** How much of what is behind the water it keeps back while it is closed. */
  closedAlpha: 0.94,
  /** Ticks the water takes to draw back over the gap at the end of a parting. */
  closeTicks: 12,
  /**
   * The share of the face a parting opens. Wide enough to show a whole log
   * row and the margin it is drawn with: a 40-character row is 79.5 of the 96
   * units and the gap is 84.5, so a narrower one would hide its ends. It is
   * what settles how long a row may be, and a manifest line longer than that
   * is wrapped onto the next row rather than cut (LOG_TEXT below).
   */
  openShare: 0.88,
  /** Ticks between green flickers, how many of them one lasts, how faint. */
  flickerPeriod: 37,
  flickerTicks: 4,
  flickerAlpha: 0.22,
  /** Bands of the face a flicker may land on. */
  flickerPatches: 6,
} as const;

/**
 * The roll of log lines behind the water. A glyph pixel is one pixel of the
 * render texture (ADR-003), which is the smallest the font can be drawn at,
 * and a character takes its three of them and one more of gap: four pixels,
 * two world units, so a 40-character row is 79.5 units of the 96 the water
 * is wide and is drawn with a margin of eight on each side.
 *
 * `margin` is the water a row leaves standing at each end of the parting, and
 * with it the 84.5-unit gap holds 40 characters — the length the ticket sizes
 * the font for. The manifest carries longer lines than that: HW-002's are 45
 * and 48 characters, and 48 of them take the whole 96-unit face, so no
 * parting could show one whole. They are wrapped at a word onto the next row
 * of the roll instead of being set tighter, because three-pixel glyphs with
 * no column between them run into each other and stop being letters, and
 * instead of being cut, because the evidence is there to be read
 * (bug-quest.md, evidence).
 *
 * `band` is how much of a face is really read: the view and the bushes in
 * front, which are drawn over the actors, leave about this many units of the
 * glade's column in sight below its lip. `lineStep`, the distance from one
 * row of the roll to the next, is kept under the band, which is what keeps
 * one or two rows in sight at a time — a whole row always stands in it, and a
 * third is never crowded in. The rest of the roll stands below the foot of
 * the face, where the rock's mask cuts it, until it wraps back above the lip.
 */
export const LOG_TEXT = {
  pixel: 1 / RENDER_DENSITY,
  gap: 1,
  margin: 2,
  lineStep: 56,
  band: 60,
} as const;

/**
 * Frames per second each wizard strip plays at. The run's ten and the
 * charge's fifteen are asset-list.md's; the idle breath and the fall's flail
 * are given no rate there, so these two are the renderer's own choice and the
 * art brief should settle them.
 */
export const WIZARD_FPS = { idle: 8, run: 10, flail: 12, charge: 15 } as const;

/** Ticks the jump sheet's take-off pose holds before the air-up one. */
export const TAKE_OFF_TICKS = 4;

/**
 * Frames a second every prop animation plays at. asset-list.md gives the props
 * no rate of their own — "all static or looped" — so this one is the
 * renderer's choice: slow enough that two frames read as a rustle rather than
 * as a flicker, and it divides the tick rate evenly.
 */
export const PROP_FPS = 10;

/** Ticks a bush rustles and a log chatters after a charge hit. */
export const PROP_RUSTLE_TICKS = 24;

/** How far a hit knocks a prop sideways, in world units, and for how many ticks. */
export const PROP_SHAKE = { units: 1, ticks: 4 } as const;

/**
 * The wand's crystal light (rendering-and-look.md, Dusk): an additive glow of
 * this radius in world units, drawn as this many rings of equal alpha so it
 * falls off in steps rather than in a smooth gradient the pixel art has no
 * room for. The colour is the crystal's own pale blue.
 */
export const WAND_LIGHT = { colour: 0x9fd8ff, radius: 11, alpha: 0.44, rings: 4 } as const;

/** Units below their collision line the wizard and the props are drawn. */
export const SPRITE_FOOT_OFFSET = 2;

/**
 * The creature's two red eyes, drawn in code in Season 1 (asset-list.md): two
 * squares of `eye` units at the ends of the patch, each with one pixel of the
 * same red beside it on its outer side at `glow`'s alpha, which is what reads
 * as a glow in the dark of a hiding place. `hat` is how far down from the top
 * of the wizard's cell the patch sits while the creature rides him
 * (bug-quest.md, the creature); `CREATURE_SEAT` below is where it sits in
 * everything else.
 *
 * The patch is as wide as the narrowest hiding place can take. The whole mark
 * spans `patch` and one glow pixel beyond each eye, and the log's hollow is
 * the tightest of the three: measured off the strip `pnpm assets` cuts, the
 * dark around its seat is 13 pixels across on the rows the eyes cover, and it
 * is not centred on the seat. The mark at 5 is 12 of those pixels, so it fits
 * with the one spare pixel falling on its right and none on its left; 6 would
 * be 14 and hang over the bark. tests/smoke/props.spec.ts asserts that off
 * those pixels rather than off this number (HWP-091).
 */
export const CREATURE_EYES = {
  patch: 5,
  eye: 2,
  colour: 0xff3b2f,
  hat: 6,
  /** One pixel of the render texture (ADR-003), at the share of the red it keeps. */
  glow: { size: 1 / RENDER_DENSITY, alpha: 0.35 },
} as const;

/** Where the eyes sit in a hiding place, in world units of its sprite. */
export interface CreatureSeat {
  /** Right of the sprite's left edge. */
  readonly x: number;
  /** Up from the sprite's bottom edge, which stands `SPRITE_FOOT_OFFSET` below the prop's. */
  readonly up: number;
}

/**
 * The seat each hiding place gives the creature, read off the density 2 prop
 * strips HWP-043 cut rather than off the trigger box: the middle of a cell is
 * bark on the log, and eyes drawn there sit on it instead of in the hollow.
 * The log's seat is the middle of the dark open end it is drawn with, the
 * bush's the middle of its leaf mass above the grass it stands in, and the
 * rock's the widest step of the crack that runs down it.
 */
export const CREATURE_SEAT: Readonly<Record<HidingPlace, CreatureSeat>> = {
  bush: { x: 16, up: 13 },
  log: { x: 9, up: 9 },
  rock: { x: 14, up: 11 },
};

/** Ticks from one blink to the next, and how many of them the eyes are shut. */
export const CREATURE_BLINK = { period: 96, shut: 6 } as const;

/**
 * The glitch aura at the creature's hiding place (bug-quest.md, the creature):
 * the prop's sprite is thrown up to `units` world units off its place, a fresh
 * throw every tick, and the throw grows from nothing `reach` units away to the
 * whole of it when the wizard stands on the prop. `reach` is the 96 units
 * HWP-061 asks for, and `units` its few pixels, at the two pixels a unit of
 * ADR-003.
 */
export const CREATURE_AURA = { reach: 96, units: 2 } as const;

/**
 * The wisp the creature shows on the hat in place of its eyes while it rides
 * (asset-list.md, which draws it in code in Season 1): a square of `size`
 * units turning on a circle of `radius` around the point the eyes stood at,
 * once every `turnTicks`, with `trail` fainter frames of that circle behind
 * it, each keeping `fade` of the one in front. Its red is the eyes' own,
 * because it is the same creature.
 */
export const CREATURE_WISP = {
  size: 3,
  colour: CREATURE_EYES.colour,
  radius: 4,
  turnTicks: 24,
  trail: 2,
  fade: 0.45,
} as const;

/** Ticks the ticket card must be up before it can be waved away. */
export const TICKET_DISMISS_TICKS = 3 * TICK_RATE;

/**
 * The cell one character of the UI's font is drawn in, in UI pixels, and the
 * blank row and column it keeps from the next one. The glyphs themselves are
 * in game/render/panel.ts, the way the waterfall's log font lives with the
 * waterfall; the measurements of the look belong here (ADR-003).
 */
export const UI_GLYPH = { w: 5, h: 8, gap: 1 } as const;

/**
 * The UI's measurements, in UI pixels; `uiScale` in game/render/panel.ts says
 * how many window pixels one of them is. The UI draws at the window's own
 * resolution, so its grid is its own: it steps with the window's height rather
 * than with the scale the world's blocks are shown at.
 *
 * The text sizes are whole character cells, so a font pixel always comes out a
 * whole number of window pixels across and the glyphs stay square.
 */
export const UI_SIZES = {
  /** A line of panel, button or HUD text. */
  body: UI_GLYPH.h,
  /** The title's wordmark, and the space it holds between its letters. */
  wordmark: UI_GLYPH.h * 3,
  wordmarkSpacing: 3,
  /** The one margin: the chrome's edge to what stands inside it, all round. */
  padding: 8,
  /** Space between a panel's lines and the button below them. */
  gap: 5,
  /** The widest a panel grows before its lines wrap. */
  maxWidth: 220,
  /** The chrome's corner radius and the width of its edge. */
  radius: 3,
  border: 1,
  /** Distance between one leaf of the chrome's border and the next. */
  leafStep: 12,
  /** The HUD line's distance from the top left corner of the window. */
  margin: 6,
} as const;

/**
 * Aged gold on charcoal, the palette's UI end
 * (docs/plan/03-assets/art-direction.md). `dim` is the gold stepped back for
 * a second line, `edge` the gold of the chrome's border.
 */
export const UI_COLOURS = {
  ink: 0xe8c46a,
  dim: 0x9c8a5e,
  chrome: 0x17140f,
  edge: 0x6b5a33,
} as const;

/** How much of the world a panel keeps out; the dusk shows through the rest. */
export const UI_PANEL_ALPHA = 0.92;

/**
 * The band of that charcoal laid behind each line of the title screen, and how
 * far out around the line it reaches, in UI pixels. The splash behind them is
 * art rather than chrome — a bright sky over a lit mountain — and the gold the
 * lines are written in cannot be read straight off it, so each line carries
 * this much of the panel's own dark and the rest of the art stays uncovered.
 */
export const UI_TITLE_BAND = { alpha: 0.72, pad: 4 } as const;

// The UI's typeface is not here: only its cell is, in UI_GLYPH above. The
// glyphs are drawn pixel by pixel in game/render/panel.ts.

/**
 * Where each piece of the UI sits, as a share of the window's height: the card
 * low enough to leave the wizard in sight, the banner in the middle of the
 * screen the run has just ended on.
 */
export const UI_ANCHORS = {
  wordmark: 0.38,
  tagline: 0.5,
  prompt: 0.72,
  card: 0.78,
  banner: 0.5,
} as const;

/**
 * The atmosphere pass (HWP-060): four fields of specks drawn in code, whose
 * positions are pure functions of the tick and of the room they stand in.
 * rendering-and-look.md names none of these numbers — its layer table ends at
 * the dusk overlay — so counts, speeds, sizes and colours are the renderer's
 * own choice, kept low because the acceptance is a frame rate. A size is in
 * world units, and half a unit is one pixel of the render texture (ADR-003).
 * Each field holds all of its own, the way WAND_LIGHT and CREATURE_EYES do.
 */
export const FIREFLIES = {
  count: 22,
  size: 1,
  /** Aged gold, the palette's own (docs/plan/03-assets/art-direction.md). */
  colour: 0xf2d27a,
  /** The band they drift in, in view units down from the top of the view. */
  top: 34,
  band: 84,
  /** Slowest and fastest sideways drift, in world units per tick. */
  drift: { min: 0.08, max: 0.16 },
  /** How far one bobs as it goes, and the ticks one bob takes. */
  bob: 7,
  bobTicks: 190,
  /** Ticks from one glow to the next, and how bright the brightest is. */
  glowTicks: 74,
  alpha: 0.9,
} as const;

/**
 * The motes turning in the wand's light: they are the dust it catches, so they
 * borrow its reach and its colour rather than choosing any of their own.
 */
export const MOTES = {
  count: 12,
  size: 0.5,
  colour: WAND_LIGHT.colour,
  radius: WAND_LIGHT.radius,
  /** The share of that reach the innermost mote keeps. */
  inner: 0.35,
  /** How much flatter a turn is than it is wide, so they lie in the air. */
  flatten: 0.6,
  /** Slowest and quickest turn, in ticks; each mote takes one of its own. */
  turnTicks: { min: 200, max: 320 },
  /** Ticks from one twinkle to the next. */
  glowTicks: 43,
  alpha: 0.55,
} as const;

/** The spores that come off a bush, per bush. */
export const SPORES = {
  count: 5,
  size: 0.5,
  /** Forest green lifted until a spore reads against the bush it left. */
  colour: 0x9bc27a,
  /** How far above the bush one climbs before it starts again, in units. */
  rise: 26,
  /** Units a tick it climbs. */
  speed: 0.09,
  /** How far it sways off its lane, and the ticks one sway takes. */
  sway: 4,
  swayTicks: 130,
  alpha: 0.7,
} as const;

/**
 * The mist bands along the floor line and over the water. One band every
 * `spacing` units of the stretch it lies on, so the room's whole floor gets a
 * run of them and a 96-unit water column gets two. The pale is the one the
 * waterfall's own mist is already drawn in.
 */
export const MIST_BANDS = {
  spacing: 140,
  width: 56,
  height: 3,
  colour: WATERFALL_COLOURS.mist,
  /** Slowest and fastest drift along the stretch, in world units per tick. */
  drift: { min: 0.05, max: 0.1 },
  /** How far apart the bands stand above the line they lie on. */
  lift: 5,
  alpha: 0.12,
} as const;
