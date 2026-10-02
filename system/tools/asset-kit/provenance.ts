// What a raw is, and which raws the provenance record accounts for
// (docs/plan/03-assets/pipeline.md, invariants). The report asks here, the
// build asks here, and a test can read it without running a script.

import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

/** The raw art, and the record of how it was made, which is not one of them. */
export const RAWS = 'assets';
export const RECORD = 'PROVENANCE.md';

/** The record's table: `File | What it is | Becomes`. */
const COLUMNS = 3;

/**
 * Every raw in `assets/`, by its path from there: the art at the top level and
 * the sounds in `audio/`, the record itself apart. A folder is read through,
 * so `audio/jump.mp3` is one raw and `audio` is not — which is the name the
 * record's own rows carry and the name the build marks as read.
 */
export async function rawNames(): Promise<string[]> {
  const entries = await readdir(RAWS, { recursive: true, withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name !== RECORD)
    .map((entry) => join(relative(RAWS, entry.parentPath), entry.name));
}

/**
 * The cells of a table row, or nothing if the line is not one: a row is
 * delimited at both ends and carries the table's columns, so neither prose
 * that happens to start with a bar nor a half-written `| tileset.png` counts.
 */
function cellsOf(line: string): string[] | undefined {
  const text = line.trim();

  if (!text.startsWith('|') || !text.endsWith('|')) return undefined;

  const cells = text.slice(1, -1).split('|');

  return cells.length === COLUMNS ? cells.map((cell) => cell.trim()) : undefined;
}

/** Every raw the record's tables name in no first column, in the order given. */
export function rawsWithoutProvenance(raws: readonly string[], record: string): string[] {
  const rows = new Set(
    record
      .split('\n')
      .map(cellsOf)
      .filter((cells) => cells !== undefined)
      .map((cells) => cells[0]),
  );

  return raws.filter((raw) => !rows.has(raw));
}
