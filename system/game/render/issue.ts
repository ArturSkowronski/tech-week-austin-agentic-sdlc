// The way out of the ticket card: the prefilled GitHub issue the player opens
// from the button or the T key (ADR-006, docs/plan/02-design/bug-quest.md, the
// issue). It is the whole report path until a gateway Worker exists, and a
// gateway would replace this URL, not the card above it.
//
// The sections are the report Visdom starts a fix from. The manifest entry
// also carries the defect's file and its paired test, and neither reaches the
// builder: reasoning from the symptom to the module is the work, and a ticket
// that names the module has given it away. `issueBug` drops both fields first,
// so the type carries that rule and the unit test's string assertion is the
// backstop rather than the only guard.

import type { PlantedBug, WorldState } from '../sim';

/**
 * The repository that receives tickets, as `owner/name`, from the build
 * variable of `.env.example`; vite.config.ts fills it from the clone's
 * `origin`, so a fork raises tickets on the fork. A build with neither falls
 * back to the game's own repository.
 */
const REPO: string = import.meta.env.VITE_GITHUB_REPO || 'VirtusLab/visdom-sandbox-hobby-wizard';

/**
 * The manifest's entry as the issue takes it: the seven fields of it that are
 * the player's. `module` and `test` are left behind here rather than in the
 * body builder, so the file the defect is in has no way into the form even if
 * a later section is added carelessly — the same narrowing `cardBug` does for
 * the screen (ADR-006, bug-quest.md, the issue).
 */
export interface IssueBug {
  id: string;
  title: string;
  symptom: string;
  /** A module-level hint, never a file. */
  clue: string;
  /** The reproduction the ticket carries, after "start a run in <room>". */
  steps: readonly string[];
  expected: string;
  /** The lines the waterfall showed. */
  logs: readonly string[];
}

/**
 * The room's entry as the issue needs it, or null when the manifest holds
 * none for the room — a clean room never reaches the face that offers the way
 * out, and the null is what tells the compiler so.
 */
export function issueBug(bug: PlantedBug | undefined): IssueBug | null {
  return bug === undefined
    ? null
    : {
        id: bug.id,
        title: bug.title,
        symptom: bug.symptom,
        clue: bug.clue,
        steps: bug.steps,
        expected: bug.expected,
        logs: bug.logs,
      };
}

/** One section of the body: a heading and what goes under it. */
function section(heading: string, body: string): string {
  return `## ${heading}\n\n${body}\n`;
}

/**
 * The body of the issue: what was felt, where the run was when it happened,
 * how to see it again, and the lines the waterfall showed.
 *
 * Symptom and Actual are the same sentence because the manifest has one for
 * both, and a ticket that leaves Actual empty is a ticket a reader has to
 * guess at.
 */
function issueBody(bug: IssueBug, state: WorldState): string {
  const steps = [`Start a run in ${state.roomName}.`, ...bug.steps];
  const at = `${Math.round(state.player.x)},${Math.round(state.player.y)}`;

  return [
    section('Symptom', bug.symptom),
    section('Where', `Room ${state.roomName}, tick ${state.tick}, player ${at}.`),
    section('Steps', steps.map((step, index) => `${index + 1}. ${step}`).join('\n')),
    section('Expected', bug.expected),
    section('Actual', bug.symptom),
    section('Clue', bug.clue),
    section('Logs', ['```', ...bug.logs, '```'].join('\n')),
  ].join('\n');
}

/** The prefilled issue for this bug, as the run stands right now. */
export function issueUrl(bug: IssueBug, state: WorldState): string {
  const query = new URLSearchParams({
    title: `${bug.id}: ${bug.title}`,
    // The two labels of ADR-006, which is what Visdom picks the issue up by.
    labels: 'bug,planted',
    body: issueBody(bug, state),
  });

  return `https://github.com/${REPO}/issues/new?${query.toString()}`;
}
