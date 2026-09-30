// The wizard on screen (docs/plan/02-design/rendering-and-look.md, Sprites;
// docs/plan/03-assets/asset-list.md, wizard). Which cell of which strip he
// shows is a pure function of his state, the ticks he has spent in it and the
// ticks he has been falling — never of wall time — so a replay draws the same
// frames twice.
//
// The crystal is the wizard's light (art-direction.md). The kit records where
// it is drawn in every cell, and the additive glow hangs on that point, so it
// rides the wand through the whole animation instead of sitting at a guess.

import { Container, Graphics, Sprite } from 'pixi.js';

import {
  CHARGE_WINDUP_TICKS,
  LAND_TICKS,
  LONG_FALL_TICKS,
  PLAYER_HEIGHT,
  PLAYER_WIDTH,
  VICTORY_CAST_FRAME_TICKS,
  type Player,
  type Vec2,
} from '../sim';

import { wholePixels, type Camera } from './camera';
import { SPRITE_FOOT_OFFSET, TAKE_OFF_TICKS, WAND_LIGHT, WIZARD_FPS } from './config';
import { cycle, loadManifest, loadStrip, type Strip } from './sprites';

/** The strips the kit writes, and the states that borrow each of them. */
const SHEETS = ['idle', 'run', 'jump', 'fall', 'charge', 'victory'] as const;

/** One of {@link SHEETS}. */
export type Sheet = (typeof SHEETS)[number];

/**
 * The jump sheet's seven poses, in the order asset-list.md lists them. The
 * simulation uses three of them; the rest are named so the sheet reads as the
 * sheet rather than as a row of numbers.
 */
const JUMP = {
  stand: 0,
  squash: 1,
  takeOff: 2,
  airUp: 3,
  airDown: 4,
  landing: 5,
  recovery: 6,
} as const;

/** The fall sheet's first pose; the flailing ones follow it. */
const FALL_AIR_DOWN = 0;

/** One drawn frame: the strip it comes from and the cell of that strip. */
export interface Pose {
  readonly sheet: Sheet;
  readonly frame: number;
}

/** How many cells each strip holds, as the manifest recorded them. */
export type Cells = Readonly<Record<Sheet, number>>;

/** The cell a frame is drawn in, top-left corner, in world units. */
export interface Cell extends Vec2 {
  readonly w: number;
  readonly h: number;
}

/**
 * What the wizard draws for one player state, in world units of the room —
 * the camera has not been taken off them. `report` below publishes the same
 * two fields in view units, with the camera subtracted, which is what a test
 * clipping a screenshot wants; these are the ones a test placing him in the
 * world wants. They read alike, so each says which it is.
 */
export interface WizardFrame extends Pose {
  /** The cell, in world units; add nothing, subtract the camera to draw it. */
  readonly cell: Cell;
  /** Where the wand's crystal stands, and with it the light, in world units. */
  readonly light: Vec2;
}

/**
 * The frame one player state shows. Two states have no sheet of their own yet
 * (asset-list.md marks chargeRecoil and hurt "to draw"), so each borrows a
 * pose that is at least true of the moment: the recoil keeps him astride the
 * wand, and hurt holds still rather than inventing a flash.
 *
 * `land` and the flail read `fellFor` rather than `stateTimer` because they
 * are about the drop that just ended, not about the state that follows it.
 */
export function poseFor(player: Player, cells: Cells): Pose {
  const { fellFor, state, stateTimer } = player;

  switch (state) {
    case 'run':
      return { sheet: 'run', frame: cycle(stateTimer, WIZARD_FPS.run, cells.run) };

    case 'jump':
      return { sheet: 'jump', frame: stateTimer < TAKE_OFF_TICKS ? JUMP.takeOff : JUMP.airUp };

    case 'fall':
      // He sinks on the air-down pose, and flails once the drop is a long one.
      return {
        sheet: 'fall',
        frame:
          fellFor < LONG_FALL_TICKS
            ? FALL_AIR_DOWN
            : cycle(fellFor - LONG_FALL_TICKS, WIZARD_FPS.flail, cells.fall, FALL_AIR_DOWN + 1),
      };

    case 'land':
      // A long drop lands hard, in the dust of the fall sheet's last pose;
      // anything shorter plays the jump sheet's landing and then its recovery.
      return fellFor >= LONG_FALL_TICKS
        ? { sheet: 'fall', frame: cells.fall - 1 }
        : { sheet: 'jump', frame: stateTimer * 2 < LAND_TICKS ? JUMP.landing : JUMP.recovery };

    case 'charge':
      // Frame one is the wind-up and is held for it; the rest loop.
      return {
        sheet: 'charge',
        frame:
          stateTimer < CHARGE_WINDUP_TICKS
            ? 0
            : cycle(stateTimer - CHARGE_WINDUP_TICKS, WIZARD_FPS.charge, cells.charge, 1),
      };

    case 'chargeRecoil':
      return { sheet: 'charge', frame: 0 };

    case 'hurt':
      return { sheet: 'idle', frame: 0 };

    case 'victory':
      // The cast plays its eight poses once and holds the last, and it holds
      // each for the same ticks the simulation counts the beam's landing in,
      // so the beam frame is the frame the beacon lights on (level-design.md,
      // the beacon ends the run).
      return {
        sheet: 'victory',
        frame: Math.min(
          Math.floor(stateTimer / VICTORY_CAST_FRAME_TICKS),
          cells.victory - 1,
        ),
      };

    case 'idle':
      return { sheet: 'idle', frame: cycle(stateTimer, WIZARD_FPS.idle, cells.idle) };
  }
}

