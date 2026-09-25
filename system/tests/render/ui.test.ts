// The rules the UI is judged by, away from the canvas: which of the four faces
// the ticket card shows, when it can be waved away, what the banner says at
// the beacon, what the HUD line reads, and the one thing Enter does mid-run.
// The drawing itself is measured in a browser, in tests/smoke/ui.spec.ts.

import { describe, expect, it } from 'vitest';

import { TICK_RATE } from '../../game/sim/index';
import { hudLine } from '../../game/render/hud';
import type { InputEdges } from '../../game/render/input';
import { UI_GLYPH, UI_SIZES } from '../../game/render/config';
import { bannerLines, glyphOf, motifOrigins } from '../../game/render/panel';
import { canDismiss, cardFace, type CardBug } from '../../game/render/ticket';
import { startsRun } from '../../game/render/title';
import { worldFrom } from '../sim/helpers';

const ROOM = `
  #        #
  #   P    #
  ##########
`;

/** The manifest's first planted bug, as the card receives it (bug-quest.md). */
const BUG: CardBug = {
  id: 'HW-001',
  title: 'Left and right swap while the creature rides',
  clue: 'input handling',
  hides: 'bush',
};

function edges(pressed: Partial<InputEdges>): InputEdges {
  return { start: false, restart: false, debug: false, ...pressed };
}

describe('the ticket card', () => {
  it('says what is wrong once the bug is felt, and offers nothing yet', () => {
    expect(cardFace({ bug: BUG, felt: true, logsRead: false })).toEqual({
      text: 'Something is wrong with input handling.',
      button: false,
    });
  });

  it('names the clue and the hiding place once the logs are read', () => {
    expect(cardFace({ bug: BUG, felt: false, logsRead: true })).toEqual({
      text: 'The logs mention a bug in input handling. It hides in the bush.',
      button: false,
    });
  });

  it('names the bug and offers the button once both halves are known', () => {
    expect(cardFace({ bug: BUG, felt: true, logsRead: true })).toEqual({
      text: `The logs name your bug: ${BUG.id} ${BUG.title}. Raise a ticket.`,
      button: true,
    });
  });

  it('says the logs are clean when the manifest holds no bug for the room', () => {
    expect(cardFace({ bug: null, felt: false, logsRead: false })).toEqual({
      text: 'The logs are clean.',
      button: false,
    });
  });

  it('has nothing to say before either half is known', () => {
    expect(cardFace({ bug: BUG, felt: false, logsRead: false })).toBeNull();
  });

  it('ignores the last press before three seconds and takes the first after', () => {
    // Three seconds counted out in ticks, not read back from the constant the
    // card uses: retuning that constant is meant to fail here.
    expect(canDismiss(3 * TICK_RATE - 1)).toBe(false);
    expect(canDismiss(3 * TICK_RATE)).toBe(true);
  });
});

describe('the completion banner', () => {
  it('reads the run off victoryTick and the deaths', () => {
    const world = worldFrom(ROOM);

    world.victoryTick = 83 * TICK_RATE + 45;
    world.deaths = 2;

    expect(bannerLines(world)).toEqual(['The beacon is lit', 'Time 1:23.8', 'Deaths 2']);
  });

  // The seam the minutes turn on: a run that ends two ticks short of a minute
  // rounds up to it, and must say the minute, never the 0:60.0 that is not a
  // time. Both sides of the seam, and both sides of the second one.
  it('never shows a sixtieth second at the minute boundary', () => {
    const time = (ticks: number): string => {
      const world = worldFrom(ROOM);

      world.victoryTick = ticks;

      return bannerLines(world)[1] ?? '';
    };

    expect(time(60 * TICK_RATE - 2)).toBe('Time 1:00.0');
    expect(time(60 * TICK_RATE)).toBe('Time 1:00.0');
    expect(time(120 * TICK_RATE - 2)).toBe('Time 2:00.0');
    expect(time(0)).toBe('Time 0:00.0');
    expect(time(59 * TICK_RATE + 55)).toBe('Time 0:59.9');
  });
});

