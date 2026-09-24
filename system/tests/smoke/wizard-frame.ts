// The one reader of the `data-wizard` report game/render/wizard.ts publishes.
// Two specs measure against that frame — the wand light's own, and the layer
// stack's, which has to leave the wizard's block out of its colour counts —
// and one format deserves one parser (AGENTS.md rule 9).

import type { Page } from '@playwright/test';

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
async function fieldsOf(page: Page, name: string): Promise<Map<string, string>> {
  const report = (await page.locator('#game canvas').getAttribute(`data-${name}`)) ?? '';

  return new Map(
    report.split(' ').map((field) => {
      const [key, value] = field.split('=');

      return [key ?? '', value ?? ''];
    }),
  );
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
