// The sentences a planted manifest produces, from bugs/manifest.json through
// the reader to the waterfall's lines and the card's faces — the path
// game/main.ts wires together, and HWP-052's acceptance in words.
//
// The repository's own manifest is empty until HWP-054 plants HW-001, so the
// entry of docs/plan/02-design/bug-quest.md stands in for it here. Only the
// manifest is stood in for: the reader, the mapping and the faces under test
// are the real ones, so the day the entry lands nothing here has to change.

import { describe, expect, it, vi } from 'vitest';

import { cardBug, cardFace } from '../../game/render/ticket';
import { logLines } from '../../game/render/waterfall';
import { bugForRoom, type PlantedBug } from '../../game/sim';

/** The manifest entry of bug-quest.md, word for word. */
const HW_001 = vi.hoisted(() => ({
  id: 'HW-001',
  title: 'Left and right swap while the creature rides',
  symptom: 'Left and right feel swapped.',
  clue: 'input handling',
  module: 'game/sim/input-map.ts',
  test: 'bugs/tests/hw-001-input-map.test.ts',
  rooms: ['forest-glade'],
  creature: { hides: 'bush' },
  steps: ['Walk through the bush; the creature jumps on.', 'Hold right.'],
  expected: 'The wizard walks right.',
  logs: [
    '[input] left/right mapping: INVERTED',
    '[input] axis sign flipped while carrying',
    '[bug] hides in: input handling',
  ],
}));

vi.mock('../../bugs/manifest.json', () => ({ default: { bugs: [HW_001] } }));

const planted = bugForRoom('forest-glade') as PlantedBug;
const bug = cardBug(planted);

describe('the glade with HW-001 planted', () => {
  it('hands the waterfall the log lines of the beat, marked as the real ones', () => {
    const real = logLines(planted.logs).filter((line) => line.real);

    expect(real.map((line) => line.text)).toEqual(HW_001.logs);
  });

  it('mentions the bug and its hiding place once the logs are read', () => {
    expect(cardFace({ bug, felt: false, logsRead: true })).toEqual({
      text: 'The logs mention a bug in input handling. It hides in the bush.',
      button: false,
    });
  });

  it('names the bug and offers the way out once the logs are read and it is felt', () => {
    expect(cardFace({ bug, felt: true, logsRead: true })).toEqual({
      text:
        'The logs name your bug: HW-001 Left and right swap while the creature rides. ' +
        'Raise a ticket.',
      button: true,
    });
  });

  it('never hands the card the file the defect is in', () => {
    expect(JSON.stringify(bug)).not.toContain(planted.module);
  });
});
