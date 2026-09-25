// The two-way planted-bug check of ADR-005, run by `pnpm bugs:check` and by
// CI. A planted bug is an entry in bugs/manifest.json paired with a test under
// bugs/tests/ that describes the correct behaviour and therefore fails while
// the entry exists. Both directions are enforced, so a fix cannot pass CI
// unless it is the whole fix:
//
//   a listed bug whose test passes  — the module was corrected but the
//                                     manifest entry was left behind;
//   an unlisted test that fails     — the entry was deleted but the module
//                                     still has the defect;
//   a listed test that fails on
//   anything but an assertion       — a test that cannot load proves nothing.
//
// What it cannot see is a paired test edited to pass; reviewers reject that.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { PlantedBug } from '../../game/sim';

/** The repository this tool lives in. */
const REPO = fileURLToPath(new URL('../../', import.meta.url));

/** All the check needs of a manifest entry. */
type Entry = Pick<PlantedBug, 'id' | 'test'>;

/** What one file under bugs/tests/ did in a run. */
interface PairedTest {
  /** Its path from the root of the run, as the manifest writes it. */
  file: string;
  passed: boolean;
  /** Why it failed, first line, empty when it passed. */
  failure: string;
  /** It failed on an assertion — the only failure that proves a planted bug. */
  assertion: boolean;
}

/** The shape of Vitest's JSON report that this tool reads. */
interface Report {
  testResults: {
    name: string;
    status: string;
    message: string;
    assertionResults: { failureMessages: string[] }[];
  }[];
}

/** Vitest reports a failed `expect()` as an AssertionError, and nothing else as one. */
function isAssertion(message: string): boolean {
  return /^\w*AssertionError\b/.test(message);
}

function firstLine(message: string): string {
  return message.split('\n')[0] ?? '';
}

/** Run the paired tests of the repository at `root` and say what each file did. */
function runPairedTests(root: string): PairedTest[] {
  const directory = mkdtempSync(join(tmpdir(), 'bugs-check-'));
  const outputFile = join(directory, 'report.json');

  try {
    // The tests are meant to fail, so the run's own exit code says nothing;
    // the JSON report is the answer. The config is the repository's, pointed
    // at `root`, which is how the fixtures of tests/tools/bugs-check.test.ts
    // check a repository other than this one.
    const run = spawnSync(
      join(REPO, 'node_modules/.bin/vitest'),
      ['run', '--root', root, '--config', join(REPO, 'vitest.bugs.config.ts'), '--reporter=json', '--outputFile', outputFile],
      { cwd: REPO, encoding: 'utf8' },
    );

    if (!existsSync(outputFile)) {
      throw new Error(`the paired tests wrote no report:\n${run.stderr}`);
    }

    const report = JSON.parse(readFileSync(outputFile, 'utf8')) as Report;

    return report.testResults.map((suite) => {
      const failures = suite.assertionResults.flatMap((assertion) => assertion.failureMessages);

      return {
        file: relative(root, suite.name),
        passed: suite.status === 'passed',
        // A file that failed to load ran no test, so its reason is the suite's.
        failure: firstLine(failures[0] ?? suite.message),
        assertion: failures.length > 0 && failures.every(isAssertion),
      };
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** One line per planted bug, and every way the pairing is broken. */
function checkPairing(entries: readonly Entry[], tests: readonly PairedTest[]): { lines: string[]; problems: string[] } {
  const lines: string[] = [];
  const problems: string[] = [];
  const byFile = new Map(tests.map((test) => [test.file, test]));

  for (const entry of entries) {
    const test = byFile.get(entry.test);

    if (!test) {
      problems.push(`${entry.id}: ${entry.test} is missing; every listed bug is paired with a test that fails.`);
    } else if (test.passed) {
      problems.push(`${entry.id}: ${entry.test} passes; delete the manifest entry in the same pull request as the fix.`);
    } else if (!test.assertion) {
      problems.push(`${entry.id}: ${entry.test} fails on "${test.failure}", not an assertion, so it proves nothing.`);
    } else {
      lines.push(`${entry.id}  ${entry.test}  fails as planted: ${test.failure}`);
    }
  }

  const listed = new Set(entries.map((entry) => entry.test));

  for (const test of tests) {
    if (!listed.has(test.file) && !test.passed) {
      problems.push(`${test.file}: fails but no manifest entry lists it; finish the fix or put the entry back.`);
    }
  }

  return { lines, problems };
}

/** `--root <path>` checks another repository; the fixtures of tests/tools/bugs-check.test.ts use it. */
const flag = process.argv.indexOf('--root');
const given = flag === -1 ? REPO : process.argv[flag + 1];

// A `--root` with no path used to fall back to this repository and print a
// clean world to someone who believed they had checked another tree.
if (given === undefined) {
  throw new Error('--root needs a path; leave the flag off to check this repository.');
}

// Vitest names its suites with symlinks resolved, so the `relative()` above
// only spells a path the way the manifest does when the root is canonical too.
// macOS tmpdir() is a symlink, which is how this tool's own fixtures hit it.
const root = realpathSync(given);

const entries = (JSON.parse(readFileSync(join(root, 'bugs/manifest.json'), 'utf8')) as { bugs: Entry[] }).bugs;
const { lines, problems } = checkPairing(entries, runPairedTests(root));

process.stdout.write(lines.length > 0 ? `${lines.join('\n')}\n` : 'No planted bugs listed; the world is clean.\n');

for (const problem of problems) {
  process.stderr.write(`${problem}\n`);
}

process.exitCode = problems.length > 0 ? 1 : 0;
