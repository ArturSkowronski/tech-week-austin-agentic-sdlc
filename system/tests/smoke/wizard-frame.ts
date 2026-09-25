// The readers of what the renderer publishes on the canvas: the `name=value`
// report format itself, which every one of its reports is written in, and the
// `data-wizard` frame game/render/wizard.ts writes in that format. The specs
// measuring against them — the wand light's own, the layer stack's, which has
// to leave the wizard's block out of its colour counts, and the room layer's —
// all read them from here, because one format deserves one parser
// (AGENTS.md rule 9).

import type { Page } from '@playwright/test';

import { CREATURE_EYES } from '../../game/render/config';
import type { Vec2 } from '../../game/sim/index';

/** A box of the view, in world units. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What the renderer published about the frame it drew, in view units. */
export interface Drawn {
  /** The strip the cell came from. */
  sheet: string;
  /** The cell of that strip. */
  frame: number;
  cell: Box;
  /** Where the wand light stands. */
  light: { x: number; y: number };
}

/** The fields of a `name=value name=value` report, by name. */
export async function fieldsOf(page: Page, name: string): Promise<Map<string, string>> {
  const report = (await page.locator('#game canvas').getAttribute(`data-${name}`)) ?? '';

  return new Map(
    report.split(' ').map((field) => {
      const [key, value] = field.split('=');

      return [key ?? '', value ?? ''];
    }),
  );
}

/**
 * Where the creature's eyes belong while it rides, in view units: the middle
 * of the wizard's cell, the hat's own height down it. Worked out from the
 * frame he published rather than asked of the renderer, so a shot of the eyes
 * is checked against an independent reading of the same point.
 */
export async function hatOf(page: Page): Promise<Vec2> {
  const { cell } = await wizardFrame(page);

  return { x: cell.x + cell.w / 2, y: cell.y + CREATURE_EYES.hat };
}

/** The numbers of one comma-separated field. */
function numbers(field: string | undefined): number[] {
  return (field ?? '').split(',').map(Number);
}

/** The frame the renderer last drew. */
export async function wizardFrame(page: Page): Promise<Drawn> {
  const fields = await fieldsOf(page, 'wizard');
  const [sheet = '', frame = ''] = (fields.get('pose') ?? '').split(':');
  const [x = 0, y = 0, w = 0, h = 0] = numbers(fields.get('cell'));
  const [lightX = 0, lightY = 0] = numbers(fields.get('light'));

  return {
    sheet,
    frame: Number(frame),
    cell: { x, y, w, h },
    light: { x: lightX, y: lightY },
  };
}