describe('the HUD line', () => {
  it('is the room name, and behind F1 the state the run is in', () => {
    const world = worldFrom(ROOM, { roomName: 'forest-glade' });

    expect(hudLine(world, false)).toBe('forest-glade');

    const debug = hudLine(world, true);

    expect(debug).toContain('forest-glade');
    expect(debug).toContain(`${world.player.state} ${world.player.stateTimer}`);
    expect(debug).toContain(`tick ${world.tick}`);
  });
});

describe('the title screen', () => {
  it('is left on Enter, Space or Z', () => {
    expect(startsRun(edges({ start: true }), false)).toBe(true);
  });

  it('is not left twice: during a run those keys do nothing', () => {
    expect(startsRun(edges({ start: true }), true)).toBe(false);
  });

  it('is not left by R, which is the key that starts a run over', () => {
    expect(startsRun(edges({ restart: true }), false)).toBe(false);
  });
});

describe("the UI's pixel font", () => {
  /** Every character a keyboard can type, which is every one a manifest can. */
  const PRINTABLE = Array.from({ length: 95 }, (_, index) => String.fromCharCode(0x20 + index));

  it('inks a glyph of the same cell for every printable character', () => {
    // The card's lines are written in bugs/manifest.json, so the font has to
    // carry whatever a bug is called. The ink is what says so: the blank it
    // falls back to is the same cell as a real glyph, and a character the font
    // lacks would pass a test on the rows alone.
    for (const char of PRINTABLE) {
      const rows = glyphOf(char);

      expect(rows, `glyph for ${char}`).toHaveLength(UI_GLYPH.h);

      for (const row of rows) {
        expect(row, `row of ${char}`).toHaveLength(UI_GLYPH.w);
      }

      if (char !== ' ') {
        expect(rows.join(''), `ink for ${char}`).toContain('#');
      }
    }
  });

  it('leaves the space, and a character it does not hold, an empty cell', () => {
    // Blank rather than missing: a line keeps its length whatever is written
    // in it. This is also what makes the test above able to fail.
    for (const char of [' ', '\u00a3']) {
      expect(glyphOf(char).join(''), `ink for ${char}`).not.toContain('#');
    }
  });
});

describe("the chrome's leaf border", () => {
  // The leaf is five pixels across, so at an odd UI scale half of it is half a
  // window pixel. Rounding the centre and then subtracting that half puts the
  // leaf's own pixels off the window grid; art-direction.md asks for square
  // pixels on a uniform grid, and with antialias off that offset is resolved
  // by the rasteriser's fill rule rather than by this code. Origins are what
  // the drawing actually uses, so origins are what must be whole.
  const SCALES = [1, 2, 3, 4];
  const SPANS = [240, 317, 480, 961];

  it('starts every leaf on a whole window pixel, at every scale', () => {
    for (const scale of SCALES) {
      const leaf = 5 * scale;
      const step = UI_SIZES.leafStep * scale;

      for (const span of SPANS) {
        for (const origin of motifOrigins(span, step, leaf)) {
          expect(Number.isInteger(origin), `origin ${origin} at scale ${scale} over ${span}`).toBe(
            true,
          );
        }
      }
    }
  });

  it('keeps the run centred and evenly stepped', () => {
    const origins = motifOrigins(240, 36, 15);

    expect(origins).toHaveLength(6);

    // Symmetric about the span: the gap before the first leaf equals the gap
    // after the last, to within the whole pixel the rounding may take.
    const first = origins[0] ?? 0;
    const last = origins.at(-1) ?? 0;

    expect(Math.abs(first - (240 - (last + 15)))).toBeLessThanOrEqual(1);

    for (let index = 1; index < origins.length; index += 1) {
      expect((origins[index] ?? 0) - (origins[index - 1] ?? 0)).toBe(36);
    }
  });

  it('draws one leaf on a span too narrow for a full step', () => {
    expect(motifOrigins(20, 36, 15)).toHaveLength(1);
  });
});
