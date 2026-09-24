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

/** One background layer of the stack, back to front. */
export interface Layer {
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
  mountains: { parallaxX: 0.05, parallaxY: 0.05, bottomOffset: 100, alpha: 0.85, tint: 1 },
  tallForest: { parallaxX: 0.3, parallaxY: 0.6, bottomOffset: 124, alpha: 1, tint: 0.7 },
  bushesBehind: { parallaxX: 0.6, parallaxY: 1, bottomOffset: 62, alpha: 1, tint: 0.7 },
  bushesFront: { parallaxX: 1.3, parallaxY: 1, bottomOffset: 64, alpha: 1, tint: 1 },
} as const satisfies Record<string, Layer>;

/** Art rows of the mountains, above their base. */
export const MOUNTAIN_ART_ROWS = 103;

/** Rows of the mountains' base, whose colour also fills below the horizon. */
export const MOUNTAIN_BASE_ROWS = 120;

/** Rows taken from the top of the undergrowth for the bushes in front. */
export const BUSHES_FRONT_ROWS = 76;

/** Height of one band of the sky's stepped gradient, in world units. */
export const SKY_BAND_H = 6;

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
