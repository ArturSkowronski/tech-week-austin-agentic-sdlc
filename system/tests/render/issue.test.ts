// The prefilled issue the ticket card opens: every section of the report is
// there, and the file the defect is in is not (ADR-006,
// docs/plan/02-design/bug-quest.md, the issue). HWP-053's acceptance in words.
//
// The URL is read back the way GitHub reads it, by parsing it, so the test
// asserts what the form is filled with and not how the query was spelled.

import { describe, expect, it } from 'vitest';

import { issueBug, issueUrl } from '../../game/render/issue';
import type { PlantedBug } from '../../game/sim';
import { worldFrom } from '../sim/helpers';

/** The manifest entry of bug-quest.md, word for word. */
const HW_001: PlantedBug = {
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
};

const ROOM = `
  #        #
  #   P    #
  ##########
`;

const world = worldFrom(ROOM, { roomName: 'forest-glade' });
const bug = issueBug(HW_001);

if (bug === null) {
  throw new Error('the fixture is a planted entry, so it narrows to an issue bug');
}

const url = new URL(issueUrl(bug, world));
const body = url.searchParams.get('body') ?? '';

describe('the prefilled issue', () => {
  it('drops the defect’s file and its paired test before the body is built', () => {
    // The narrowing is the rule, not the assertion below: `issueUrl` cannot be
    // handed `module` or `test` at all (ADR-006).
    expect(Object.keys(bug).sort()).toEqual([
      'clue',
      'expected',
      'id',
      'logs',
      'steps',
      'symptom',
      'title',
    ]);
    expect(issueBug(undefined)).toBeNull();
  });

  it('opens the new-issue form of a repository, titled and labelled', () => {
    expect(url.origin + url.pathname).toMatch(/^https:\/\/github\.com\/[^/]+\/[^/]+\/issues\/new$/);
    expect(url.searchParams.get('title')).toBe(`HW-001: ${HW_001.title}`);
    expect(url.searchParams.get('labels')).toBe('bug,planted');
  });

  it('carries every section of the report', () => {
    for (const heading of ['Symptom', 'Where', 'Steps', 'Expected', 'Actual', 'Clue', 'Logs']) {
      expect(body).toContain(`## ${heading}`);
    }
  });

  it('fills them from the manifest entry and from the run', () => {
    expect(body).toContain('## Symptom\n\nLeft and right feel swapped.');
    expect(body).toContain(`## Where\n\nRoom forest-glade, tick ${world.tick}, player `);
    expect(body).toContain('## Expected\n\nThe wizard walks right.');
    expect(body).toContain('## Actual\n\nLeft and right feel swapped.');
    expect(body).toContain('## Clue\n\ninput handling');
  });

  it('starts the reproduction in the room the run was in', () => {
    expect(body).toContain(
      '## Steps\n\n1. Start a run in forest-glade.\n2. Walk through the bush; ' +
        'the creature jumps on.\n3. Hold right.',
    );
  });

  it('shows the lines the waterfall showed', () => {
    expect(body).toContain(['## Logs', '', '```', ...HW_001.logs, '```'].join('\n'));
  });

  it('never names the file the defect is in, anywhere in the URL', () => {
    // The whole URL decoded, not the body alone: `module` and `test` are the
    // two fields that could leak the answer, and neither belongs in the form.
    const decoded = decodeURIComponent(url.href);

    expect(decoded).not.toContain('game/sim');
    expect(decoded).not.toContain(HW_001.test);
  });
});