/**
 * The scale one of the kit's strips is drawn at. The cell a frame is measured
 * into, and the crystal placed in it, are both in world units, so the texture
 * — which is cut at the file's own pixels — is brought back to world units by
 * the strip's density (ADR-003: "the renderer scales by the manifest's
 * density"). Facing mirrors the horizontal axis on top of that.
 *
 * The five wizard strips are at density 2 since HWP-043, so this halves both
 * axes for all of them; art the manifest records no density for still comes
 * back as the identity. The two halves have to agree: `crystalOf` divides the
 * crystal point by the same density, and a draw that did not would put the
 * glow off the wand with every gate still green.
 */
export function scaleFor(density: number, facing: 1 | -1): Vec2 {
  return { x: facing / density, y: 1 / density };
}

/** The wizard's two nodes and what they are drawing. */
export interface WizardView {
  /** The sprite, for the layer the player is drawn on. */
  readonly view: Container;
  /** The wand light, for the additive layer above it. */
  readonly light: Container;
  /** The frame this player state draws, without drawing it. */
  read(player: Player): WizardFrame;
  /** Put the wizard and his light where this player is, and say what it drew. */
  update(player: Player, camera: Camera): WizardFrame;
  /** What was last drawn, in view units, measured off the frame itself. */
  report(): string;
}

/** The additive glow of the crystal: rings of equal alpha, brightest inside. */
function createGlow(): Graphics {
  const glow = new Graphics();

  for (let ring = WAND_LIGHT.rings; ring > 0; ring -= 1) {
    glow
      .circle(0, 0, (WAND_LIGHT.radius * ring) / WAND_LIGHT.rings)
      .fill({ color: WAND_LIGHT.colour, alpha: WAND_LIGHT.alpha / WAND_LIGHT.rings });
  }

  glow.blendMode = 'add';

  return glow;
}

/** Load every wizard strip and hand back the two nodes that draw him. */
export async function createWizard(): Promise<WizardView> {
  const manifest = await loadManifest();
  const loaded = await Promise.all(
    SHEETS.map((sheet) => loadStrip(manifest, `sprites/wizard-${sheet}`)),
  );
  const strips = Object.fromEntries(
    SHEETS.map((sheet, at) => [sheet, loaded[at]]),
  ) as Readonly<Record<Sheet, Strip>>;
  const cells = Object.fromEntries(
    SHEETS.map((sheet) => [sheet, strips[sheet].frames.length]),
  ) as Cells;

  const sprite = new Sprite();
  const glow = createGlow();

  // Every pose stands bottom-centre in its cell, so the sprite is hung from
  // that same corner and flipping it by facing mirrors the cell in place.
  sprite.anchor.set(0.5, 1);

  let shown = '';

  function read(player: Player): WizardFrame {
    const pose = poseFor(player, cells);
    const strip = strips[pose.sheet];
    // Which column of the cell goes on him: the strip's reference column,
    // mirrored about the cell when he faces left, exactly as the sprite and
    // the crystal are mirrored. A centred strip's column is its own middle, so
    // this is the cell's half for every sheet but the cast's, which hangs 32
    // more units off to the right of a 32-unit cell for its beam.
    const stands = player.facing === 1 ? strip.anchor : strip.cellW - strip.anchor;
    // The cell is put on the render texture's whole pixels, the way the
    // camera is, so the art never lands half a pixel over (ADR-003). The feet
    // go two units below the collision line, so they meet the drawn ground.
    const cell = {
      x: wholePixels(player.x + PLAYER_WIDTH / 2 - stands),
      y: wholePixels(player.y + PLAYER_HEIGHT + SPRITE_FOOT_OFFSET - strip.cellH),
      w: strip.cellW,
      h: strip.cellH,
    };
    const crystal = strip.crystal(pose.frame, player.facing);

    return { ...pose, cell, light: { x: cell.x + crystal.x, y: cell.y + crystal.y } };
  }

  return {
    view: sprite,
    light: glow,
    read,

    update(player: Player, camera: Camera): WizardFrame {
      const frame = read(player);
      const { cell, light } = frame;

      const strip = strips[frame.sheet];
      const texture = strip.frames[frame.frame];

      // Keeping the last cell here would move the light to the new frame's
      // crystal while the old pose stayed on screen — the very "light off the
      // wand" this ticket's second acceptance line exists to catch, and it
      // would show up as a picture rather than as a failure. So it refuses,
      // the way crystalOf does for a frame it has no crystal for.
      if (texture === undefined) {
        throw new Error(
          `the ${frame.sheet} strip of ${strip.frames.length} frames has no frame ${frame.frame}`,
        );
      }

      const scale = scaleFor(strip.density, player.facing);

      sprite.texture = texture;
      sprite.scale.set(scale.x, scale.y);
      sprite.position.set(cell.x + cell.w / 2, cell.y + cell.h);
      glow.position.set(light.x, light.y);

      shown =
        `pose=${frame.sheet}:${frame.frame}` +
        ` cell=${cell.x - camera.x},${cell.y - camera.y},${cell.w},${cell.h}` +
        ` light=${light.x - camera.x},${light.y - camera.y}`;

      return frame;
    },

    report(): string {
      return shown;
    },
  };
}
