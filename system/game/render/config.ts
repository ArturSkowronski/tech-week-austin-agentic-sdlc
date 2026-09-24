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

// The width of a waterfall's water column is not here: PROP_SIZE in
// game/sim/room.ts already owns every prop size (AGENTS.md rule 9).

/** Slowest and fastest water streak, in world units per tick. */
export const WATER_STREAK_SPEED = { min: 3, max: 5 } as const;

/** Slowest and fastest column of log text behind the water, units per tick. */
export const LOG_FALL_SPEED = { min: 0.9, max: 1.6 } as const;

/** Ticks a hit keeps the water parted. */
export const WATER_PARTED_TICKS = 150;

/** Units below their collision line the wizard and the props are drawn. */
export const SPRITE_FOOT_OFFSET = 2;

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
