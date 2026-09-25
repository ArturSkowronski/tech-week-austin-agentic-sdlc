// The two-way planted-bug check (ADR-005). Every case is a whole little
// repository in a temporary directory — a manifest and the test file it names
// — that tools/bugs/check.ts is pointed at with --root. What is asserted is
// the exit code, the way CI judges the gate, and the wording a reader gets.

import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, onTestFinished } from 'vitest';

const REPO = fileURLToPath(new URL('../../', import.meta.url));

/** The paired test of the fixture, named the way the manifest names one. */
const PAIRED = 'bugs/tests/hw-001-input-map.test.ts';

/** The entry a manifest carries while the bug is planted. */
const ENTRY = { id: 'HW-001', test: PAIRED };

/** The bug is fixed: the test that describes the correct behaviour passes. */
const FIXED = `
import { expect, it } from 'vitest';
it('walks right while carried', () => { expect('right').toBe('right'); });
`;

/** The bug is still there: the same test fails, on an assertion. */
const PLANTED = `
import { expect, it } from 'vitest';
it('walks right while carried', () => { expect('left').toBe('right'); });
`;

/** The test cannot even load, so it says nothing about the bug. */
const UNLOADABLE = `
import { axis } from '../../game/sim/no-such-module';
import { expect, it } from 'vitest';
it('walks right while carried', () => { expect(axis).toBe('right'); });
`;

/** A repository of one manifest and one paired test, removed after the test. */
function repository(bugs: readonly unknown[], paired: string): string {
  const root = mkdtempSync(join(tmpdir(), 'bugs-fixture-'));

  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'bugs/tests'), { recursive: true });
  writeFileSync(join(root, 'bugs/manifest.json'), JSON.stringify({ bugs }));
  writeFileSync(join(root, PAIRED), paired);

  return root;
}

/** The check itself, run the way `pnpm bugs:check` runs it. */
function run(...args: readonly string[]) {
  return spawnSync(join(REPO, 'node_modules/.bin/tsx'), ['tools/bugs/check.ts', ...args], {
    cwd: REPO,
    encoding: 'utf8',
  });
}

/** Run the check over one of those repositories. */
function check(bugs: readonly unknown[], paired: string) {
  return run('--root', repository(bugs, paired));
}

describe('the two-way planted-bug check', { timeout: 120_000 }, () => {
  it('fails a fix that forgot to delist', () => {
    const result = check([ENTRY], FIXED);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('HW-001');
    expect(result.stderr).toContain('delete the manifest entry');
  });

  it('fails a delist that forgot to fix', () => {
    const result = check([], PLANTED);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(PAIRED);
    expect(result.stderr).toContain('no manifest entry lists it');
  });

  it('passes a fix that delisted', () => {
    const result = check([], FIXED);

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  it('fails a listed test that does not fail on an assertion', () => {
    const result = check([ENTRY], UNLOADABLE);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('not an assertion');
  });

  it('passes a planted bug and prints its line', () => {
    const result = check([ENTRY], PLANTED);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`HW-001  ${PAIRED}`);
  });

  it('reads a root reached through a symlink', () => {
    // Vitest names its suites with symlinks resolved, so a root spelled through
    // one used to report every paired test as both missing and unlisted. macOS
    // tmpdir() is such a symlink, which is how this suite itself hit it.
    const real = repository([ENTRY], PLANTED);
    const directory = mkdtempSync(join(tmpdir(), 'bugs-link-'));
    const link = join(directory, 'repository');

    onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
    symlinkSync(real, link);

    const result = run('--root', link);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`HW-001  ${PAIRED}`);
  });

  it('refuses --root without a path', () => {
    const result = run('--root');

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--root needs a path');
  });
});
