// Every number the look is made of, and the only module that owns any of them
// (docs/plan/02-design/rendering-and-look.md, ADR-003). The rest of
// game/render/ imports from here; no layer, panel or effect declares its own.

import { TICK_RATE } from '../sim';

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

// The width of a waterfall's water column is not here: PROP_SIZE in
// game/sim/room.ts already owns every prop size (AGENTS.md rule 9).

/** Slowest and fastest water streak, in world units per tick. */
export const WATER_STREAK_SPEED = { min: 3, max: 5 } as const;

/** Slowest and fastest column of log text behind the water, units per tick. */
export const LOG_FALL_SPEED = { min: 0.9, max: 1.6 } as const;

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
  /** The share of the face a parting opens. */
  openShare: 0.68,
  /** Ticks between green flickers, how many of them one lasts, how faint. */
  flickerPeriod: 37,
  flickerTicks: 4,
  flickerAlpha: 0.22,
  /** Bands of the face a flicker may land on. */
  flickerPatches: 6,
} as const;

/**
 * The log text that falls behind the water. A glyph pixel is one pixel of the
 * render texture (ADR-003), which is the smallest the font can be drawn at,
 * and the columns stand this far apart across the face, so the text reads as
 * rain rather than as a wall.
 */
export const LOG_TEXT = { columnStep: 8, pixel: 1 / RENDER_DENSITY } as const;

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
 * squares of `eye` units at the ends of the 8-unit patch the list gives them,
 * and `hat` units down from the top of the wizard's cell while it rides him
 * (bug-quest.md, the creature).
 */
export const CREATURE_EYES = { patch: 8, eye: 2, colour: 0xff3b2f, hat: 6 } as const;

/** Ticks from one blink to the next, and how many of them the eyes are shut. */
export const CREATURE_BLINK = { period: 96, shut: 6 } as const;

/** Ticks the ticket card must be up before it can be waved away. */
export const TICKET_DISMISS_TICKS = 3 * TICK_RATE;

/**
 * The UI's measurements, in UI pixels; `uiScale` in game/render/panel.ts says
 * how many window pixels one of them is. The UI draws at the window's own
 * resolution, so its grid is its own: it steps with the window's height rather
 * than with the scale the world's blocks are shown at.
 */
export const UI_SIZES = {
  /** A line of panel, button or HUD text. */
  body: 10,
  /** The title's wordmark, and the space it holds between its letters. */
  wordmark: 26,
  wordmarkSpacing: 3,
  /** Space between the chrome's edge and what stands inside it. */
  padding: 6,
  /** Space between a panel's lines and the button below them. */
  gap: 5,
  /** The widest a panel grows before its lines wrap. */
  maxWidth: 220,
  /** The chrome's corner radius and the width of its edge. */
  radius: 3,
  border: 1,
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
 * The UI's typeface. A monospace stack until the typography pass (HWP-064):
 * every entry is a face the browser already has, so the text draws on the
 * first frame and no font file joins the build.
 */
export const UI_FONT = 'ui-monospace, "DejaVu Sans Mono", Menlo, Consolas, monospace';

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
